/**
 * Unit tests for the WikiBrowser sidebar panel.
 *
 * Tests cover construction, wiki population, page loading, and placeholder
 * rendering using a headless JSDOM environment.
 */

import { WikiBrowser } from '../components/WikiBrowser';
import type { WikiInfo, PageEntry } from '../types';

// ── Mock the API layer ──────────────────────────────────────────────────────

jest.mock('../wikiApi', () => ({
  listPages: jest.fn(),
  getGitStatus: jest.fn(),
  gitPull: jest.fn(),
  gitPush: jest.fn()
}));

import { listPages, getGitStatus, gitPull, gitPush } from '../wikiApi';

// Minimal server settings object for API calls.
const mockServerSettings: any = {
  baseUrl: 'http://localhost:8888/',
  token: '',
  baseUrlResolved: 'http://localhost:8888/'
};

describe('WikiBrowser', () => {
  let browser: WikiBrowser;

  beforeEach(() => {
    // Ensure a clean DOM for each test.
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

  it('should have a toolbar and page panel as children', () => {
    expect(browser.widgets.length).toBe(2);
  });

  it('should start with an empty active wiki selection', () => {
    expect(browser.activeWikiId).toBe('');
  });

  it('should start with an empty page list', () => {
    expect(browser.pages.length).toBe(0);
  });

  // ── Wiki population ────────────────────────────────────────────────────

  it('should populate the dropdown with wikis', () => {
    const wikis: Record<string, WikiInfo> = {
      notes: { id: 'notes', name: 'My Notes', path: '/tmp/notes' },
      team: { id: 'team', name: 'Team Wiki', path: '/tmp/team' }
    };

    browser.populateWikis(wikis);

    const options = Array.from(browser._wikiSelect.options);
    expect(options).toHaveLength(3); // default + 2 wikis
    expect(options[1].value).toBe('notes');
    expect(options[1].textContent).toBe('My Notes');
    expect(options[2].value).toBe('team');
    expect(options[2].textContent).toBe('Team Wiki');
  });

  it('should restore the previous selection after repopulation', () => {
    const wikis1: Record<string, WikiInfo> = {
      a: { id: 'a', name: 'Wiki A', path: '/tmp/a' },
      b: { id: 'b', name: 'Wiki B', path: '/tmp/b' }
    };

    browser.populateWikis(wikis1);
    browser._wikiSelect.value = 'b';
    expect(browser.activeWikiId).toBe('b');

    const wikis2: Record<string, WikiInfo> = {
      b: { id: 'b', name: 'Wiki B', path: '/tmp/b' },
      c: { id: 'c', name: 'Wiki C', path: '/tmp/c' }
    };

    browser.populateWikis(wikis2);
    // Selection should still be 'b'
    expect(browser.activeWikiId).toBe('b');
  });

  // ── Page loading ───────────────────────────────────────────────────────

  it('should show a placeholder when no wiki is selected', async () => {
    await browser.loadPages();
    const placeholder = browser.node.querySelector(
      '.jp-WikiBrowser-placeholder'
    );
    expect(placeholder?.textContent).toBe('Select a wiki to browse its pages.');
  });

  it('should load and render pages for a selected wiki', async () => {
    const mockPages: PageEntry[] = [
      { slug: 'home', title: 'Home', mtime: '2024-01-01T00:00:00Z' },
      { slug: 'about', title: 'About', mtime: '2024-01-02T00:00:00Z' },
      { slug: 'contact', title: 'Contact', mtime: '2024-01-03T00:00:00Z' }
    ];

    (listPages as jest.Mock).mockResolvedValueOnce({ pages: mockPages });

    browser.populateWikis({
      test: { id: 'test', name: 'Test', path: '/tmp/test' }
    });
    browser._wikiSelect.value = 'test';
    await browser.loadPages();

    expect(browser.pages).toHaveLength(3);

    const links = browser.node.querySelectorAll('.jp-WikiBrowser-pageLink');
    expect(links).toHaveLength(3);
    expect(links[0].textContent).toBe('Home');
    expect(links[1].textContent).toBe('About');
    expect(links[2].textContent).toBe('Contact');
  });

  it('should handle API errors gracefully', async () => {
    (listPages as jest.Mock).mockRejectedValueOnce(
      new Error('Connection refused')
    );

    browser.populateWikis({
      fail: { id: 'fail', name: 'Fail', path: '/tmp/fail' }
    });
    browser._wikiSelect.value = 'fail';
    await browser.loadPages();

    const placeholder = browser.node.querySelector(
      '.jp-WikiBrowser-placeholder'
    );
    expect(placeholder?.textContent).toContain('Failed to load pages');
    expect(browser.pages).toHaveLength(0);
  });

  it('should show a no-pages message for empty wiki', async () => {
    (listPages as jest.Mock).mockResolvedValueOnce({ pages: [] });

    browser.populateWikis({
      empty: { id: 'empty', name: 'Empty', path: '/tmp/empty' }
    });
    browser._wikiSelect.value = 'empty';
    await browser.loadPages();

    const placeholder = browser.node.querySelector(
      '.jp-WikiBrowser-placeholder'
    );
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
    const pushBtn = browser.node.querySelectorAll('.jp-WikiBrowser-gitBtn');
    expect(pullBtn).toBeTruthy();
    expect(pushBtn).toHaveLength(2);
  });

  it('should show disabled buttons when no wiki is selected', async () => {
    await browser.refreshGitStatus();
    const pullBtn = browser.node.querySelector(
      '.jp-WikiBrowser-gitBtn'
    ) as HTMLButtonElement;
    const pushBtn = browser.node.querySelectorAll(
      '.jp-WikiBrowser-gitBtn'
    )[1] as HTMLButtonElement;
    expect(pullBtn.disabled).toBe(true);
    expect(pushBtn.disabled).toBe(true);
  });

  it('should display branch and ahead/behind after successful git status fetch', async () => {
    (getGitStatus as jest.Mock).mockResolvedValueOnce({
      branch: 'main',
      ahead: 3,
      behind: 1,
      dirty: false,
      untracked: 0
    });

    browser.populateWikis({
      test: { id: 'test', name: 'Test', path: '/tmp/test' }
    });
    browser._wikiSelect.value = 'test';
    await browser.refreshGitStatus();

    const gitStatusEl = browser.node.querySelector('.jp-WikiBrowser-gitStatus');
    expect(gitStatusEl?.textContent).toContain('main');
    expect(gitStatusEl?.textContent).toContain('↑3');
    expect(gitStatusEl?.textContent).toContain('↓1');
  });

  it('should display dirty indicator when repo is dirty', async () => {
    (getGitStatus as jest.Mock).mockResolvedValueOnce({
      branch: 'develop',
      ahead: 0,
      behind: 0,
      dirty: true,
      untracked: 2
    });

    browser.populateWikis({
      test: { id: 'test', name: 'Test', path: '/tmp/test' }
    });
    browser._wikiSelect.value = 'test';
    await browser.refreshGitStatus();

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
    (getGitStatus as jest.Mock).mockRejectedValueOnce(
      new Error('Network error')
    );

    browser.populateWikis({
      test: { id: 'test', name: 'Test', path: '/tmp/test' }
    });
    browser._wikiSelect.value = 'test';
    await browser.refreshGitStatus();

    const gitStatusEl = browser.node.querySelector('.jp-WikiBrowser-gitStatus');
    expect(gitStatusEl?.textContent).toBe('error');
  });

  // ── Git pull ───────────────────────────────────────────────────────────

  it('should call gitPull when pull button is clicked', async () => {
    (getGitStatus as jest.Mock).mockResolvedValueOnce({
      branch: 'main',
      ahead: 0,
      behind: 0,
      dirty: false,
      untracked: 0
    });
    (gitPull as jest.Mock).mockResolvedValueOnce({
      message: 'Git pull successful'
    });
    (listPages as jest.Mock).mockResolvedValueOnce({ pages: [] });

    browser.populateWikis({
      test: { id: 'test', name: 'Test', path: '/tmp/test' }
    });
    browser._wikiSelect.value = 'test';
    await browser.refreshGitStatus();

    const pullBtn = browser.node.querySelector(
      '.jp-WikiBrowser-gitBtn'
    ) as HTMLButtonElement;
    expect(pullBtn.disabled).toBe(false);
    pullBtn.click();

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(gitPull).toHaveBeenCalledWith('test', mockServerSettings);
  });

  // ── Git push ───────────────────────────────────────────────────────────

  it('should call gitPush when push button is clicked', async () => {
    (getGitStatus as jest.Mock).mockResolvedValueOnce({
      branch: 'main',
      ahead: 0,
      behind: 0,
      dirty: false,
      untracked: 0
    });
    (gitPush as jest.Mock).mockResolvedValueOnce({
      message: 'Git push successful'
    });

    browser.populateWikis({
      test: { id: 'test', name: 'Test', path: '/tmp/test' }
    });
    browser._wikiSelect.value = 'test';
    await browser.refreshGitStatus();

    const pushBtn = browser.node.querySelectorAll(
      '.jp-WikiBrowser-gitBtn'
    )[1] as HTMLButtonElement;
    expect(pushBtn.disabled).toBe(false);
    pushBtn.click();

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(gitPush).toHaveBeenCalledWith('test', mockServerSettings);
  });
});
