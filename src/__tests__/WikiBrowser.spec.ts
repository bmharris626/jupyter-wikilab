/**
 * Unit tests for the WikiBrowser sidebar panel.
 */

import { WikiBrowser } from '../components/WikiBrowser';
import type { PageEntry } from '../types';

// ── Mock the API layer ──────────────────────────────────────────────────────

jest.mock('../wikiApi', () => ({
  listPages: jest.fn(),
  getGitStatus: jest.fn(),
  gitPull: jest.fn(),
  gitPush: jest.fn(),
  getBacklinks: jest.fn(),
  getPage: jest.fn(),
  initWiki: jest.fn()
}));

import {
  listPages,
  getGitStatus,
  gitPull,
  gitPush,
  getBacklinks,
  getPage
} from '../wikiApi';

const mockServerSettings: any = {
  baseUrl: 'http://localhost:8888/',
  token: '',
  baseUrlResolved: 'http://localhost:8888/'
};

describe('WikiBrowser', () => {
  let browser: WikiBrowser;

  beforeEach(() => {
    document.body.innerHTML = '';
    browser = new WikiBrowser();
    browser.serverSettings = mockServerSettings;
  });

  afterEach(() => {
    browser.dispose();
  });

  // ── Construction ───────────────────────────────────────────────────────

  it('should be a Panel widget with the correct CSS class', () => {
    expect(browser.hasClass('jp-WikiBrowser')).toBe(true);
  });

  it('should have a toolbar, search panel, page panel, and backlinks panel as children', () => {
    expect(browser.widgets.length).toBe(4);
  });

  it('should start with an empty active wiki id', () => {
    expect(browser.activeWikiId).toBe('');
  });

  it('should start with an empty page list', () => {
    expect(browser.pages.length).toBe(0);
  });

  // ── setActiveWiki / clearWiki ──────────────────────────────────────────

  it('should set activeWikiId after setActiveWiki', () => {
    (listPages as jest.Mock).mockResolvedValueOnce({ pages: [] });
    (getGitStatus as jest.Mock).mockResolvedValueOnce({
      branch: 'main', ahead: 0, behind: 0, dirty: false, untracked: 0
    });
    browser.setActiveWiki('test-id', 'Test Wiki', '/tmp/test');
    expect(browser.activeWikiId).toBe('test-id');
  });

  it('should display wiki name after setActiveWiki', () => {
    (listPages as jest.Mock).mockResolvedValueOnce({ pages: [] });
    (getGitStatus as jest.Mock).mockResolvedValueOnce({
      branch: 'main', ahead: 0, behind: 0, dirty: false, untracked: 0
    });
    browser.setActiveWiki('w1', 'My Wiki', '/tmp/w1');
    const nameEl = browser.node.querySelector('.jp-WikiBrowser-wikiName');
    expect(nameEl?.textContent).toBe('My Wiki');
  });

  it('should hide init button after setActiveWiki', () => {
    (listPages as jest.Mock).mockResolvedValueOnce({ pages: [] });
    (getGitStatus as jest.Mock).mockResolvedValueOnce({
      branch: 'main', ahead: 0, behind: 0, dirty: false, untracked: 0
    });
    browser.setActiveWiki('w1', 'My Wiki', '/tmp/w1');
    const initBtn = browser.node.querySelector(
      '[aria-label="Initialize wiki in current directory"]'
    ) as HTMLButtonElement | null;
    expect(initBtn?.style.display).toBe('none');
  });

  it('should enable new-page button after setActiveWiki', () => {
    (listPages as jest.Mock).mockResolvedValueOnce({ pages: [] });
    (getGitStatus as jest.Mock).mockResolvedValueOnce({
      branch: 'main', ahead: 0, behind: 0, dirty: false, untracked: 0
    });
    browser.setActiveWiki('w1', 'My Wiki', '/tmp/w1');
    const newBtn = browser.node.querySelector(
      '[aria-label="New page"]'
    ) as HTMLButtonElement | null;
    expect(newBtn?.disabled).toBe(false);
  });

  it('should clear activeWikiId after clearWiki', () => {
    (listPages as jest.Mock).mockResolvedValueOnce({ pages: [] });
    (getGitStatus as jest.Mock).mockResolvedValueOnce({
      branch: 'main', ahead: 0, behind: 0, dirty: false, untracked: 0
    });
    browser.setActiveWiki('w1', 'My Wiki', '/tmp/w1');
    browser.clearWiki();
    expect(browser.activeWikiId).toBe('');
  });

  it('should show init button after clearWiki', () => {
    browser.clearWiki();
    const initBtn = browser.node.querySelector(
      '[aria-label="Initialize wiki in current directory"]'
    ) as HTMLButtonElement | null;
    expect(initBtn?.style.display).not.toBe('none');
  });

  it('should disable new-page button after clearWiki', () => {
    browser.clearWiki();
    const newBtn = browser.node.querySelector(
      '[aria-label="New page"]'
    ) as HTMLButtonElement | null;
    expect(newBtn?.disabled).toBe(true);
  });

  // ── Page loading ───────────────────────────────────────────────────────

  it('should show a placeholder when no wiki is selected', async () => {
    await browser.loadPages();
    const placeholder = browser.node.querySelector('.jp-WikiBrowser-placeholder');
    expect(placeholder?.textContent).toContain('Navigate to a folder');
  });

  it('should load and render pages for a selected wiki', async () => {
    const mockPages: PageEntry[] = [
      { slug: 'home', title: 'Home', mtime: '2024-01-01T00:00:00Z' },
      { slug: 'about', title: 'About', mtime: '2024-01-02T00:00:00Z' },
      { slug: 'contact', title: 'Contact', mtime: '2024-01-03T00:00:00Z' }
    ];

    (listPages as jest.Mock).mockResolvedValueOnce({ pages: mockPages });
    (getGitStatus as jest.Mock).mockResolvedValueOnce({
      branch: 'main', ahead: 0, behind: 0, dirty: false, untracked: 0
    });

    browser.setActiveWiki('test', 'Test', '/tmp/test');
    // setActiveWiki calls loadPages internally — wait for it
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(browser.pages).toHaveLength(3);
    const links = browser.node.querySelectorAll('.jp-WikiBrowser-pageLink');
    expect(links).toHaveLength(3);
    expect(links[0].textContent).toBe('Home');
    expect(links[1].textContent).toBe('About');
    expect(links[2].textContent).toBe('Contact');
  });

  it('should handle API errors gracefully', async () => {
    (listPages as jest.Mock).mockRejectedValueOnce(new Error('Connection refused'));
    (getGitStatus as jest.Mock).mockResolvedValueOnce({
      branch: 'main', ahead: 0, behind: 0, dirty: false, untracked: 0
    });

    browser.setActiveWiki('fail', 'Fail', '/tmp/fail');
    await new Promise(resolve => setTimeout(resolve, 50));

    const placeholder = browser.node.querySelector('.jp-WikiBrowser-placeholder');
    expect(placeholder?.textContent).toContain('Failed to load pages');
    expect(browser.pages).toHaveLength(0);
  });

  it('should show a no-pages message for empty wiki', async () => {
    (listPages as jest.Mock).mockResolvedValueOnce({ pages: [] });
    (getGitStatus as jest.Mock).mockResolvedValueOnce({
      branch: 'main', ahead: 0, behind: 0, dirty: false, untracked: 0
    });

    browser.setActiveWiki('empty', 'Empty', '/tmp/empty');
    await new Promise(resolve => setTimeout(resolve, 50));

    const placeholder = browser.node.querySelector('.jp-WikiBrowser-placeholder');
    expect(placeholder?.textContent).toBe('No pages in this wiki.');
  });

  // ── Signal emission ────────────────────────────────────────────────────

  it('should carry the correct values in the wikiSelected signal', () => {
    browser.wikiSelected.oldValue = '';
    browser.wikiSelected.newValue = '';
    browser._emitWikiSelected('notes');
    expect(browser.wikiSelected.oldValue).toBe('');
    expect(browser.wikiSelected.newValue).toBe('notes');
  });

  // ── Git status indicator ───────────────────────────────────────────────

  it('should have a git status element in the toolbar', () => {
    const gitStatusEl = browser.node.querySelector('.jp-WikiBrowser-gitStatus');
    expect(gitStatusEl).toBeTruthy();
  });

  it('should have pull and push buttons in the toolbar', () => {
    const pullBtn = browser.node.querySelector('.jp-WikiBrowser-gitBtn');
    const pushBtns = browser.node.querySelectorAll('.jp-WikiBrowser-gitBtn');
    expect(pullBtn).toBeTruthy();
    expect(pushBtns).toHaveLength(2);
  });

  it('should show disabled buttons when no wiki is selected', async () => {
    await browser.refreshGitStatus();
    const pullBtn = browser.node.querySelector('.jp-WikiBrowser-gitBtn') as HTMLButtonElement;
    const pushBtn = browser.node.querySelectorAll('.jp-WikiBrowser-gitBtn')[1] as HTMLButtonElement;
    expect(pullBtn.disabled).toBe(true);
    expect(pushBtn.disabled).toBe(true);
  });

  it('should display branch and ahead/behind after successful git status fetch', async () => {
    (getGitStatus as jest.Mock).mockResolvedValueOnce({
      branch: 'main', ahead: 3, behind: 1, dirty: false, untracked: 0
    });
    (listPages as jest.Mock).mockResolvedValueOnce({ pages: [] });

    browser.setActiveWiki('test', 'Test', '/tmp/test');
    await new Promise(resolve => setTimeout(resolve, 50));

    const gitStatusEl = browser.node.querySelector('.jp-WikiBrowser-gitStatus');
    expect(gitStatusEl?.textContent).toContain('main');
    expect(gitStatusEl?.textContent).toContain('↑3');
    expect(gitStatusEl?.textContent).toContain('↓1');
  });

  it('should display dirty indicator when repo is dirty', async () => {
    (getGitStatus as jest.Mock).mockResolvedValueOnce({
      branch: 'develop', ahead: 0, behind: 0, dirty: true, untracked: 2
    });
    (listPages as jest.Mock).mockResolvedValueOnce({ pages: [] });

    browser.setActiveWiki('test', 'Test', '/tmp/test');
    await new Promise(resolve => setTimeout(resolve, 50));

    const gitStatusEl = browser.node.querySelector('.jp-WikiBrowser-gitStatus');
    expect(gitStatusEl?.textContent).toContain('develop');
    expect(gitStatusEl?.textContent).toContain('●');
  });

  it('should clear git status when no wiki is selected', async () => {
    await browser.refreshGitStatus();
    const gitStatusEl = browser.node.querySelector('.jp-WikiBrowser-gitStatus');
    expect(gitStatusEl?.textContent).toBe('—');
  });

  it('should handle git status API error gracefully', async () => {
    (getGitStatus as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
    (listPages as jest.Mock).mockResolvedValueOnce({ pages: [] });

    browser.setActiveWiki('test', 'Test', '/tmp/test');
    await new Promise(resolve => setTimeout(resolve, 50));

    const gitStatusEl = browser.node.querySelector('.jp-WikiBrowser-gitStatus');
    expect(gitStatusEl?.textContent).toBe('error');
  });

  // ── Git pull ───────────────────────────────────────────────────────────

  it('should call gitPull when pull button is clicked', async () => {
    (getGitStatus as jest.Mock).mockResolvedValueOnce({
      branch: 'main', ahead: 0, behind: 0, dirty: false, untracked: 0
    });
    (gitPull as jest.Mock).mockResolvedValueOnce({ message: 'Git pull successful' });
    (listPages as jest.Mock).mockResolvedValueOnce({ pages: [] });

    browser.setActiveWiki('test', 'Test', '/tmp/test');
    await new Promise(resolve => setTimeout(resolve, 50));

    const pullBtn = browser.node.querySelector('.jp-WikiBrowser-gitBtn') as HTMLButtonElement;
    expect(pullBtn.disabled).toBe(false);
    pullBtn.click();
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(gitPull).toHaveBeenCalledWith('test', mockServerSettings);
  });

  // ── Git push ───────────────────────────────────────────────────────────

  it('should call gitPush when push button is clicked', async () => {
    (getGitStatus as jest.Mock).mockResolvedValueOnce({
      branch: 'main', ahead: 0, behind: 0, dirty: false, untracked: 0
    });
    (gitPush as jest.Mock).mockResolvedValueOnce({ message: 'Git push successful' });
    (listPages as jest.Mock).mockResolvedValueOnce({ pages: [] });

    browser.setActiveWiki('test', 'Test', '/tmp/test');
    await new Promise(resolve => setTimeout(resolve, 50));

    const pushBtn = browser.node.querySelectorAll('.jp-WikiBrowser-gitBtn')[1] as HTMLButtonElement;
    expect(pushBtn.disabled).toBe(false);
    pushBtn.click();
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(gitPush).toHaveBeenCalledWith('test', mockServerSettings);
  });

  // ── Backlinks ──────────────────────────────────────────────────────────

  it('should have a backlinks panel as a child widget', () => {
    const backlinksPanel = browser.widgets[3] as any;
    expect(backlinksPanel).toBeTruthy();
    expect(backlinksPanel.hasClass('jp-WikiBrowser-backlinksPanel')).toBe(true);
  });

  it('should show backlinks title without count initially', () => {
    const title = browser.node.querySelector('.jp-WikiBrowser-backlinksTitle');
    expect(title?.textContent).toBe('Backlinks');
  });

  it('should load and render backlinks after loadPage', async () => {
    (listPages as jest.Mock).mockResolvedValueOnce({
      pages: [{ slug: 'home', title: 'Home', mtime: '2024-01-01' }]
    });
    (getPage as jest.Mock).mockResolvedValueOnce({ content: '# Home', head_sha: 'abc123' });
    (getBacklinks as jest.Mock).mockResolvedValueOnce({ backlinks: ['about.md', 'contact.md'] });
    (getGitStatus as jest.Mock).mockResolvedValueOnce({
      branch: 'main', ahead: 0, behind: 0, dirty: false, untracked: 0
    });

    browser.setActiveWiki('test', 'Test', '/tmp/test');
    await new Promise(resolve => setTimeout(resolve, 50));
    await browser.loadPage('home');
    await new Promise(resolve => setTimeout(resolve, 50));

    const backlinks = browser.node.querySelectorAll('.jp-WikiBrowser-backlinkLink');
    expect(backlinks).toHaveLength(2);
    expect(backlinks[0].textContent).toBe('about.md');
    expect(backlinks[1].textContent).toBe('contact.md');
  });

  it('should show backlink count when results exist', async () => {
    (listPages as jest.Mock).mockResolvedValueOnce({
      pages: [{ slug: 'home', title: 'Home', mtime: '2024-01-01' }]
    });
    (getPage as jest.Mock).mockResolvedValueOnce({ content: '# Home', head_sha: 'abc123' });
    (getBacklinks as jest.Mock).mockResolvedValueOnce({
      backlinks: ['about.md', 'contact.md', 'index.md']
    });
    (getGitStatus as jest.Mock).mockResolvedValueOnce({
      branch: 'main', ahead: 0, behind: 0, dirty: false, untracked: 0
    });

    browser.setActiveWiki('test', 'Test', '/tmp/test');
    await new Promise(resolve => setTimeout(resolve, 50));
    await browser.loadPage('home');
    await new Promise(resolve => setTimeout(resolve, 50));

    const title = browser.node.querySelector('.jp-WikiBrowser-backlinksTitle');
    expect(title?.textContent).toBe('Backlinks (3)');
  });

  it('should handle backlinks API error gracefully', async () => {
    (listPages as jest.Mock).mockResolvedValueOnce({
      pages: [{ slug: 'home', title: 'Home', mtime: '2024-01-01' }]
    });
    (getPage as jest.Mock).mockResolvedValueOnce({ content: '# Home', head_sha: 'abc123' });
    (getBacklinks as jest.Mock).mockRejectedValueOnce(new Error('API error'));
    (getGitStatus as jest.Mock).mockResolvedValueOnce({
      branch: 'main', ahead: 0, behind: 0, dirty: false, untracked: 0
    });

    browser.setActiveWiki('test', 'Test', '/tmp/test');
    await new Promise(resolve => setTimeout(resolve, 50));
    await browser.loadPage('home');
    await new Promise(resolve => setTimeout(resolve, 50));

    const title = browser.node.querySelector('.jp-WikiBrowser-backlinksTitle');
    expect(title?.textContent).toBe('Backlinks');
  });
});
