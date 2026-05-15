/**
 * SearchPanel — Full-text search results panel for a wiki.
 *
 * Provides a query input that triggers a git-grep search across the wiki.
 * Results are displayed as a scrollable list showing file, line number,
 * and content snippet. Clicking a result row triggers the `resultSelected`
 * signal with the matched result data.
 *
 * ## Structure
 *
 * ```
 * ┌──────────────────────────────────────────┐
 * │ Search    [query input...]  [Search]      │
 * ├──────────────────────────────────────────┤
 * │ file        line  content                 │
 * ├──────────────────────────────────────────┤
 * │ docs/guide.md  12  "This is the content"  │
 * │ ...                                           │
 * └──────────────────────────────────────────┘
 * ```
 */

import { Panel, PanelLayout } from '@lumino/widgets';

import { ServerConnection } from '@jupyterlab/services';

import { Signal } from '@lumino/signaling';

import { searchWiki } from '../wikiApi';
import type { SearchResult } from '../types';

// ── CSS class namespace ─────────────────────────────────────────────────────

const CSS_PREFIX = 'jp-SearchPanel';

// ── Public interface ────────────────────────────────────────────────────────

/**
 * Data exposed by the SearchPanel widget.
 */
export interface ISearchPanel {
  /** Whether a search is currently in progress. */
  readonly loading: boolean;
  /** The list of search results for the last query. */
  readonly results: SearchResult[];
  /** The current search query string. */
  readonly query: string;
}

/** Arguments carried by the result-selected event. */
export interface IResultSelectedArgs {
  /** The file path where the match was found. */
  file: string;
  /** The 1-based line number. */
  line: number;
  /** The matching line content. */
  content: string;
}

// ── SearchPanel widget ──────────────────────────────────────────────────────

/**
 * Panel providing full-text search across a wiki using git grep.
 *
 * Usage: construct the widget, set `serverSettings`, then call
 * {@link SearchPanel.search} with a wiki ID and query. The panel
 * fires `resultSelected` when a result row is clicked.
 */
export class SearchPanel extends Panel implements ISearchPanel {
  // ── Construction ───────────────────────────────────────────────────────

  /**
   * Construct the search panel with query input and scrollable results list.
   */
  constructor() {
    super();
    this.addClass(CSS_PREFIX);
    this.title.caption = 'Search';

    const layout = this.layout as PanelLayout;

    this._createQueryBar();
    this._createResults();

    layout.addWidget(this._queryBar);
    layout.addWidget(this._resultsPanel);
  }

  // ── ISearchPanel ───────────────────────────────────────────────────────

  get loading(): boolean {
    return this._loading;
  }

  get results(): SearchResult[] {
    return this._searchResults;
  }

  get query(): string {
    return this._searchInput.value;
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Execute a full-text search across the wiki.
   *
   * Sends a GET request to the wiki search endpoint and
   * renders the results in the panel.
   *
   * @param wikiId - The wiki ID to search
   * @param term - The search term
   */
  async search(wikiId: string, term: string): Promise<void> {
    if (!wikiId || !term || !this._serverSettings) {
      this._searchResults = [];
      this._loading = false;
      this._renderResults();
      return;
    }

    this._searchInput.value = term;
    this._loading = true;
    this._renderResults();

    try {
      const response = await searchWiki(
        wikiId,
        term,
        false,
        this._serverSettings
      );
      this._searchResults = response.results;
    } catch {
      this._searchResults = [];
    } finally {
      this._loading = false;
    }

    this._renderResults();
  }

  /**
   * Clear the current search query and results.
   */
  clear(): void {
    this._searchInput.value = '';
    this._searchResults = [];
    this._renderResults();
  }

  // ── Signals ────────────────────────────────────────────────────────────

  /**
   * Signal fired when the user clicks a result row.
   *
   * The payload contains the file, line number, and content
   * of the matched result.
   */
  resultSelected = new Signal<this, IResultSelectedArgs>(this);

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
  private _searchResults: SearchResult[] = [];

  // ── DOM construction ───────────────────────────────────────────────────

  private _queryBar!: Panel;
  private _searchInput!: HTMLInputElement;
  private _searchBtn!: HTMLButtonElement;

  private _resultsPanel!: Panel;
  private _resultsContainer!: HTMLDivElement;

  private _onCellClick = (event: MouseEvent): void => {
    const row = (event.target as HTMLElement).closest(`.${CSS_PREFIX}-row`);
    if (!row) {
      return;
    }
    const file = row.getAttribute('data-file');
    const line = parseInt(row.getAttribute('data-line') ?? '0', 10);
    const content = row.getAttribute('data-content') || '';

    if (file !== null) {
      this.resultSelected.emit({ file, line, content });
    }
  };

  private _onSearch = (): void => {
    const term = this._searchInput.value.trim();
    if (term) {
      void this.search(this._wikiId, term);
    }
  };

  private _onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter') {
      this._onSearch();
    }
  };

  private _wikiId = '';

  /**
   * Set the wiki ID for search.
   */
  setWikiId(wikiId: string): void {
    this._wikiId = wikiId;
  }

  private _createQueryBar(): void {
    this._queryBar = new Panel();
    this._queryBar.addClass(`${CSS_PREFIX}-queryBar`);

    // Search input
    this._searchInput = document.createElement('input');
    this._searchInput.className = `${CSS_PREFIX}-input`;
    this._searchInput.type = 'text';
    this._searchInput.placeholder = 'Search wiki content…';
    this._searchInput.setAttribute('aria-label', 'Search query');
    this._searchInput.addEventListener('keydown', this._onKeyDown);

    // Search button
    this._searchBtn = document.createElement('button');
    this._searchBtn.className = `${CSS_PREFIX}-btn`;
    this._searchBtn.textContent = 'Search';
    this._searchBtn.addEventListener('click', this._onSearch);

    const barContainer = document.createElement('div');
    barContainer.className = `${CSS_PREFIX}-queryRow`;
    barContainer.appendChild(this._searchInput);
    barContainer.appendChild(this._searchBtn);

    this._queryBar.node.appendChild(barContainer);
  }

  private _createResults(): void {
    this._resultsPanel = new Panel();
    this._resultsPanel.addClass(`${CSS_PREFIX}-results`);

    this._resultsContainer = document.createElement('div');
    this._resultsContainer.className = `${CSS_PREFIX}-container`;
    this._resultsContainer.setAttribute('role', 'list');

    // Column headers (non-interactive)
    const headerRow = document.createElement('div');
    headerRow.className = `${CSS_PREFIX}-row ${CSS_PREFIX}-rowHeader`;
    headerRow.setAttribute('role', 'row');

    const fileHeader = document.createElement('div');
    fileHeader.className = `${CSS_PREFIX}-col ${CSS_PREFIX}-colFile`;
    fileHeader.textContent = 'File';

    const lineHeader = document.createElement('div');
    lineHeader.className = `${CSS_PREFIX}-col ${CSS_PREFIX}-colLine`;
    lineHeader.textContent = 'Line';

    const contentHeader = document.createElement('div');
    contentHeader.className = `${CSS_PREFIX}-col ${CSS_PREFIX}-colContent`;
    contentHeader.textContent = 'Content';

    headerRow.appendChild(fileHeader);
    headerRow.appendChild(lineHeader);
    headerRow.appendChild(contentHeader);

    this._resultsContainer.appendChild(headerRow);
    this._resultsContainer.addEventListener('click', this._onCellClick);

    this._resultsPanel.node.appendChild(this._resultsContainer);
  }

  // ── Rendering ──────────────────────────────────────────────────────────

  private _renderResults(): void {
    // Remove all dynamically created result rows (keep the header row)
    const rows = this._resultsContainer.querySelectorAll(
      `.${CSS_PREFIX}-row:not(.${CSS_PREFIX}-rowHeader)`
    );
    rows.forEach(row => row.remove());

    if (this._loading) {
      const loadingRow = document.createElement('div');
      loadingRow.className = `${CSS_PREFIX}-row ${CSS_PREFIX}-rowLoading`;
      const loadingMsg = document.createElement('div');
      loadingMsg.className = `${CSS_PREFIX}-col`;
      loadingMsg.textContent = 'Searching…';
      loadingMsg.setAttribute('colspan', '3');
      loadingRow.appendChild(loadingMsg);
      this._resultsContainer.appendChild(loadingRow);
      return;
    }

    if (this._searchResults.length === 0) {
      const emptyRow = document.createElement('div');
      emptyRow.className = `${CSS_PREFIX}-row ${CSS_PREFIX}-rowEmpty`;
      const emptyMsg = document.createElement('div');
      emptyMsg.className = `${CSS_PREFIX}-col`;
      emptyMsg.textContent = 'No results found.';
      emptyMsg.setAttribute('colspan', '3');
      emptyRow.appendChild(emptyMsg);
      this._resultsContainer.appendChild(emptyRow);
      return;
    }

    for (const result of this._searchResults) {
      const row = document.createElement('div');
      row.className = `${CSS_PREFIX}-row`;
      row.setAttribute('role', 'listitem');
      row.setAttribute('data-file', result.file);
      row.setAttribute('data-line', String(result.line));
      row.setAttribute('data-content', result.content);
      row.setAttribute('title', `Open ${result.file} at line ${result.line}`);

      const fileCol = document.createElement('div');
      fileCol.className = `${CSS_PREFIX}-col ${CSS_PREFIX}-colFile`;
      fileCol.textContent = result.file;

      const lineCol = document.createElement('div');
      lineCol.className = `${CSS_PREFIX}-col ${CSS_PREFIX}-colLine`;
      lineCol.textContent = String(result.line);

      const contentCol = document.createElement('div');
      contentCol.className = `${CSS_PREFIX}-col ${CSS_PREFIX}-colContent`;
      contentCol.textContent = result.content;

      row.appendChild(fileCol);
      row.appendChild(lineCol);
      row.appendChild(contentCol);

      this._resultsContainer.appendChild(row);
    }
  }
}
