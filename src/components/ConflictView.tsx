/**
 * ConflictView — Three-way conflict resolution panel.
 *
 * Renders the base (common ancestor), the user's current editor content,
 * and the current HEAD content side by side so the user can resolve the
 * conflict before re-saving.
 *
 * ## Layout
 *
 * ```
 * ┌──────────────────────────────────────────────────────────┐
 * │  Conflict: Page was modified elsewhere                    │
 * ├──────────────┬──────────────┬────────────────────────────┤
 * │  Base        │  Your Edits  │  Current HEAD              │
 * │  (ancestor)  │  (editor)    │  (on-disk)                 │
 * ├──────────────┴──────────────┴────────────────────────────┤
 * │  [Accept Your Edits]  [Accept HEAD]  [Discard Changes]   │
 * └──────────────────────────────────────────────────────────┘
 * ```
 */

import { Panel, SplitPanel } from '@lumino/widgets';

import type { ConflictResponse } from '../types';

// ── CSS class namespace ─────────────────────────────────────────────────────

const CSS_PREFIX = 'jp-ConflictView';

// ── Public interface ────────────────────────────────────────────────────────

/** Arguments emitted when the user resolves a conflict. */
export interface IResolutionArgs {
  /** The chosen content string to save. */
  content: string;
}

/** Resolution choice selected by the user. */
export type ResolutionChoice = 'yours' | 'theirs' | 'discard';

/** Props for the ConflictView widget. */
export interface ConflictViewProps {
  /** The conflict response from the backend. */
  response: ConflictResponse;
  /** The user's current editor content. */
  editorContent: string;
  /** Callback when the user selects a resolution. */
  onResolve: (content: string) => void;
}

// ── ConflictView widget ─────────────────────────────────────────────────────

/**
 * Three-way conflict resolution panel.
 *
 * Displays base / yours / theirs content panes and provides
 * accept/discard buttons to resolve the stale-write conflict.
 */
export class ConflictView extends Panel {
  // ── Construction ─────────────────────────────────────────────────────

  /**
   * Construct the conflict view.
   */
  constructor(props: ConflictViewProps) {
    super();
    this.addClass(CSS_PREFIX);
    this.title.caption = 'Conflict Resolution';

    this._response = props.response;
    this._editorContent = props.editorContent;
    this._onResolve = props.onResolve;

    this._createHeader();
    this._createPanes();
    this._createActions();

    this.addWidget(this._header);
    this.addWidget(this._splitter);
    this.addWidget(this._actions);
  }

  // ── Disposable ───────────────────────────────────────────────────────

  dispose(): void {
    super.dispose();
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private _response: ConflictResponse;
  private _editorContent: string;
  private _onResolve: (content: string) => void;

  private _header!: Panel;
  private _headerText!: HTMLDivElement;

  private _splitter!: SplitPanel;

  private _basePanel!: Panel;
  private _baseContent!: HTMLPreElement;

  private _yoursPanel!: Panel;
  private _yoursContent!: HTMLPreElement;

  private _theirsPanel!: Panel;
  private _theirsContent!: HTMLPreElement;

  private _actions!: Panel;
  private _yoursBtn!: HTMLButtonElement;
  private _theirsBtn!: HTMLButtonElement;
  private _discardBtn!: HTMLButtonElement;

  private _createHeader(): void {
    this._header = new Panel();
    this._header.addClass(`${CSS_PREFIX}-header`);

    this._headerText = document.createElement('div');
    this._headerText.className = `${CSS_PREFIX}-headerText`;
    this._headerText.textContent = `Conflict: ${this._response.error}`;
    this._header.node.appendChild(this._headerText);
  }

  private _createPanes(): void {
    this._splitter = new SplitPanel();
    this._splitter.addClass(`${CSS_PREFIX}-splitter`);
    this._splitter.orientation = 'horizontal';
    this._splitter.setRelativeSizes([1, 1, 1]);

    // Base (common ancestor)
    this._basePanel = new Panel();
    this._basePanel.addClass(`${CSS_PREFIX}-pane`);
    this._basePanel.title.caption = 'Base (ancestor)';
    this._baseContent = document.createElement('pre');
    this._baseContent.className = `${CSS_PREFIX}-content`;
    this._baseContent.textContent =
      this._response.base_content ?? '(no base content available)';
    this._basePanel.node.appendChild(this._baseContent);
    this._splitter.addWidget(this._basePanel);

    // Your edits (current editor content)
    this._yoursPanel = new Panel();
    this._yoursPanel.addClass(`${CSS_PREFIX}-pane`);
    this._yoursPanel.title.caption = 'Your Edits';
    this._yoursContent = document.createElement('pre');
    this._yoursContent.className = `${CSS_PREFIX}-content ${CSS_PREFIX}-yours`;
    this._yoursContent.textContent = this._editorContent;
    this._yoursPanel.node.appendChild(this._yoursContent);
    this._splitter.addWidget(this._yoursPanel);

    // Theirs (current HEAD from disk)
    this._theirsPanel = new Panel();
    this._theirsPanel.addClass(`${CSS_PREFIX}-pane`);
    this._theirsPanel.title.caption = 'Current HEAD';
    this._theirsContent = document.createElement('pre');
    this._theirsContent.className = `${CSS_PREFIX}-content ${CSS_PREFIX}-theirs`;
    this._theirsContent.textContent =
      this._response.their_content ?? '(no HEAD content available)';
    this._theirsPanel.node.appendChild(this._theirsContent);
    this._splitter.addWidget(this._theirsPanel);
  }

  private _createActions(): void {
    this._actions = new Panel();
    this._actions.addClass(`${CSS_PREFIX}-actions`);

    this._yoursBtn = this._createButton('Accept Your Edits', () =>
      this._onResolve(this._editorContent)
    );

    this._theirsBtn = this._createButton('Accept HEAD', () =>
      this._onResolve(this._response.their_content ?? this._editorContent)
    );

    this._discardBtn = this._createButton('Discard Changes', () =>
      this._onResolve(this._editorContent)
    );

    this._actions.node.appendChild(this._yoursBtn);
    this._actions.node.appendChild(this._theirsBtn);
    this._actions.node.appendChild(this._discardBtn);
  }

  private _createButton(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = `${CSS_PREFIX}-btn`;
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }
}
