/**
 * PageHistory — Git commit history panel for a wiki page.
 *
 * Displays a scrollable list of commits (sha, message, author, date)
 * for a given page slug. Clicking a commit row triggers the
 * `commitSelected` signal with the selected commit SHA so the
 * parent can load historical content.
 *
 * ## Structure
 *
 * ```
 * ┌──────────────────────────────────────────┐
 * │ History for: Home                        │
 * ├──────────────────────────────────────────┤
 * │ sha  message              author  date   │
 * │ ...  ...                  ...     ...    │
 * └──────────────────────────────────────────┘
 * ```
 */

import { Panel, PanelLayout } from '@lumino/widgets';

import { ServerConnection } from '@jupyterlab/services';

import { Signal } from '@lumino/signaling';

import { getPageHistory } from '../wikiApi';
import type { CommitEntry } from '../types';

// ── CSS class namespace ─────────────────────────────────────────────────────

const CSS_PREFIX = 'jp-PageHistory';

// ── Public interface ────────────────────────────────────────────────────────

/**
 * Data exposed by the PageHistory panel.
 */
export interface IHistoryPanel {
  /** Whether history is currently being loaded. */
  readonly loading: boolean;
  /** The list of commit entries loaded for the active page. */
  readonly commits: CommitEntry[];
}

/** Arguments carried by the commit-selected event. */
export interface CommitSelectedArgs {
  /** The git SHA of the selected commit. */
  sha: string;
  /** The title / message of the selected commit. */
  message: string;
  /** The author name of the selected commit. */
  author: string;
}

// ── PageHistory widget ──────────────────────────────────────────────────────

/**
 * Scrollable panel showing the git commit history for a wiki page.
 *
 * Usage: construct the widget, set `serverSettings`, then call
 * {@link PageHistory.loadHistory} with a wiki ID and slug.
 * The panel fires `commitSelected` when a row is clicked.
 */
export class PageHistory extends Panel implements IHistoryPanel {
  // ── Construction ───────────────────────────────────────────────────────

  /**
   * Construct the history panel with a header and scrollable table.
   */
  constructor() {
    super();
    this.addClass(CSS_PREFIX);
    this.title.caption = 'Page History';

    const layout = this.layout as PanelLayout;

    this._createHeader();
    this._createTable();

    layout.addWidget(this._header);
    layout.addWidget(this._table);
  }

  // ── IHistoryPanel ──────────────────────────────────────────────────────

  get loading(): boolean {
    return this._loading;
  }

  get commits(): CommitEntry[] {
    return this._commits;
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Fetch and render the commit history for the given page.
   *
   * Clears the table before loading and shows a placeholder
   * when the wiki is not selected or the API call fails.
   */
  async loadHistory(wikiId: string, slug: string): Promise<void> {
    if (!wikiId || !this._serverSettings) {
      this._commits = [];
      this._loading = false;
      this._renderTable();
      return;
    }

    this._loading = true;
    this._renderTable();

    try {
      const response = await getPageHistory(wikiId, slug, this._serverSettings);
      this._commits = response.history;
    } catch {
      this._commits = [];
    } finally {
      this._loading = false;
    }

    this._renderTable();
  }

  // ── Signals ────────────────────────────────────────────────────────────

  /**
   * Signal fired when the user clicks a commit row.
   *
   * The payload contains the commit SHA, message, and author so
   * the parent can fetch historical content via the API.
   */
  commitSelected = new Signal<this, CommitSelectedArgs>(this);

  // ── Widget lifecycle ───────────────────────────────────────────────────

  /**
   * Dispose of the widget and disconnect signals.
   */
  dispose(): void {
    super.dispose();
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /** JupyterLab server settings — set by the plugin activator. */
  set serverSettings(settings: ServerConnection.ISettings) {
    this._serverSettings = settings;
  }

  private _serverSettings: ServerConnection.ISettings | null = null;
  private _loading = false;
  private _commits: CommitEntry[] = [];
  // ── DOM construction ───────────────────────────────────────────────────

  private _header!: Panel;
  private _headerTitle!: HTMLHeadingElement;
  private _headerCount!: HTMLSpanElement;
  private _table!: Panel;
  private _tableContainer!: HTMLDivElement;

  private _onCellClick = (event: MouseEvent): void => {
    const row = (event.target as HTMLElement).closest(`.${CSS_PREFIX}-row`);
    if (!row) {
      return;
    }
    const sha = row.getAttribute('data-sha');
    const message = row.getAttribute('data-message') || '';
    const author = row.getAttribute('data-author') || '';

    if (sha) {
      this.commitSelected.emit({ sha, message, author });
    }
  };

  private _createHeader(): void {
    this._header = new Panel();
    this._header.addClass(`${CSS_PREFIX}-header`);

    this._headerTitle = document.createElement('h3');
    this._headerTitle.className = `${CSS_PREFIX}-title`;
    this._headerTitle.textContent = 'History';

    this._headerCount = document.createElement('span');
    this._headerCount.className = `${CSS_PREFIX}-count`;

    const headerRow = document.createElement('div');
    headerRow.className = `${CSS_PREFIX}-headerRow`;
    headerRow.appendChild(this._headerTitle);
    headerRow.appendChild(this._headerCount);

    this._header.node.appendChild(headerRow);
  }

  private _createTable(): void {
    this._table = new Panel();
    this._table.addClass(`${CSS_PREFIX}-table`);

    this._tableContainer = document.createElement('div');
    this._tableContainer.className = `${CSS_PREFIX}-container`;
    this._tableContainer.setAttribute('role', 'list');

    // Table header row (non-interactive)
    const headerRow = document.createElement('div');
    headerRow.className = `${CSS_PREFIX}-row ${CSS_PREFIX}-rowHeader`;
    headerRow.setAttribute('role', 'row');

    const shaHeader = document.createElement('div');
    shaHeader.className = `${CSS_PREFIX}-col ${CSS_PREFIX}-colSha`;
    shaHeader.textContent = 'SHA';

    const msgHeader = document.createElement('div');
    msgHeader.className = `${CSS_PREFIX}-col ${CSS_PREFIX}-colMsg`;
    msgHeader.textContent = 'Message';

    const authorHeader = document.createElement('div');
    authorHeader.className = `${CSS_PREFIX}-col ${CSS_PREFIX}-colAuthor`;
    authorHeader.textContent = 'Author';

    const dateHeader = document.createElement('div');
    dateHeader.className = `${CSS_PREFIX}-col ${CSS_PREFIX}-colDate`;
    dateHeader.textContent = 'Date';

    headerRow.appendChild(shaHeader);
    headerRow.appendChild(msgHeader);
    headerRow.appendChild(authorHeader);
    headerRow.appendChild(dateHeader);

    this._tableContainer.appendChild(headerRow);
    this._tableContainer.addEventListener('click', this._onCellClick);
    this._table.node.appendChild(this._tableContainer);
  }

  // ── Rendering ──────────────────────────────────────────────────────────

  private _shortSha(sha: string): string {
    return sha.slice(0, 7);
  }

  private _formatDate(dateStr: string): string {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) {
        return dateStr;
      }
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
    } catch {
      return dateStr;
    }
  }

  private _renderTable(): void {
    // Remove all dynamically created rows (keep the header row)
    const rows = this._tableContainer.querySelectorAll(
      `.${CSS_PREFIX}-row:not(.${CSS_PREFIX}-rowHeader)`
    );
    rows.forEach(row => row.remove());

    // Update header counts
    this._headerTitle.textContent = 'History';
    this._headerCount.textContent = `(${this._commits.length})`;

    if (this._loading) {
      const loadingRow = document.createElement('div');
      loadingRow.className = `${CSS_PREFIX}-row ${CSS_PREFIX}-rowLoading`;
      const loadingMsg = document.createElement('div');
      loadingMsg.className = `${CSS_PREFIX}-col`;
      loadingMsg.textContent = 'Loading history…';
      loadingMsg.setAttribute('colspan', '4');
      loadingRow.appendChild(loadingMsg);
      this._tableContainer.appendChild(loadingRow);
      return;
    }

    if (this._commits.length === 0) {
      const emptyRow = document.createElement('div');
      emptyRow.className = `${CSS_PREFIX}-row ${CSS_PREFIX}-rowEmpty`;
      const emptyMsg = document.createElement('div');
      emptyMsg.className = `${CSS_PREFIX}-col`;
      emptyMsg.textContent = 'No commits found.';
      emptyMsg.setAttribute('colspan', '4');
      emptyRow.appendChild(emptyMsg);
      this._tableContainer.appendChild(emptyRow);
      return;
    }

    for (const commit of this._commits) {
      const row = document.createElement('div');
      row.className = `${CSS_PREFIX}-row`;
      row.setAttribute('role', 'listitem');
      row.setAttribute('data-sha', commit.sha);
      row.setAttribute('data-message', commit.message);
      row.setAttribute('data-author', commit.author);
      row.setAttribute('title', `Click to view content at ${commit.sha}`);

      const shaCol = document.createElement('div');
      shaCol.className = `${CSS_PREFIX}-col ${CSS_PREFIX}-colSha`;
      shaCol.textContent = this._shortSha(commit.sha);

      const msgCol = document.createElement('div');
      msgCol.className = `${CSS_PREFIX}-col ${CSS_PREFIX}-colMsg`;
      msgCol.textContent = commit.message;

      const authorCol = document.createElement('div');
      authorCol.className = `${CSS_PREFIX}-col ${CSS_PREFIX}-colAuthor`;
      authorCol.textContent = commit.author;

      const dateCol = document.createElement('div');
      dateCol.className = `${CSS_PREFIX}-col ${CSS_PREFIX}-colDate`;
      dateCol.textContent = this._formatDate(commit.date);

      row.appendChild(shaCol);
      row.appendChild(msgCol);
      row.appendChild(authorCol);
      row.appendChild(dateCol);

      this._tableContainer.appendChild(row);
    }
  }
}
