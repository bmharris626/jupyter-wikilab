/**
 * WikiBrowser — Left sidebar panel for wiki browsing.
 *
 * Displays a wiki selector dropdown, a git status indicator with
 * pull/push buttons, and a scrollable page list.
 * Serves as the primary navigation surface inside JupyterLab.
 *
 * ## Structure
 *
 * ```
 * ┌──────────────────────────────────────────┐
 * │ [Wiki: v] [main ↑0 ↓0] [↻Pull] [↑Push] │
 * ├──────────────────────────────────────────┤
 * │                                          │
 * │  Page List (scrollable)                  │
 * │                                          │
 * └──────────────────────────────────────────┘
 * ```
 */

import { Panel, PanelLayout } from '@lumino/widgets';

import { ServerConnection } from '@jupyterlab/services';

import { Signal } from '@lumino/signaling';

import { getPage, listPages, getGitStatus, gitPull, gitPush } from '../wikiApi';
import type { WikiInfo, PageEntry, GitStatusResponse } from '../types';

// ── CSS class namespace ─────────────────────────────────────────────────────

const CSS_PREFIX = 'jp-WikiBrowser';

// ── Public interface ────────────────────────────────────────────────────────

/**
 * Data exposed by the WikiBrowser panel.
 */
export interface IBrowserPanel {
  /** Currently selected wiki ID (empty string when none selected). */
  readonly activeWikiId: string;
  /** List of pages belonging to the active wiki. */
  readonly pages: PageEntry[];
}

/** Arguments carried by the wiki-selected event. */
export interface WikiSelectedArgs {
  name: 'wikiSelected';
  newValue: string;
  oldValue: string;
}

/** Arguments carried by the page-selected event. */
export interface PageSelectedArgs {
  /** The slug of the selected page. */
  slug: string;
  /** The title of the selected page (may be empty). */
  title: string;
  /** The current git commit SHA for optimistic locking. */
  head_sha?: string;
}

// ── WikiBrowser widget ──────────────────────────────────────────────────────

/**
 * Sidebar panel that shows a wiki selector and the corresponding page list.
 *
 * The component follows a simple event-driven pattern: when the user picks
 * a wiki from the dropdown the widget fires a {@link WikiBrowser.wikiSelected}
 * signal. The parent (usually `index.ts`) listens to this signal and calls
 * {@link WikiBrowser.loadPages} to populate the list.
 */
export class WikiBrowser extends Panel implements IBrowserPanel {
  // ── Construction ───────────────────────────────────────────────────────

  /**
   * Construct the wiki browser panel with wiki selector,
   * git status indicator, and pull/push action buttons.
   */
  constructor() {
    super();
    this.addClass(CSS_PREFIX);
    this.title.caption = 'Wiki Browser';
    this.title.iconClass = 'lm-CommandPalette-icon';

    // Panel already has a PanelLayout; cast it to add children.
    const layout = this.layout as PanelLayout;

    this._createToolbar();
    this._createPageList();

    layout.addWidget(this._toolbar);
    layout.addWidget(this._pagePanel);
  }

  // ── IBrowserPanel ──────────────────────────────────────────────────────

  get activeWikiId(): string {
    return this._wikiSelect.value;
  }

  get pages(): PageEntry[] {
    return this._pages;
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Fetch and render the page list for the currently selected wiki.
   *
   * If no wiki is selected the list is cleared and a placeholder
   * message is shown.
   */
  async loadPages(): Promise<void> {
    const wikiId = this.activeWikiId;

    if (!wikiId) {
      this._pages = [];
      this._clearPageList();
      this._showPlaceholder('Select a wiki to browse its pages.');
      return;
    }

    this._showPlaceholder('Loading pages…');

    if (!this._serverSettings) {
      this._showPlaceholder('Server settings not initialized.');
      return;
    }

    try {
      const response = await listPages(wikiId, this._serverSettings);
      this._pages = response.pages;
      this._renderPageList();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this._showPlaceholder(`Failed to load pages: ${message}`);
      this._pages = [];
    }
  }

  /**
   * Fetch page content by slug.
   *
   * Stores both content and `head_sha` internally so they are available
   * to the signal handler in the parent component.
   *
   * The returned promise resolves with the content string on success
   * or rejects with an error message on failure.
   */
  async loadPage(slug: string): Promise<string> {
    const wikiId = this.activeWikiId;

    if (!wikiId || !this._serverSettings) {
      throw new Error('No wiki selected or server settings not initialized.');
    }

    const response = await getPage(wikiId, slug, this._serverSettings);
    this._lastLoadedContent = response.content;
    this._lastLoadedSha = response.head_sha;
    return response.content;
  }

  // ── Signals ────────────────────────────────────────────────────────────

  /**
   * Signal fired when the user selects a different wiki from the dropdown.
   */
  wikiSelected: WikiSelectedArgs = {
    name: 'wikiSelected',
    newValue: '',
    oldValue: ''
  };

  /**
   * Emit a page-selected signal with the given values.
   */
  _emitPageSelected(slug: string, title: string): void {
    this.pageSelected.emit({
      slug,
      title,
      head_sha: this._lastLoadedSha
    });
  }

  /** Emit a wiki-selected signal with the given values. */
  _emitWikiSelected(newValue: string): void {
    this.wikiSelected.oldValue = this.wikiSelected.newValue;
    this.wikiSelected.newValue = newValue;
  }

  // ── Widget lifecycle ───────────────────────────────────────────────────

  /**
   * Signal fired when the user clicks a page in the page list.
   */
  pageSelected = new Signal<this, PageSelectedArgs>(this);

  // ── Private helpers ────────────────────────────────────────────────────

  /** JupyterLab server settings — set by the plugin activator. */
  set serverSettings(settings: ServerConnection.ISettings) {
    this._serverSettings = settings;
  }

  private _serverSettings: ServerConnection.ISettings | null = null;
  private _pages: PageEntry[] = [];
  /** Most recently loaded page content (set by loadPage). */
  _lastLoadedContent: string = '';
  /** Most recently loaded page git SHA (set by loadPage). */
  _lastLoadedSha: string | undefined = undefined;

  // ── DOM construction ───────────────────────────────────────────────────

  private _toolbar!: Panel;
  _wikiSelect!: HTMLSelectElement; // internal — accessible to tests
  private _pagePanel!: Panel;
  private _pageList!: HTMLUListElement;
  private _placeholder!: HTMLDivElement;

  // Git status fields
  private _gitStatus: GitStatusResponse = {
    branch: '',
    ahead: 0,
    behind: 0,
    dirty: false,
    untracked: 0
  };
  private _gitStatusEl!: HTMLDivElement;
  private _pullBtn!: HTMLButtonElement;
  private _pushBtn!: HTMLButtonElement;

  private _onWikiChange = (): void => {
    const prev = this.wikiSelected.newValue;
    this.wikiSelected.oldValue = prev;
    this.wikiSelected.newValue = this.activeWikiId;

    if (prev !== this.activeWikiId) {
      void Promise.all([this.loadPages(), this.refreshGitStatus()]);
    }
  };

  private _createToolbar(): void {
    this._toolbar = new Panel();
    this._toolbar.addClass(`${CSS_PREFIX}-toolbar`);

    const label = document.createElement('label');
    label.textContent = 'Wiki:';
    label.className = `${CSS_PREFIX}-wikiLabel`;

    this._wikiSelect = document.createElement('select');
    this._wikiSelect.className = `${CSS_PREFIX}-wikiSelect`;
    this._wikiSelect.setAttribute('aria-label', 'Select a wiki');

    // Default "no wiki" option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '— Select a wiki —';
    this._wikiSelect.appendChild(defaultOption);

    this._wikiSelect.addEventListener('change', this._onWikiChange);
    this._toolbar.node.appendChild(label);
    this._toolbar.node.appendChild(this._wikiSelect);

    // Git status indicator (read-only)
    this._gitStatusEl = document.createElement('div');
    this._gitStatusEl.className = `${CSS_PREFIX}-gitStatus`;
    this._gitStatusEl.textContent = '—';
    this._gitStatusEl.setAttribute('aria-label', 'Git status');
    this._toolbar.node.appendChild(this._gitStatusEl);

    // Pull button
    this._pullBtn = document.createElement('button');
    this._pullBtn.className = `${CSS_PREFIX}-gitBtn`;
    this._pullBtn.textContent = '↻ Pull';
    this._pullBtn.setAttribute('aria-label', 'Pull from remote');
    this._pullBtn.addEventListener('click', () => void this._handlePull());
    this._toolbar.node.appendChild(this._pullBtn);

    // Push button
    this._pushBtn = document.createElement('button');
    this._pushBtn.className = `${CSS_PREFIX}-gitBtn`;
    this._pushBtn.textContent = '↑ Push';
    this._pushBtn.setAttribute('aria-label', 'Push to remote');
    this._pushBtn.addEventListener('click', () => void this._handlePush());
    this._toolbar.node.appendChild(this._pushBtn);
  }

  /** Populate the wiki selector dropdown from the registry. */
  populateWikis(wikis: Record<string, WikiInfo>): void {
    const select = this._wikiSelect;

    // Save current selection before removing options (removal resets value to "")
    const current = select.value;

    // Remove all options except the first (default)
    while (select.options.length > 1) {
      select.remove(1);
    }

    for (const [id, info] of Object.entries(wikis)) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = info.name;
      select.appendChild(opt);
    }

    // Restore previous selection if it still exists
    const options = Array.from(select.options);
    if (current && options.some(o => o.value === current && o.value !== '')) {
      select.value = current;
    }
  }

  private _createPageList(): void {
    this._pagePanel = new Panel();
    this._pagePanel.addClass(`${CSS_PREFIX}-pagePanel`);

    this._pageList = document.createElement('ul');
    this._pageList.className = `${CSS_PREFIX}-pageList`;
    this._pageList.setAttribute('role', 'list');

    this._placeholder = document.createElement('div');
    this._placeholder.className = `${CSS_PREFIX}-placeholder`;

    this._pagePanel.node.appendChild(this._pageList);
    this._pagePanel.node.appendChild(this._placeholder);
  }

  private _clearPageList(): void {
    this._pageList.innerHTML = '';
  }

  private _showPlaceholder(text: string): void {
    this._placeholder.textContent = text;
    this._placeholder.style.display = 'block';
    this._clearPageList();
  }

  private _renderPageList(): void {
    this._placeholder.style.display = 'none';
    this._clearPageList();

    if (this._pages.length === 0) {
      this._showPlaceholder('No pages in this wiki.');
      return;
    }

    for (const page of this._pages) {
      const li = document.createElement('li');
      li.className = `${CSS_PREFIX}-pageItem`;
      li.setAttribute('role', 'listitem');

      const link = document.createElement('a');
      link.href = '#';
      link.className = `${CSS_PREFIX}-pageLink`;
      link.textContent = page.title || page.slug;
      link.setAttribute('data-slug', page.slug);
      link.setAttribute('title', `Open ${page.title || page.slug}`);

      link.addEventListener('click', async (event: MouseEvent) => {
        event.preventDefault();
        try {
          this._lastLoadedContent = await this.loadPage(page.slug);
          this._emitPageSelected(page.slug, page.title);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          this._showPlaceholder(`Failed to load "${page.slug}": ${message}`);
        }
      });

      li.appendChild(link);
      this._pageList.appendChild(li);
    }
  }

  // ── Git status ─────────────────────────────────────────────────────────

  /**
   * Fetch and display the Git status for the currently selected wiki.
   */
  async refreshGitStatus(): Promise<void> {
    const wikiId = this.activeWikiId;

    if (!wikiId || !this._serverSettings) {
      this._gitStatus = {
        branch: '',
        ahead: 0,
        behind: 0,
        dirty: false,
        untracked: 0
      };
      this._renderGitStatus();
      return;
    }

    try {
      const response = await getGitStatus(wikiId, this._serverSettings);
      this._gitStatus = {
        branch: response.branch,
        ahead: response.ahead,
        behind: response.behind,
        dirty: response.dirty,
        untracked: response.untracked
      };
    } catch {
      this._gitStatus = {
        branch: 'error',
        ahead: 0,
        behind: 0,
        dirty: false,
        untracked: 0
      };
    }

    this._renderGitStatus();
  }

  private _renderGitStatus(): void {
    const s = this._gitStatus;
    const parts: string[] = [];

    if (s.branch) {
      parts.push(s.branch);
    }
    if (s.ahead > 0) {
      parts.push(`↑${s.ahead}`);
    }
    if (s.behind > 0) {
      parts.push(`↓${s.behind}`);
    }
    if (s.dirty) {
      parts.push('●');
    }

    this._gitStatusEl.textContent = parts.length ? parts.join('  ') : '—';

    // Dim the status text when there is no branch
    this._gitStatusEl.style.opacity = s.branch ? '1' : '0.4';

    // Enable/disable pull/push buttons
    const hasRemote = s.branch !== '' && s.branch !== 'error';
    this._pullBtn.disabled = !hasRemote;
    this._pushBtn.disabled = !hasRemote;

    if (!hasRemote) {
      this._pullBtn.textContent = 'Pull';
      this._pushBtn.textContent = 'Push';
    } else {
      this._pullBtn.textContent = '↻ Pull';
      this._pushBtn.textContent = '↑ Push';
    }
  }

  private async _handlePull(): Promise<void> {
    if (!this.activeWikiId || !this._serverSettings) {
      return;
    }
    this._pullBtn.textContent = 'Pulling…';
    this._pullBtn.disabled = true;
    try {
      await gitPull(this.activeWikiId, this._serverSettings);
      await this.refreshGitStatus();
      await this.loadPages();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this._gitStatusEl.textContent = `Pull failed: ${message}`;
    } finally {
      this._pullBtn.textContent = '↻ Pull';
      this._renderGitStatus();
    }
  }

  private async _handlePush(): Promise<void> {
    if (!this.activeWikiId || !this._serverSettings) {
      return;
    }
    this._pushBtn.textContent = 'Pushing…';
    this._pushBtn.disabled = true;
    try {
      await gitPush(this.activeWikiId, this._serverSettings);
      await this.refreshGitStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this._gitStatusEl.textContent = `Push failed: ${message}`;
    } finally {
      this._pushBtn.textContent = '↑ Push';
      this._renderGitStatus();
    }
  }
}
