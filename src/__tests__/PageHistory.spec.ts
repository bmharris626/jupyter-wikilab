/**
 * Unit tests for the PageHistory commit list panel.
 *
 * Tests cover construction, history loading, commit list rendering,
 * and placeholder display using a headless JSDOM environment.
 */

import { PageHistory } from '../components/PageHistory';
import type { CommitEntry } from '../types';

// ── Mock the API layer ──────────────────────────────────────────────────────

jest.mock('../wikiApi', () => ({
  getPageHistory: jest.fn(),
  getPageContentAtSha: jest.fn()
}));

import { getPageHistory, getPageContentAtSha } from '../wikiApi';

// Minimal server settings object for API calls.
const mockServerSettings: any = {
  baseUrl: 'http://localhost:8888/',
  token: '',
  baseUrlResolved: 'http://localhost:8888/'
};

describe('PageHistory', () => {
  let historyPanel: PageHistory;

  beforeEach(() => {
    document.body.innerHTML = '';
    historyPanel = new PageHistory();
    historyPanel.serverSettings = mockServerSettings;
  });

  afterEach(() => {
    historyPanel.dispose();
  });

  // ── Construction ───────────────────────────────────────────────────────

  it('should be a Panel widget with the correct CSS class', () => {
    expect(historyPanel.hasClass('jp-PageHistory')).toBe(true);
  });

  it('should have a header, table, and content panel as children', () => {
    expect(historyPanel.widgets.length).toBe(3);
  });

  it('should start with an empty commit list', () => {
    expect(historyPanel.commits).toHaveLength(0);
  });

  it('should start with loading set to false', () => {
    expect(historyPanel.loading).toBe(false);
  });

  // ── PageHistory-list: Render history entries for current page ──────────

  it('PageHistory-list should render commit entries in a table', async () => {
    const mockCommits: CommitEntry[] = [
      {
        sha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
        message: 'Update: Home page',
        author: 'Alice',
        author_email: 'alice@wikilab',
        date: '2024-03-15T10:30:00Z'
      },
      {
        sha: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
        message: 'Initial commit',
        author: 'Bob',
        author_email: 'bob@wikilab',
        date: '2024-03-14T08:00:00Z'
      }
    ];

    (getPageHistory as jest.Mock).mockResolvedValueOnce({
      history: mockCommits
    });

    await historyPanel.loadHistory('test-wiki', 'home');

    expect(historyPanel.commits).toHaveLength(2);
    expect(historyPanel.loading).toBe(false);

    const rows = historyPanel.node.querySelectorAll(
      '.jp-PageHistory-row:not(.jp-PageHistory-rowHeader)'
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute('data-sha')).toBe(
      'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'
    );
    expect(rows[0].getAttribute('data-message')).toBe('Update: Home page');
    expect(rows[0].getAttribute('data-author')).toBe('Alice');
    expect(rows[1].getAttribute('data-message')).toBe('Initial commit');
  });

  it('should show a loading placeholder while fetching history', async () => {
    // Mock to resolve after a small delay so we can check the loading state
    let resolvePromise: () => void;
    const pendingPromise = new Promise<void>(resolve => {
      resolvePromise = resolve;
    });

    (getPageHistory as jest.Mock).mockImplementation(() => pendingPromise);

    // Start loading but don't await yet
    const loadPromise = historyPanel.loadHistory('test-wiki', 'home');

    // At this point loading should be true
    expect(historyPanel.loading).toBe(true);

    // Now resolve the mock
    resolvePromise!();

    // Wait for the load to complete
    await loadPromise;

    expect(historyPanel.loading).toBe(false);
  });

  it('should render commit entries when history is loaded', async () => {
    const mockCommits: CommitEntry[] = [
      {
        sha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
        message: 'Update: Home page',
        author: 'Alice',
        author_email: 'alice@wikilab',
        date: '2024-03-15T10:30:00Z'
      },
      {
        sha: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
        message: 'Initial commit',
        author: 'Bob',
        author_email: 'bob@wikilab',
        date: '2024-03-14T08:00:00Z'
      }
    ];

    (getPageHistory as jest.Mock).mockResolvedValueOnce({
      history: mockCommits
    });

    await historyPanel.loadHistory('test-wiki', 'home');

    expect(historyPanel.commits).toHaveLength(2);
    expect(historyPanel.loading).toBe(false);

    // Check rendered rows (excluding header row)
    const rows = historyPanel.node.querySelectorAll(
      '.jp-PageHistory-row:not(.jp-PageHistory-rowHeader)'
    );
    expect(rows).toHaveLength(2);

    // Verify first row data
    expect(rows[0].getAttribute('data-sha')).toBe(
      'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'
    );
    expect(rows[0].getAttribute('data-message')).toBe('Update: Home page');
    expect(rows[0].getAttribute('data-author')).toBe('Alice');
  });

  it('should show a shortened SHA in the commit list', async () => {
    const mockCommits: CommitEntry[] = [
      {
        sha: 'abcdef1234567890abcdef1234567890abcdef12',
        message: 'Test commit',
        author: 'Charlie',
        author_email: 'charlie@wikilab',
        date: '2024-03-15T10:30:00Z'
      }
    ];

    (getPageHistory as jest.Mock).mockResolvedValueOnce({
      history: mockCommits
    });

    await historyPanel.loadHistory('test-wiki', 'home');

    const shaCells = historyPanel.node.querySelectorAll(
      '.jp-PageHistory-colSha'
    );
    // One for header, one for the commit
    expect(shaCells).toHaveLength(2);
    expect(shaCells[1].textContent).toBe('abcdef1');
  });

  it('should display the commit count in the header', async () => {
    const mockCommits: CommitEntry[] = [
      {
        sha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
        message: 'Commit 1',
        author: 'Author',
        author_email: 'author@wikilab',
        date: '2024-03-15T10:30:00Z'
      },
      {
        sha: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
        message: 'Commit 2',
        author: 'Author',
        author_email: 'author@wikilab',
        date: '2024-03-15T11:30:00Z'
      },
      {
        sha: 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
        message: 'Commit 3',
        author: 'Author',
        author_email: 'author@wikilab',
        date: '2024-03-15T12:30:00Z'
      }
    ];

    (getPageHistory as jest.Mock).mockResolvedValueOnce({
      history: mockCommits
    });

    await historyPanel.loadHistory('test-wiki', 'home');

    const countEl = historyPanel.node.querySelector('.jp-PageHistory-count');
    expect(countEl?.textContent).toBe('(3)');
  });

  it('should show an empty message when no commits exist', async () => {
    (getPageHistory as jest.Mock).mockResolvedValueOnce({
      history: []
    });

    await historyPanel.loadHistory('test-wiki', 'home');

    const emptyRows = historyPanel.node.querySelectorAll(
      '.jp-PageHistory-rowEmpty'
    );
    expect(emptyRows).toHaveLength(1);
    expect(
      historyPanel.node.querySelector('.jp-PageHistory-rowEmpty')?.textContent
    ).toBe('No commits found.');
  });

  it('should show the correct table column headers', () => {
    // The table structure is created in _createTable during construction
    const headerCols = historyPanel.node.querySelectorAll(
      '.jp-PageHistory-rowHeader .jp-PageHistory-col'
    );
    expect(headerCols).toHaveLength(4);
    expect(headerCols[0].textContent).toBe('SHA');
    expect(headerCols[1].textContent).toBe('Message');
    expect(headerCols[2].textContent).toBe('Author');
    expect(headerCols[3].textContent).toBe('Date');
  });

  it('should handle API errors gracefully', async () => {
    (getPageHistory as jest.Mock).mockRejectedValueOnce(
      new Error('Connection refused')
    );

    await historyPanel.loadHistory('test-wiki', 'home');

    expect(historyPanel.commits).toHaveLength(0);
    expect(historyPanel.loading).toBe(false);
  });

  it('should not load history when no wiki ID is provided', async () => {
    await historyPanel.loadHistory('', 'home');

    expect(historyPanel.commits).toHaveLength(0);
    expect(historyPanel.loading).toBe(false);
  });

  it('should format dates in the commit list', async () => {
    const mockCommits: CommitEntry[] = [
      {
        sha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
        message: 'Test commit',
        author: 'Author',
        author_email: 'author@wikilab',
        date: '2024-03-15T10:30:00Z'
      }
    ];

    (getPageHistory as jest.Mock).mockResolvedValueOnce({
      history: mockCommits
    });

    await historyPanel.loadHistory('test-wiki', 'home');

    const dateCells = historyPanel.node.querySelectorAll(
      '.jp-PageHistory-colDate'
    );
    // There should be a header date and a commit date
    expect(dateCells).toHaveLength(2);
    // The commit date should contain formatted content (not the raw ISO string)
    expect(dateCells[1].textContent).not.toBe('2024-03-15T10:30:00Z');
  });

  // ── Content panel ──────────────────────────────────────────────────────

  it('should start with null content', () => {
    expect(historyPanel.content).toBeNull();
  });

  it('should show loading text when fetching content at SHA', async () => {
    let resolvePromise: () => void;
    const pendingPromise = new Promise(resolve => {
      resolvePromise = () => resolve({ content: 'Hello world' } as any);
    });

    (getPageContentAtSha as jest.Mock).mockImplementation(() => pendingPromise);

    historyPanel.loadContentAtSha('test-wiki', 'home', 'abc1234');

    expect(historyPanel.content).toBe('(loading…)');

    resolvePromise!();
    await new Promise(r => setTimeout(r, 50));

    expect(historyPanel.content).toBe('Hello world');
  });

  it('should show empty content when no wiki ID is provided', async () => {
    await historyPanel.loadContentAtSha('', 'home', 'abc1234');
    expect(historyPanel.content).toBeNull();
  });

  it('should show error text when content fetch fails', async () => {
    (getPageContentAtSha as jest.Mock).mockRejectedValueOnce(
      new Error('Network error')
    );

    await historyPanel.loadContentAtSha('test-wiki', 'home', 'abc1234');

    expect(historyPanel.content).toContain('Failed to load content');
    expect(historyPanel.content).toContain('Network error');
  });

  it('should render content in the content panel', async () => {
    (getPageContentAtSha as jest.Mock).mockResolvedValueOnce({
      content: 'Hello, world!\n\nThis is historical content.'
    });

    await historyPanel.loadContentAtSha('test-wiki', 'home', 'abc1234');

    const contentBody = historyPanel.node.querySelector(
      '.jp-PageHistory-contentBody'
    );
    expect(contentBody?.textContent).toBe(
      'Hello, world!\n\nThis is historical content.'
    );
  });
});
