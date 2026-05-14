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

// State utilities available via @codemirror/state for future extensions

import { EditorView, ViewUpdate } from '@codemirror/view';

import { markdown, markdownLanguage } from '@codemirror/lang-markdown';

import { defaultKeymap, history, indentWithTab } from '@codemirror/commands';

import { keymap } from '@codemirror/view';

import { bracketMatching, foldGutter, foldKeymap } from '@codemirror/language';

import { searchKeymap } from '@codemirror/search';

import { Panel, SplitPanel } from '@lumino/widgets';

import { jupyterTheme } from '@jupyterlab/codemirror';

import { Signal } from '@lumino/signaling';

import { render } from '../markdownRenderer';
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
          }
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

  // DOM references
  private _editorHost!: Panel;
  private _cmView!: EditorView;
  private _previewPanel!: Panel;
  private _previewEl!: HTMLDivElement;
  private _pageLabel!: HTMLDivElement;

  private _createEditor(): void {
    this._editorHost = new Panel();
    this._editorHost.addClass(`${CSS_PREFIX}-editorHost`);

    const hostEl = document.createElement('div');
    hostEl.className = `${CSS_PREFIX}-cmEditor`;

    const extensions = [
      // Core editing features
      history(),
      keymap.of(defaultKeymap),
      keymap.of([indentWithTab]),
      bracketMatching(),
      foldGutter(),
      keymap.of(foldKeymap),
      keymap.of(searchKeymap),
      // Markdown language support
      markdown({ base: markdownLanguage }),
      // JupyterLab theming
      jupyterTheme,
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

    // Top bar: page title + tabs
    const toolbar = document.createElement('div');
    toolbar.className = `${CSS_PREFIX}-previewToolbar`;

    this._pageLabel = document.createElement('div');
    this._pageLabel.className = `${CSS_PREFIX}-pageTitle`;
    this._pageLabel.textContent = 'Untitled';
    toolbar.appendChild(this._pageLabel);

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
