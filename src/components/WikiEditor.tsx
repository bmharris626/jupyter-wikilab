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

import { Transaction } from '@codemirror/state';

import {
  EditorView,
  type ViewUpdate,
  keymap as cmKeymap
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

import { Panel, SplitPanel } from '@lumino/widgets';

import { ServerConnection } from '@jupyterlab/services';

import { jupyterTheme } from '@jupyterlab/codemirror';

import { Signal } from '@lumino/signaling';

import { render } from '../markdownRenderer';
import { savePage } from '../wikiApi';
import type { PageEntry } from '../types';

// ── CSS class namespace ─────────────────────────────────────────────────────

const CSS_PREFIX = 'jp-WikiEditor';

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
    this._editorHost.node.focus();
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

  private _updateSaveButton(): void {
    if (this._isDirty) {
      this._saveBtn.textContent = 'Save *';
    } else {
      this._saveBtn.textContent = 'Save';
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
          head_sha: this._currentSha
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
      this._saveStatus.textContent = `Save failed: ${message}`;
      this._saveStatus.style.color = 'var(--jp-error-color1)';
      this._updateSaveButton();
      return false;
    } finally {
      this._saveBtn.textContent = this._isDirty ? 'Save *' : 'Save';
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

  private _createEditor(): void {
    this._editorHost = new Panel();
    this._editorHost.addClass(`${CSS_PREFIX}-editorHost`);

    const hostEl = document.createElement('div');
    hostEl.className = `${CSS_PREFIX}-cmEditor`;

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

    this._editorHost.node.appendChild(hostEl);
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
  }
}
