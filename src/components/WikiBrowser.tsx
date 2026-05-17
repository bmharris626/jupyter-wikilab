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

import { Widget } from '@lumino/widgets';

import { ServerConnection } from '@jupyterlab/services';

import { InputDialog, showDialog, Dialog } from '@jupyterlab/apputils';

import { Signal } from '@lumino/signaling';

import {
  getPage,
  listPages,
  getGitStatus,
  gitPull,
  gitPush,
  getBacklinks,
  createPage,
  renamePage,
  savePage,
  searchWiki,
  initWiki
} from '../wikiApi';
import { SearchPanel } from './SearchPanel';
import type { PageEntry, GitStatusResponse } from '../types';

// ── CSS class namespace ─────────────────────────────────────────────────────

const CSS_PREFIX = 'jp-WikiBrowser';

/** Escape a string for safe use inside a RegExp literal. */
function _escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

/** Arguments carried by the page-renamed event. */
export interface PageRenamedArgs {
  /** Slug of the page before rename. */
  oldSlug: string;
  /** Old title of the page. */
  oldTitle: string;
  /** New slug (derived from newTitle). */
  newSlug: string;
  /** New title. */
  newTitle: string;
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
    this._createBacklinks();

    this._searchPanel = new SearchPanel();
    this._searchPanel.resultSelected.connect(async (_, args) => {
      const slug = args.file.replace(/\.md$/, '');
      try {
        this._lastLoadedContent = await this.loadPage(slug);
        this._emitPageSelected(slug, '');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        this._showPlaceholder(`Failed to load "${slug}": ${message}`);
      }
    });

    layout.addWidget(this._toolbar);
    layout.addWidget(this._searchPanel);
    layout.addWidget(this._pagePanel);
    layout.addWidget(this._backlinksPanel);
  }

  // ── IBrowserPanel ──────────────────────────────────────────────────────

  get activeWikiId(): string {
    return this._activeWikiId;
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
      this._showPlaceholder('Navigate to a folder containing a wiki, or initialize one here.');
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
    this.pagesLoaded.emit(this._pages);
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

    // Load backlinks for the selected page
    void this._loadBacklinks(slug);

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

  /**
   * Signal fired after loadPages() completes with the updated page list.
   * Consumers (e.g. the editor) use this to refresh autocomplete data.
   */
  pagesLoaded = new Signal<this, PageEntry[]>(this);

  /**
   * Signal fired after a page is successfully renamed.
   * Consumers update any open editor references pointing to the old slug.
   */
  pageRenamed = new Signal<this, PageRenamedArgs>(this);

  // ── Private helpers ────────────────────────────────────────────────────

  /** JupyterLab server settings — set by the plugin activator. */
  set serverSettings(settings: ServerConnection.ISettings) {
    this._serverSettings = settings;
    this._searchPanel.serverSettings = settings;
    this._initWikiBtn.onclick = () => {
      void this._handleInitWiki();
    };
  }

  /** Absolute filesystem path of the current file browser directory. */
  set currentPath(path: string) {
    this._currentPath = path;
  }

  private _serverSettings: ServerConnection.ISettings | null = null;
  private _currentPath: string = '';
  private _activeWikiId: string = '';
  private _pages: PageEntry[] = [];
  /** Most recently loaded page content (set by loadPage). */
  _lastLoadedContent: string = '';
  /** Most recently loaded page git SHA (set by loadPage). */
  _lastLoadedSha: string | undefined = undefined;

  // ── DOM construction ───────────────────────────────────────────────────

  private _toolbar!: Panel;
  private _wikiNameDisplay!: HTMLSpanElement;
  private _initWikiBtn!: HTMLButtonElement;
  private _pagePanel!: Panel;
  private _pageList!: HTMLUListElement;
  private _placeholder!: HTMLDivElement;
  private _newPageBtn!: HTMLButtonElement;

  // ── Search panel ───────────────────────────────────────────────────────

  private _searchPanel!: SearchPanel;

  // ── Backlinks panel ────────────────────────────────────────────────────

  private _backlinksPanel!: Panel;
  private _backlinksTitle!: HTMLDivElement;
  private _backlinksList!: HTMLUListElement;
  private _backlinks: string[] = [];

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

  private _createToolbar(): void {
    this._toolbar = new Panel();
    this._toolbar.addClass(`${CSS_PREFIX}-toolbar`);

    // ── Row 1: active wiki name + init button ──────────────────────────────

    const wikiRow = document.createElement('div');
    wikiRow.className = `${CSS_PREFIX}-toolbarRow`;

    const label = document.createElement('span');
    label.textContent = 'Wiki: ';
    label.className = `${CSS_PREFIX}-wikiLabel`;

    this._wikiNameDisplay = document.createElement('span');
    this._wikiNameDisplay.className = `${CSS_PREFIX}-wikiName`;
    this._wikiNameDisplay.textContent = '—';

    // Init-wiki button — onclick wired in set serverSettings()
    this._initWikiBtn = document.createElement('button');
    this._initWikiBtn.className = `${CSS_PREFIX}-gitBtn`;
    this._initWikiBtn.textContent = '+ Init';
    this._initWikiBtn.setAttribute('aria-label', 'Initialize wiki in current directory');
    this._initWikiBtn.setAttribute('title', 'Initialize wiki in this directory');
    this._initWikiBtn.style.display = 'none'; // shown only when no wiki is active

    wikiRow.appendChild(label);
    wikiRow.appendChild(this._wikiNameDisplay);
    wikiRow.appendChild(this._initWikiBtn);

    // ── Row 2: git status + actions ───────────────────────────────────────

    const gitRow = document.createElement('div');
    gitRow.className = `${CSS_PREFIX}-toolbarRow ${CSS_PREFIX}-gitRow`;

    this._gitStatusEl = document.createElement('div');
    this._gitStatusEl.className = `${CSS_PREFIX}-gitStatus`;
    this._gitStatusEl.textContent = '—';
    this._gitStatusEl.setAttribute('aria-label', 'Git status');

    this._pullBtn = document.createElement('button');
    this._pullBtn.className = `${CSS_PREFIX}-gitBtn`;
    this._pullBtn.textContent = '↻ Pull';
    this._pullBtn.setAttribute('aria-label', 'Pull from remote');
    this._pullBtn.addEventListener('click', () => void this._handlePull());

    this._pushBtn = document.createElement('button');
    this._pushBtn.className = `${CSS_PREFIX}-gitBtn`;
    this._pushBtn.textContent = '↑ Push';
    this._pushBtn.setAttribute('aria-label', 'Push to remote');
    this._pushBtn.addEventListener('click', () => void this._handlePush());

    gitRow.appendChild(this._gitStatusEl);
    gitRow.appendChild(this._pullBtn);
    gitRow.appendChild(this._pushBtn);

    this._toolbar.node.appendChild(wikiRow);
    this._toolbar.node.appendChild(gitRow);
  }

  /** Activate a wiki for the current directory and load its pages. */
  setActiveWiki(wikiId: string, name: string, path: string): void {
    this._activeWikiId = wikiId;
    this._currentPath = path;
    this._wikiNameDisplay.textContent = name;
    this._initWikiBtn.style.display = 'none';
    this._newPageBtn.disabled = false;
    this._searchPanel.setWikiId(wikiId);
    this._searchPanel.clear();
    void Promise.all([this.loadPages(), this.refreshGitStatus()]);
  }

  /** Clear the active wiki (current directory has no wiki). */
  clearWiki(): void {
    this._activeWikiId = '';
    this._wikiNameDisplay.textContent = '—';
    this._initWikiBtn.style.display = '';
    this._newPageBtn.disabled = true;
    this._searchPanel.setWikiId('');
    this._searchPanel.clear();
    this._pages = [];
    this._clearPageList();
    this._showPlaceholder('Navigate to a folder containing a wiki, or initialize one here.');
    void this.refreshGitStatus();
  }

  private _createPageList(): void {
    this._pagePanel = new Panel();
    this._pagePanel.addClass(`${CSS_PREFIX}-pagePanel`);

    // Section header: "Pages" label + new-page button
    const pageHeader = document.createElement('div');
    pageHeader.className = `${CSS_PREFIX}-sectionHeader`;

    const pageTitle = document.createElement('span');
    pageTitle.className = `${CSS_PREFIX}-sectionTitle`;
    pageTitle.textContent = 'Pages';

    this._newPageBtn = document.createElement('button');
    this._newPageBtn.className = `${CSS_PREFIX}-iconBtn`;
    this._newPageBtn.textContent = '+';
    this._newPageBtn.setAttribute('aria-label', 'New page');
    this._newPageBtn.setAttribute('title', 'New page');
    this._newPageBtn.disabled = true;
    this._newPageBtn.addEventListener('click', () => void this._handleNewPage());

    pageHeader.appendChild(pageTitle);
    pageHeader.appendChild(this._newPageBtn);

    this._pageList = document.createElement('ul');
    this._pageList.className = `${CSS_PREFIX}-pageList`;
    this._pageList.setAttribute('role', 'list');

    this._placeholder = document.createElement('div');
    this._placeholder.className = `${CSS_PREFIX}-placeholder`;

    this._pagePanel.node.appendChild(pageHeader);
    this._pagePanel.node.appendChild(this._pageList);
    this._pagePanel.node.appendChild(this._placeholder);
  }

  private _createBacklinks(): void {
    this._backlinksPanel = new Panel();
    this._backlinksPanel.addClass(`${CSS_PREFIX}-backlinksPanel`);

    this._backlinksTitle = document.createElement('div');
    this._backlinksTitle.className = `${CSS_PREFIX}-backlinksTitle`;
    this._backlinksTitle.textContent = 'Backlinks';

    this._backlinksList = document.createElement('ul');
    this._backlinksList.className = `${CSS_PREFIX}-backlinksList`;
    this._backlinksList.setAttribute('role', 'list');

    this._backlinksPanel.node.appendChild(this._backlinksTitle);
    this._backlinksPanel.node.appendChild(this._backlinksList);
  }

  // ── Folder expand/collapse state ──────────────────────────────────────────

  /** Set of folder paths currently expanded in the page tree. */
  private _expandedFolders = new Set<string>();

  private _clearPageList(): void {
    this._pageList.innerHTML = '';
  }

  private _showPlaceholder(text: string): void {
    this._placeholder.textContent = text;
    this._placeholder.style.display = 'block';
    this._clearPageList();
  }

  /**
   * Build a folder → pages map from the flat page list.
   * Root-level pages (no folder) are stored under the key ''.
   */
  private _buildFolderMap(): Map<string, PageEntry[]> {
    const map = new Map<string, PageEntry[]>();
    map.set('', []);
    for (const page of this._pages) {
      const slashIdx = page.slug.lastIndexOf('/');
      const folder = slashIdx === -1 ? '' : page.slug.substring(0, slashIdx);
      if (!map.has(folder)) {
        map.set(folder, []);
      }
      map.get(folder)!.push(page);
    }
    return map;
  }

  /** Append a page <li> to the given parent list element. */
  private _appendPageItem(
    parent: HTMLElement,
    page: PageEntry,
    indent = false
  ): void {
    const li = document.createElement('li');
    li.className = `${CSS_PREFIX}-pageItem`;
    li.setAttribute('role', 'listitem');

    const link = document.createElement('a');
    link.href = '#';
    link.className = `${CSS_PREFIX}-pageLink`;
    if (indent) {
      link.classList.add(`${CSS_PREFIX}-pageLinkIndented`);
    }
    link.textContent = page.title || page.slug.split('/').pop()!;
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

    const renameBtn = document.createElement('button');
    renameBtn.className = `${CSS_PREFIX}-pageActionBtn`;
    renameBtn.textContent = '✎';
    renameBtn.setAttribute('title', `Rename "${page.title || page.slug}"`);
    renameBtn.addEventListener('click', async (event: MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
      await this._handleRenamePage(page);
    });

    li.appendChild(link);
    li.appendChild(renameBtn);
    parent.appendChild(li);
  }

  private _renderPageList(): void {
    this._placeholder.style.display = 'none';
    this._clearPageList();

    if (this._pages.length === 0) {
      this._showPlaceholder('No pages in this wiki.');
      return;
    }

    const folderMap = this._buildFolderMap();
    const rootPages = folderMap.get('') ?? [];

    // ── Root-level pages ───────────────────────────────────────────────────
    for (const page of rootPages) {
      this._appendPageItem(this._pageList, page, false);
    }

    // ── Folder groups ──────────────────────────────────────────────────────
    const folders = Array.from(folderMap.keys())
      .filter(k => k !== '')
      .sort();

    for (const folder of folders) {
      const pages = folderMap.get(folder)!;
      const isExpanded = this._expandedFolders.has(folder);

      // Folder header row
      const folderLi = document.createElement('li');
      folderLi.className = `${CSS_PREFIX}-folderItem`;
      folderLi.setAttribute('role', 'listitem');

      const folderBtn = document.createElement('button');
      folderBtn.className = `${CSS_PREFIX}-folderBtn`;
      folderBtn.setAttribute('aria-expanded', String(isExpanded));
      folderBtn.setAttribute('title', isExpanded ? `Collapse ${folder}` : `Expand ${folder}`);

      const arrow = document.createElement('span');
      arrow.className = `${CSS_PREFIX}-folderArrow`;
      arrow.textContent = isExpanded ? '▾' : '▸';

      const label = document.createElement('span');
      label.className = `${CSS_PREFIX}-folderLabel`;
      label.textContent = `${folder}/`;

      const count = document.createElement('span');
      count.className = `${CSS_PREFIX}-folderCount`;
      count.textContent = String(pages.length);

      folderBtn.appendChild(arrow);
      folderBtn.appendChild(label);
      folderBtn.appendChild(count);
      folderLi.appendChild(folderBtn);
      this._pageList.appendChild(folderLi);

      // Nested page list
      const subList = document.createElement('ul');
      subList.className = `${CSS_PREFIX}-folderPages`;
      subList.setAttribute('role', 'list');
      subList.style.display = isExpanded ? '' : 'none';

      for (const page of pages) {
        this._appendPageItem(subList, page, true);
      }

      this._pageList.appendChild(subList);

      folderBtn.addEventListener('click', () => {
        const expanded = this._expandedFolders.has(folder);
        if (expanded) {
          this._expandedFolders.delete(folder);
          arrow.textContent = '▸';
          folderBtn.setAttribute('aria-expanded', 'false');
          folderBtn.setAttribute('title', `Expand ${folder}`);
          subList.style.display = 'none';
        } else {
          this._expandedFolders.add(folder);
          arrow.textContent = '▾';
          folderBtn.setAttribute('aria-expanded', 'true');
          folderBtn.setAttribute('title', `Collapse ${folder}`);
          subList.style.display = '';
        }
      });
    }
  }

  // ── Backlinks ──────────────────────────────────────────────────────────

  /**
   * Fetch backlinks for a page and render them in the backlinks panel.
   */
  private async _loadBacklinks(slug: string): Promise<void> {
    const wikiId = this.activeWikiId;

    if (!wikiId || !this._serverSettings) {
      this._backlinks = [];
      this._renderBacklinks();
      return;
    }

    try {
      const response = await getBacklinks(wikiId, slug, this._serverSettings);
      this._backlinks = response.backlinks;
    } catch {
      this._backlinks = [];
    }

    this._renderBacklinks();
  }

  private _renderBacklinks(): void {
    this._backlinksList.innerHTML = '';

    if (this._backlinks.length === 0) {
      return;
    }

    this._backlinksTitle.textContent = `Backlinks (${this._backlinks.length})`;

    for (const backlink of this._backlinks) {
      const li = document.createElement('li');
      li.className = `${CSS_PREFIX}-backlinkItem`;

      const link = document.createElement('a');
      link.href = '#';
      link.className = `${CSS_PREFIX}-backlinkLink`;
      // Derive slug from file path (remove .md extension)
      const slug = backlink.replace(/\.md$/, '');
      link.textContent = backlink;
      link.setAttribute('data-slug', slug);
      link.setAttribute('title', `Open ${slug}`);

      link.addEventListener('click', async (event: MouseEvent) => {
        event.preventDefault();
        try {
          this._lastLoadedContent = await this.loadPage(slug);
          this._emitPageSelected(slug, '');
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          this._showPlaceholder(`Failed to load "${slug}": ${message}`);
        }
      });

      li.appendChild(link);
      this._backlinksList.appendChild(li);
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

  private async _handleInitWiki(): Promise<void> {
    if (!this._serverSettings || !this._currentPath) {
      return;
    }
    const result = await InputDialog.getText({
      title: 'Initialize Wiki',
      label: 'Wiki name',
      okLabel: 'Initialize'
    });
    if (!result.button.accept || !result.value?.trim()) {
      return;
    }
    const name = result.value.trim();
    try {
      const info = await initWiki(
        { path: this._currentPath, name },
        this._serverSettings
      );
      this.setActiveWiki(info.id, info.name, info.path);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this._showPlaceholder(`Failed to initialize wiki: ${message}`);
    }
  }

  private async _handleNewPage(): Promise<void> {
    const wikiId = this.activeWikiId;
    if (!wikiId || !this._serverSettings) {
      return;
    }

    const body = new NewPageBody(Array.from(this._expandedFolders));
    const result = await showDialog({
      title: 'New Page',
      body,
      focusNodeSelector: 'input',
      buttons: [
        Dialog.cancelButton(),
        Dialog.okButton({ label: 'Create' })
      ]
    });

    if (!result.button.accept) {
      return;
    }

    const { title, folder } = body.getValue();
    if (!title) {
      return;
    }

    try {
      const response = await createPage(
        wikiId,
        { title, content: `# ${title}\n\n`, folder: folder || undefined },
        this._serverSettings
      );
      // Auto-expand the folder when a page is created inside one
      if (folder) {
        this._expandedFolders.add(folder.trim().replace(/^\/|\/$/g, ''));
      }
      await this.loadPages();
      this._lastLoadedContent = await this.loadPage(response.slug);
      this._emitPageSelected(response.slug, title);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this._showPlaceholder(`Failed to create page: ${message}`);
    }
  }

  private async _handleRenamePage(page: PageEntry): Promise<void> {
    const wikiId = this.activeWikiId;
    if (!wikiId || !this._serverSettings) {
      return;
    }

    const result = await InputDialog.getText({
      title: 'Rename Page',
      label: 'New title',
      text: page.title || page.slug,
      okLabel: 'Rename'
    });

    if (!result.button.accept || !result.value?.trim()) {
      return;
    }

    const newTitle = result.value.trim();
    if (newTitle === page.title) {
      return;
    }

    const nameSlug = newTitle
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const slashIdx = page.slug.lastIndexOf('/');
    const newSlug =
      slashIdx === -1 ? nameSlug : `${page.slug.substring(0, slashIdx)}/${nameSlug}`;

    try {
      await renamePage(
        wikiId,
        page.slug,
        { new_title: newTitle },
        this._serverSettings
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      void showDialog({
        title: 'Rename Failed',
        body: message,
        buttons: [Dialog.okButton()]
      });
      return;
    }

    // Notify listeners (e.g. index.ts updates the open editor) before cascade
    this.pageRenamed.emit({
      oldSlug: page.slug,
      oldTitle: page.title || page.slug,
      newSlug,
      newTitle
    });

    // Offer to update [[Old Title]] references across the wiki
    await this._cascadeRenameReferences(page.title || page.slug, newTitle, newSlug);

    // Reload the page list to reflect the rename
    await this.loadPages();
  }

  private async _cascadeRenameReferences(
    oldTitle: string,
    newTitle: string,
    newSlug: string
  ): Promise<void> {
    const wikiId = this.activeWikiId;
    if (!wikiId || !this._serverSettings) {
      return;
    }

    let results;
    try {
      results = await searchWiki(
        wikiId,
        `[[${oldTitle}]]`,
        true,
        this._serverSettings
      );
    } catch {
      return;
    }

    if (results.results.length === 0) {
      return;
    }

    // Collect unique slugs that still reference the old title, excluding the
    // renamed page itself (the backend already updated its own content)
    const slugs = [
      ...new Set(
        results.results
          .map(r => r.file.replace(/\.md$/, ''))
          .filter(s => s !== newSlug)
      )
    ];

    if (slugs.length === 0) {
      return;
    }

    const confirmation = await showDialog({
      title: 'Update References?',
      body: `${slugs.length} page(s) still link to [[${oldTitle}]]. Update them to [[${newTitle}]]?`,
      buttons: [
        Dialog.cancelButton({ label: 'Skip' }),
        Dialog.okButton({ label: 'Update All' })
      ]
    });

    if (!confirmation.button.accept) {
      return;
    }

    const oldLinkRe = new RegExp(
      `\\[\\[${_escapeRegex(oldTitle)}\\]\\]`,
      'g'
    );

    for (const slug of slugs) {
      try {
        const { content, head_sha } = await getPage(
          wikiId,
          slug,
          this._serverSettings
        );
        const updated = content.replace(oldLinkRe, `[[${newTitle}]]`);
        if (updated !== content) {
          await savePage(
            wikiId,
            slug,
            { content: updated, head_sha },
            this._serverSettings
          );
        }
      } catch {
        // Best-effort: skip pages that fail and continue
      }
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

// ── NewPageBody ─────────────────────────────────────────────────────────────

/**
 * Two-field dialog body for creating a new page.
 * Shows an optional folder path input (pre-populated from the currently
 * expanded folder if there is exactly one) and a required title input.
 */
class NewPageBody extends Widget {
  private _folderInput: HTMLInputElement;
  private _titleInput: HTMLInputElement;

  constructor(expandedFolders: string[]) {
    super();
    this.addClass('jp-NewPageBody');

    const makeRow = (
      labelText: string,
      placeholder: string,
      hint?: string
    ): { row: HTMLDivElement; input: HTMLInputElement } => {
      const row = document.createElement('div');
      row.className = 'jp-NewPageBody-row';

      const label = document.createElement('label');
      label.className = 'jp-NewPageBody-label';
      label.textContent = labelText;

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'jp-mod-styled jp-NewPageBody-input';
      input.placeholder = placeholder;

      row.appendChild(label);
      row.appendChild(input);

      if (hint) {
        const hintEl = document.createElement('span');
        hintEl.className = 'jp-NewPageBody-hint';
        hintEl.textContent = hint;
        row.appendChild(hintEl);
      }

      return { row, input };
    };

    const folderRow = makeRow(
      'Folder (optional)',
      'e.g. guides or guides/tutorials',
      'Leave blank to create at the root level.'
    );
    const titleRow = makeRow('Page title', 'My New Page');

    this._folderInput = folderRow.input;
    this._titleInput = titleRow.input;

    // Pre-populate folder from the single expanded folder
    if (expandedFolders.length === 1) {
      this._folderInput.value = expandedFolders[0];
    }

    this.node.appendChild(folderRow.row);
    this.node.appendChild(titleRow.row);
  }

  getValue(): { title: string; folder: string } {
    return {
      title: this._titleInput.value.trim(),
      folder: this._folderInput.value.trim().replace(/^\/|\/$/g, '')
    };
  }
}
