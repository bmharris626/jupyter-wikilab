/**
 * WikiEditor — Split markdown editor with live preview.
 *
 * Renders a CodeMirror editor (left) and a rendered markdown preview
 * (right) inside a resizable split panel.
 *
 * ## Structure
 *
 * ```
 * ┌──────────────────────┬───────────────────────┐
 * │   CodeMirror Editor  │    Markdown Preview   │
 * │                      │                       │
 * │                      │                       │
 * │                      │                       │
 * │          |           │                       │
 * └──────────────────────┴───────────────────────┘
 * ```
 *
 * The split ratio is adjustable by dragging the divider.
 */

import { Transaction, StateEffect } from '@codemirror/state';

import { RangeSetBuilder } from '@codemirror/state';

import {
  EditorView,
  type ViewUpdate,
  keymap as cmKeymap,
  ViewPlugin,
  Decoration,
  type DecorationSet
} from '@codemirror/view';

import { markdown, markdownLanguage } from '@codemirror/lang-markdown';

import {
  defaultKeymap,
  history,
  indentWithTab,
  undo as cmUndo
} from '@codemirror/commands';

import { bracketMatching, foldGutter, foldKeymap } from '@codemirror/language';

import { searchKeymap } from '@codemirror/search';

import {
  autocompletion,
  completionKeymap,
  type CompletionContext,
  type CompletionResult
} from '@codemirror/autocomplete';

import { Panel, SplitPanel } from '@lumino/widgets';

import { ServerConnection } from '@jupyterlab/services';

import { jupyterTheme } from '@jupyterlab/codemirror';

import { Signal } from '@lumino/signaling';

import { render } from '../markdownRenderer';
import { savePage } from '../wikiApi';
import type { PageEntry } from '../types';

// ── CSS class namespace ─────────────────────────────────────────────────────

const CSS_PREFIX = 'jp-WikiEditor';

// Signals the broken-link ViewPlugin to re-decorate when the page list changes
const _pagesChangedEffect = StateEffect.define<null>();

// ── Public interface ────────────────────────────────────────────────────────

/** Data exposed by the WikiEditor panel. */
export interface IEditorPanel {
  /** Currently edited page metadata (or null). */
  readonly page: PageEntry | null;
  /** Current editor content. */
  readonly content: string;
  /** Whether the editor has unsaved changes. */
  readonly isDirty: boolean;
}

/** Arguments for the content-changed event. */
export interface ContentChangedArgs {
  /** The new content string. */
  content: string;
}

// ── WikiEditor widget ───────────────────────────────────────────────────────

/**
 * Split-pane wiki editor with live markdown preview.
 *
 * The left side hosts a CodeMirror 6 editor configured for markdown
 * editing. The right side renders the live preview using the project's
 * markdown-it renderer.
 */
export class WikiEditor extends SplitPanel implements IEditorPanel {
  // ── Construction ─────────────────────────────────────────────────────

  /**
   * Construct the wiki editor.
   */
  constructor() {
    super();
    this.addClass(CSS_PREFIX);
    this.title.caption = 'Wiki Editor';
    this.title.iconClass = 'lm-EditIcon';

    // Left: CodeMirror editor host
    this._createEditor();
    this.addWidget(this._editorHost);

    // Right: Markdown preview
    this._createPreview();
    this.addWidget(this._previewPanel);

    // Initial split ratio: ~50/50
    this.setRelativeSizes([1, 1]);
  }

  // ── IEditorPanel ─────────────────────────────────────────────────────

  get page(): PageEntry | null {
    return this._page;
  }

  set page(value: PageEntry | null) {
    this._page = value;
    this._pageLabel.textContent = value
      ? `${value.title || value.slug}`
      : 'Untitled';
  }

  get content(): string {
    return this._cmView.state.doc.toString();
  }

  get isDirty(): boolean {
    return this._isDirty;
  }

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Set the editor content programmatically.
   *
   * @param content — the markdown text to load
   * @param addToHistory — whether to record this as a history step
   */
  setContent(content: string, addToHistory = false): void {
    const transaction = addToHistory
      ? {
          changes: {
            from: 0,
            to: this._cmView.state.doc.length,
            insert: content
          }
        }
      : {
          changes: {
            from: 0,
            to: this._cmView.state.doc.length,
            insert: content
          },
          annotations: (
            Transaction as typeof Transaction & {
              addToHistory: { of: (v: boolean) => unknown };
            }
          ).addToHistory.of(false)
        };

    this._cmView.dispatch(transaction);
    this._updatePreview();
  }

  /**
   * Focus the editor view.
   */
  focus(): void {
    this._cmView.focus();
  }

  /**
   * Undo the last history step.
   */
  undo(): void {
    cmUndo({ state: this._cmView.state, dispatch: this._cmView.dispatch });
  }

  /**
   * Set the wiki ID and slug for the page being edited.
   *
   * Call this when a new page is selected so that {@link _handleSave}
   * knows where to POST the content.
   */
  setPage(wikiId: string, slug: string, headSha?: string): void {
    this._wikiId = wikiId;
    this._slug = slug;
    this._currentSha = headSha;
    this._isDirty = false;
    this._updateSaveButton();
  }

  /**
   * Mark the editor as having unsaved changes.
   *
   * Call this whenever the user edits the document.
   */
  markDirty(): void {
    this._isDirty = true;
    this._updateSaveButton();
  }

  /**
   * Set the committer email to use for git commits.
   *
   * Populated from user settings at startup.
   */
  set committerEmail(email: string) {
    this._committerEmail = email;
  }
  private _committerEmail = '';

  /**
   * Update the page list used for [[link]] autocomplete and broken-link
   * highlighting. Call this whenever the active wiki's page list changes.
   */
  setPages(pages: { title: string; slug: string }[]): void {
    this._pages = pages;
    // Notify the broken-link ViewPlugin to re-decorate
    this._cmView.dispatch({ effects: _pagesChangedEffect.of(null) });
    // Re-check broken links in the live preview
    this._markBrokenPreviewLinks();
  }
  private _pages: { title: string; slug: string }[] = [];

  private _updateSaveButton(): void {
    if (this._isDirty) {
      this._saveBtn.textContent = 'Save';
      this._saveBtn.classList.add(`${CSS_PREFIX}-saveBtn--dirty`);
    } else {
      this._saveBtn.textContent = 'Save';
      this._saveBtn.classList.remove(`${CSS_PREFIX}-saveBtn--dirty`);
    }
    this._saveStatus.textContent = '';
  }

  /**
   * Save the current page content.
   *
   * @returns `true` if save succeeded, `false` otherwise.
   */
  async save(): Promise<boolean> {
    if (
      !this._wikiId ||
      !this._slug ||
      !this._serverSettings ||
      !this._isDirty
    ) {
      return false;
    }

    this._saveBtn.textContent = 'Saving…';
    this._saveBtn.disabled = true;

    try {
      await savePage(
        this._wikiId,
        this._slug,
        {
          content: this.content,
          head_sha: this._currentSha,
          committer_email: this._committerEmail || undefined
        },
        this._serverSettings
      );
      this._isDirty = false;
      // The backend commit SHA is not returned, so we refresh the page to get it.
      this._currentSha = undefined;
      this._updateSaveButton();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';

      // Detect 409 Conflict and emit signal for conflict resolution
      if (
        err instanceof ServerConnection.ResponseError &&
        err.response.status === 409
      ) {
        const body = await err.response.json().catch(() => ({}));
        this.conflictDetected.emit({
          editorContent: this.content,
          theirContent: (body as Record<string, unknown>).their_content as
            | string
            | undefined,
          baseContent: (body as Record<string, unknown>).base_content as
            | string
            | undefined
        });
        this._saveStatus.textContent = 'Conflict — see below';
        this._saveStatus.style.color = 'var(--jp-warning-color1)';
        this._updateSaveButton();
        return false;
      }

      this._saveStatus.textContent = `Save failed: ${message}`;
      this._saveStatus.style.color = 'var(--jp-error-color1)';
      this._updateSaveButton();
      return false;
    } finally {
      this._updateSaveButton();
      this._saveBtn.disabled = false;
    }
  }

  // ── Signals ──────────────────────────────────────────────────────────

  /**
   * Signal emitted when the editor content changes.
   */
  contentChanged = new Signal<this, ContentChangedArgs>(this);

  /**
   * Signal emitted when the user clicks a wiki link in the preview.
   */
  wikiLinkClicked = new Signal<this, string>(this);

  /**
   * Signal emitted when a stale-write conflict (409) is detected.
   * The parent should show a conflict resolution view.
   */
  conflictDetected = new Signal<
    this,
    {
      editorContent: string;
      theirContent: string | undefined;
      baseContent: string | undefined;
    }
  >(this);

  // ── Widget lifecycle ─────────────────────────────────────────────────

  /**
   * Dispose of the widget and release resources.
   */
  dispose(): void {
    this._cmView.destroy();
    super.dispose();
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private _page: PageEntry | null = null;

  /** JupyterLab server settings — set by the plugin activator. */
  set serverSettings(settings: ServerConnection.ISettings) {
    this._serverSettings = settings;
  }
  private _serverSettings: ServerConnection.ISettings | null = null;

  /** Wiki ID of the currently loaded page (for save). */
  private _wikiId = '';
  /** Slug of the currently loaded page (for save). */
  private _slug = '';
  /** Git HEAD SHA of the currently loaded page (optimistic locking). */
  private _currentSha: string | undefined = undefined;
  /** Whether the editor content has unsaved changes. */
  private _isDirty = false;

  // DOM references
  private _editorHost!: Panel;
  private _cmView!: EditorView;
  private _previewPanel!: Panel;
  private _previewEl!: HTMLDivElement;
  private _pageLabel!: HTMLDivElement;
  private _saveBtn!: HTMLButtonElement;
  private _saveStatus!: HTMLDivElement;
  private _tablePickerEl!: HTMLDivElement;
  private _tablePickerLabel!: HTMLDivElement;

  /**
   * CodeMirror CompletionSource for [[wiki link]] syntax.
   *
   * Triggers whenever the cursor follows "[[" and offers page titles
   * as completions. Selecting a completion inserts "Title]]" so the
   * brackets are always balanced.
   */
  private _wikiLinkCompletion(
    context: CompletionContext
  ): CompletionResult | null {
    // Walk back from cursor to find an unmatched [[ on the same line
    const line = context.state.doc.lineAt(context.pos);
    const textBefore = line.text.slice(0, context.pos - line.from);
    const openIdx = textBefore.lastIndexOf('[[');
    if (openIdx === -1) {
      return null;
    }
    // Make sure there's no ]] closing it before the cursor
    const between = textBefore.slice(openIdx + 2);
    if (between.includes(']]')) {
      return null;
    }

    const from = line.from + openIdx + 2;
    const options = this._pages.map(p => ({
      label: p.title || p.slug,
      apply: (view: EditorView, _: unknown, start: number, end: number) => {
        // Check whether ]] already follows the cursor
        const after = view.state.doc.sliceString(end, end + 2);
        const suffix = after === ']]' ? '' : ']]';
        view.dispatch({
          changes: { from: start, to: end, insert: (p.title || p.slug) + suffix },
          selection: { anchor: start + (p.title || p.slug).length + suffix.length }
        });
      }
    }));

    if (options.length === 0) {
      return null;
    }
    return { from, options };
  }

  /**
   * Build a DecorationSet marking every [[link]] whose target doesn't
   * exist in the current page list. Used by the broken-link ViewPlugin.
   */
  private _buildBrokenLinkDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const slugSet = new Set(this._pages.map(p => p.slug));
    const wikiLinkRe = /\[\[([^\]]+)\]\]/g;

    for (const { from, to } of view.visibleRanges) {
      const text = view.state.doc.sliceString(from, to);
      let match: RegExpExecArray | null;
      while ((match = wikiLinkRe.exec(text)) !== null) {
        const title = match[1];
        const slug = title
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        if (!slugSet.has(slug)) {
          builder.add(
            from + match.index,
            from + match.index + match[0].length,
            Decoration.mark({ class: 'wikilab-broken-link' })
          );
        }
      }
    }

    return builder.finish();
  }

  /**
   * Walk the preview DOM and add/remove the broken-link CSS class on
   * every wiki-link anchor based on whether its target slug exists.
   */
  private _markBrokenPreviewLinks(): void {
    const slugSet = new Set(this._pages.map(p => p.slug));
    this._previewEl
      .querySelectorAll<HTMLAnchorElement>('.wikilab-wiki-link')
      .forEach(el => {
        const target = el.getAttribute('data-wiki-target');
        if (target !== null && !slugSet.has(target)) {
          el.classList.add('wikilab-broken-link');
        } else {
          el.classList.remove('wikilab-broken-link');
        }
      });
  }

  // ── Toolbar formatting helpers ────────────────────────────────────────

  /** Wrap the current selection with before/after markers, or insert at cursor. */
  private _wrapSelection(before: string, after: string): void {
    const { state } = this._cmView;
    const { from, to } = state.selection.main;
    const selected = state.doc.sliceString(from, to);
    const insert = before + selected + after;
    this._cmView.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + before.length, head: from + before.length + selected.length }
    });
    this._cmView.focus();
  }

  /** Toggle a line prefix (e.g. `- `, `> `) on all selected lines. */
  private _toggleLinePrefix(prefix: string): void {
    const { state } = this._cmView;
    const { from, to } = state.selection.main;
    const fromLine = state.doc.lineAt(from);
    const toLine = state.doc.lineAt(to);

    const lines: { lineFrom: number; lineText: string }[] = [];
    for (let pos = fromLine.from; pos <= toLine.to; ) {
      const line = state.doc.lineAt(pos);
      lines.push({ lineFrom: line.from, lineText: line.text });
      pos = line.to + 1;
    }

    const allHavePrefix = lines.every(l => l.lineText.startsWith(prefix));
    const changes = lines
      .map(({ lineFrom, lineText }) => {
        if (allHavePrefix) {
          return { from: lineFrom, to: lineFrom + prefix.length, insert: '' };
        } else if (!lineText.startsWith(prefix)) {
          return { from: lineFrom, to: lineFrom, insert: prefix };
        }
        return null;
      })
      .filter((c): c is { from: number; to: number; insert: string } => c !== null);

    this._cmView.dispatch({ changes });
    this._cmView.focus();
  }

  /** Apply or toggle a heading level on the current line. */
  private _applyHeading(level: number): void {
    const { state } = this._cmView;
    const line = state.doc.lineAt(state.selection.main.from);
    const prefix = '#'.repeat(level) + ' ';
    const existing = line.text.match(/^(#{1,6} )/);
    let change: { from: number; to: number; insert: string };
    if (existing && existing[1] === prefix) {
      change = { from: line.from, to: line.from + prefix.length, insert: '' };
    } else if (existing) {
      change = { from: line.from, to: line.from + existing[1].length, insert: prefix };
    } else {
      change = { from: line.from, to: line.from, insert: prefix };
    }
    this._cmView.dispatch({ changes: change });
    this._cmView.focus();
  }

  /** Insert a block of text at the cursor, surrounded by blank lines. */
  private _insertBlock(text: string): void {
    const { state } = this._cmView;
    const pos = state.selection.main.from;
    const line = state.doc.lineAt(pos);
    const prefix = line.text.trim() !== '' ? '\n\n' : '';
    const insert = prefix + text + '\n\n';
    this._cmView.dispatch({
      changes: { from: line.to, to: line.to, insert },
      selection: { anchor: line.to + insert.length }
    });
    this._cmView.focus();
  }

  /** Prompt for a URL and insert a markdown link. */
  private _insertLink(): void {
    const { state } = this._cmView;
    const { from, to } = state.selection.main;
    const selected = state.doc.sliceString(from, to);
    const url = window.prompt('Enter URL:');
    if (!url) {
      this._cmView.focus();
      return;
    }
    const label = selected || 'link text';
    const insert = `[${label}](${url})`;
    this._cmView.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length }
    });
    this._cmView.focus();
  }

  /** Insert a GFM table with the given dimensions. */
  private _insertTable(cols: number, rows: number): void {
    const headers = Array.from({ length: cols }, (_, i) => `Col ${i + 1}`);
    const sep = headers.map(h => '-'.repeat(h.length));
    const dataRow = headers.map(() => '    ');
    const lines = [
      '| ' + headers.join(' | ') + ' |',
      '| ' + sep.join(' | ') + ' |',
      ...Array.from({ length: rows }, () => '| ' + dataRow.join(' | ') + ' |')
    ];
    this._insertBlock(lines.join('\n'));
  }

  // ── Table grid picker ─────────────────────────────────────────────────

  private _showTablePicker(anchorBtn: HTMLButtonElement): void {
    this._tablePickerEl.style.display = 'block';
    const rect = anchorBtn.getBoundingClientRect();
    const hostRect = this._editorHost.node.getBoundingClientRect();
    this._tablePickerEl.style.left = `${rect.left - hostRect.left}px`;
    this._tablePickerEl.style.top = `${rect.bottom - hostRect.top + 2}px`;
  }

  private _hideTablePicker(): void {
    this._tablePickerEl.style.display = 'none';
  }

  private _createTablePicker(): HTMLDivElement {
    const COLS = 8;
    const ROWS = 6;

    const picker = document.createElement('div');
    picker.className = `${CSS_PREFIX}-tablePicker`;
    picker.style.display = 'none';

    this._tablePickerLabel = document.createElement('div');
    this._tablePickerLabel.className = `${CSS_PREFIX}-tablePickerLabel`;
    this._tablePickerLabel.textContent = 'Insert table';
    picker.appendChild(this._tablePickerLabel);

    const grid = document.createElement('div');
    grid.className = `${CSS_PREFIX}-tablePickerGrid`;

    for (let r = 1; r <= ROWS; r++) {
      for (let c = 1; c <= COLS; c++) {
        const cell = document.createElement('div');
        cell.className = `${CSS_PREFIX}-tablePickerCell`;
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);

        cell.addEventListener('mouseover', () => {
          this._tablePickerLabel.textContent = `${c} × ${r} table`;
          grid.querySelectorAll<HTMLDivElement>(`.${CSS_PREFIX}-tablePickerCell`).forEach(el => {
            const cr = Number(el.dataset.row);
            const cc = Number(el.dataset.col);
            el.classList.toggle(`${CSS_PREFIX}-tablePickerCell--active`, cc <= c && cr <= r);
          });
        });

        cell.addEventListener('click', () => {
          this._hideTablePicker();
          this._insertTable(c, r);
        });

        grid.appendChild(cell);
      }
    }

    picker.appendChild(grid);

    // Close picker when clicking outside
    document.addEventListener('mousedown', (e: MouseEvent) => {
      if (!picker.contains(e.target as Node)) {
        this._hideTablePicker();
      }
    });

    return picker;
  }

  // ── Toolbar DOM ────────────────────────────────────────────────────────

  private _createEditorToolbar(): HTMLDivElement {
    const toolbar = document.createElement('div');
    toolbar.className = `${CSS_PREFIX}-editorToolbar`;

    const btn = (
      label: string,
      title: string,
      action: (b: HTMLButtonElement) => void,
      extraClass = ''
    ): HTMLButtonElement => {
      const b = document.createElement('button');
      b.className = `${CSS_PREFIX}-toolbarBtn${extraClass ? ' ' + extraClass : ''}`;
      b.innerHTML = label;
      b.setAttribute('title', title);
      b.setAttribute('type', 'button');
      b.addEventListener('click', () => action(b));
      return b;
    };

    const sep = (): HTMLDivElement => {
      const d = document.createElement('div');
      d.className = `${CSS_PREFIX}-toolbarSep`;
      return d;
    };

    // Headings
    toolbar.appendChild(btn('H1', 'Heading 1', () => this._applyHeading(1)));
    toolbar.appendChild(btn('H2', 'Heading 2', () => this._applyHeading(2)));
    toolbar.appendChild(btn('H3', 'Heading 3', () => this._applyHeading(3)));
    toolbar.appendChild(sep());

    // Inline formatting
    toolbar.appendChild(btn('<b>B</b>', 'Bold (Ctrl+B)', () => this._wrapSelection('**', '**')));
    toolbar.appendChild(btn('<i>I</i>', 'Italic (Ctrl+I)', () => this._wrapSelection('*', '*')));
    toolbar.appendChild(btn('<s>S</s>', 'Strikethrough', () => this._wrapSelection('~~', '~~')));
    toolbar.appendChild(sep());

    // Lists + blockquote
    toolbar.appendChild(btn('&#8226;&#8212;', 'Unordered list', () => this._toggleLinePrefix('- ')));
    toolbar.appendChild(btn('1.&mdash;', 'Ordered list', () => this._toggleLinePrefix('1. ')));
    toolbar.appendChild(btn('&#10075;', 'Blockquote', () => this._toggleLinePrefix('> ')));
    toolbar.appendChild(sep());

    // Code
    toolbar.appendChild(btn('&lt;/&gt;', 'Inline code', () => this._wrapSelection('`', '`')));
    toolbar.appendChild(btn('&#9647;&#9647;', 'Code block', () => this._insertBlock('```\n\n```')));
    toolbar.appendChild(sep());

    // Link + HR + Table
    toolbar.appendChild(btn('&#128279;', 'Insert link', () => this._insertLink()));
    toolbar.appendChild(btn('&mdash;&mdash;', 'Horizontal rule', () => this._insertBlock('---')));

    const tableBtn = btn('&#9783;', 'Insert table', b => {
      if (this._tablePickerEl.style.display === 'none') {
        this._showTablePicker(b);
      } else {
        this._hideTablePicker();
      }
    });
    toolbar.appendChild(tableBtn);

    // Table grid picker (positioned absolutely inside editorHost)
    this._tablePickerEl = this._createTablePicker();

    return toolbar;
  }

  private _createEditor(): void {
    this._editorHost = new Panel();
    this._editorHost.addClass(`${CSS_PREFIX}-editorHost`);

    const hostEl = document.createElement('div');
    hostEl.className = `${CSS_PREFIX}-cmEditor`;

    // Capture `this` for use in the ViewPlugin class body below
    const self = this;

    const extensions = [
      // Core editing features
      history(),
      cmKeymap.of(defaultKeymap),
      cmKeymap.of([indentWithTab]),
      bracketMatching(),
      foldGutter(),
      cmKeymap.of(foldKeymap),
      cmKeymap.of(searchKeymap),
      // Markdown language support
      markdown({ base: markdownLanguage }),
      // JupyterLab theming
      jupyterTheme,
      // [[wiki link]] autocomplete
      autocompletion({
        override: [ctx => this._wikiLinkCompletion(ctx)],
        activateOnTyping: true
      }),
      cmKeymap.of(completionKeymap),
      // Broken [[link]] highlighting
      ViewPlugin.fromClass(
        class {
          decorations: DecorationSet;
          constructor(view: EditorView) {
            this.decorations = self._buildBrokenLinkDecorations(view);
          }
          update(update: ViewUpdate): void {
            const pagesChanged = update.transactions.some(tr =>
              tr.effects.some(e => e.is(_pagesChangedEffect))
            );
            if (update.docChanged || update.viewportChanged || pagesChanged) {
              this.decorations = self._buildBrokenLinkDecorations(update.view);
            }
          }
        },
        { decorations: v => v.decorations }
      ),
      // Ctrl+S shortcut for saving
      cmKeymap.of([
        {
          key: 'Ctrl-S',
          mac: 'Cmd-S',
          run: () => {
            void this.save();
            return true;
          }
        }
      ]),
      // Update listener for content change tracking
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged) {
          this._onContentChanged();
        }
      })
    ];

    this._cmView = new EditorView({
      doc: '',
      extensions,
      parent: hostEl
    });

    const editorToolbar = this._createEditorToolbar();
    this._editorHost.node.appendChild(editorToolbar);
    this._editorHost.node.appendChild(hostEl);
    this._editorHost.node.appendChild(this._tablePickerEl);
  }

  private _createPreview(): void {
    this._previewPanel = new Panel();
    this._previewPanel.addClass(`${CSS_PREFIX}-previewPanel`);

    // Top bar: page title + save button + status
    const toolbar = document.createElement('div');
    toolbar.className = `${CSS_PREFIX}-previewToolbar`;

    this._pageLabel = document.createElement('div');
    this._pageLabel.className = `${CSS_PREFIX}-pageTitle`;
    this._pageLabel.textContent = 'Untitled';
    toolbar.appendChild(this._pageLabel);

    // Save button
    this._saveBtn = document.createElement('button');
    this._saveBtn.className = `${CSS_PREFIX}-saveBtn`;
    this._saveBtn.textContent = 'Save';
    this._saveBtn.setAttribute('aria-label', 'Save page (Ctrl+S)');
    this._saveBtn.addEventListener('click', () => void this.save());
    toolbar.appendChild(this._saveBtn);

    // Save status indicator
    this._saveStatus = document.createElement('div');
    this._saveStatus.className = `${CSS_PREFIX}-saveStatus`;
    toolbar.appendChild(this._saveStatus);

    // Preview container (scrollable)
    this._previewEl = document.createElement('div');
    this._previewEl.className = `${CSS_PREFIX}-previewContent`;
    this._previewEl.setAttribute('role', 'region');
    this._previewEl.setAttribute('aria-label', 'Markdown preview');

    this._previewPanel.node.appendChild(toolbar);
    this._previewPanel.node.appendChild(this._previewEl);
  }

  private _onContentChanged(): void {
    const newContent = this.content;

    this.markDirty();
    this.contentChanged.emit({ content: newContent });
    this._updatePreview();
  }

  private _updatePreview(): void {
    try {
      const html = render(this.content);
      this._previewEl.innerHTML = html;
    } catch (err) {
      this._previewEl.innerHTML = `<p style="color:red">Preview error: ${err instanceof Error ? err.message : 'Unknown'}</p>`;
    }

    // Handle wiki link clicks in preview
    this._previewEl.onclick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const wikiLink = target.closest(
        '.wikilab-wiki-link'
      ) as HTMLAnchorElement | null;
      if (wikiLink) {
        event.preventDefault();
        const slug = wikiLink.getAttribute('data-wiki-target');
        if (slug) {
          this.wikiLinkClicked.emit(slug);
        }
      }
    };

    // Mark any broken links now that the preview DOM is updated
    this._markBrokenPreviewLinks();
  }
}
