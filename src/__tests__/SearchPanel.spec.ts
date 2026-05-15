/**
 * Unit tests for the SearchPanel full-text search results panel.
 *
 * Tests cover construction, query input, search execution, result
 * list rendering, and click-to-select using a headless JSDOM
 * environment.
 */

import { SearchPanel } from '../components/SearchPanel';
import type { SearchResult } from '../types';

// ── Mock the API layer ──────────────────────────────────────────────────────

jest.mock('../wikiApi', () => ({
  searchWiki: jest.fn()
}));

import { searchWiki } from '../wikiApi';

// Minimal server settings object for API calls.
const mockServerSettings: any = {
  baseUrl: 'http://localhost:8888/',
  token: '',
  baseUrlResolved: 'http://localhost:8888/'
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const MOCK_RESULTS: SearchResult[] = [
  { file: 'docs/guide.md', line: 12, content: 'This is a search match' },
  { file: 'docs/api.md', line: 45, content: 'Another match here' }
];

const MOCK_EMPTY: SearchResult[] = [];

// ── Tests ───────────────────────────────────────────────────────────────────

describe('SearchPanel', () => {
  let searchPanel: SearchPanel;

  beforeEach(() => {
    document.body.innerHTML = '';
    searchPanel = new SearchPanel();
    searchPanel.serverSettings = mockServerSettings;
    (searchWiki as jest.Mock).mockReset();
  });

  afterEach(() => {
    searchPanel.dispose();
  });

  // ── Construction ───────────────────────────────────────────────────────

  it('should be a Panel widget with the correct CSS class', () => {
    expect(searchPanel.hasClass('jp-SearchPanel')).toBe(true);
  });

  it('should have query bar and results as children', () => {
    expect(searchPanel.widgets.length).toBe(2);
  });

  it('should start with empty search results', () => {
    expect(searchPanel.results).toEqual([]);
  });

  it('should start with an empty query input', () => {
    expect(searchPanel.query).toBe('');
  });

  it('should start with loading=false', () => {
    expect(searchPanel.loading).toBe(false);
  });

  // ── SearchPanel-query: Query input and search button ─────────────────────

  it('should have a search input and button', () => {
    const inputs = searchPanel.node.querySelectorAll('.jp-SearchPanel-input');
    expect(inputs.length).toBe(1);

    const buttons = searchPanel.node.querySelectorAll('.jp-SearchPanel-btn');
    expect(buttons.length).toBe(1);
  });

  it('should have correct placeholder text on the search input', () => {
    const input = searchPanel.node.querySelector(
      '.jp-SearchPanel-input'
    ) as HTMLInputElement;
    expect(input.placeholder).toBe('Search wiki content…');
  });

  it('should label the search button correctly', () => {
    const buttons = searchPanel.node.querySelectorAll('.jp-SearchPanel-btn');
    expect(buttons[0]?.textContent).toBe('Search');
  });

  // ── SearchPanel-execution: Execute search via API ────────────────────────

  it('should call searchWiki and render results on search()', async () => {
    (searchWiki as jest.Mock).mockResolvedValueOnce({
      results: MOCK_RESULTS
    });

    await searchPanel.search('wiki-a', 'match');

    expect(searchWiki).toHaveBeenCalledWith(
      'wiki-a',
      'match',
      false,
      mockServerSettings
    );
    expect(searchPanel.results).toEqual(MOCK_RESULTS);
  });

  it('should set the input value to the search term', async () => {
    (searchWiki as jest.Mock).mockResolvedValueOnce({ results: MOCK_RESULTS });

    await searchPanel.search('wiki-a', 'hello');
    const input = searchPanel.node.querySelector(
      '.jp-SearchPanel-input'
    ) as HTMLInputElement;
    expect(input.value).toBe('hello');
  });

  it('should show loading state while searching', async () => {
    // Return a promise that never resolves to simulate loading
    const pendingPromise = new Promise<never>(() => {});
    (searchWiki as jest.Mock).mockReturnValueOnce(pendingPromise);

    searchPanel.search('wiki-a', 'test').catch(() => {});

    // Use a short delay to allow the async function to set loading=true
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(searchPanel.loading).toBe(true);

    const loadingRows = searchPanel.node.querySelectorAll(
      '.jp-SearchPanel-rowLoading'
    );
    expect(loadingRows.length).toBe(1);
  });

  it('should show empty message when search returns no results', async () => {
    (searchWiki as jest.Mock).mockResolvedValueOnce({ results: MOCK_EMPTY });

    await searchPanel.search('wiki-a', 'zzzznotfound');

    expect(searchPanel.results).toEqual([]);

    const emptyRows = searchPanel.node.querySelectorAll(
      '.jp-SearchPanel-rowEmpty'
    );
    expect(emptyRows.length).toBe(1);
    const emptyMsg = emptyRows[0]?.querySelector('.jp-SearchPanel-col');
    expect(emptyMsg?.textContent).toBe('No results found.');
  });

  it('should show empty message when search API fails', async () => {
    (searchWiki as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    await searchPanel.search('wiki-a', 'test');

    expect(searchPanel.results).toEqual([]);

    const emptyRows = searchPanel.node.querySelectorAll(
      '.jp-SearchPanel-rowEmpty'
    );
    expect(emptyRows.length).toBe(1);
  });

  it('should skip search when wikiId is empty', async () => {
    await searchPanel.search('', 'test');

    expect(searchWiki).not.toHaveBeenCalled();
    expect(searchPanel.results).toEqual([]);
  });

  it('should skip search when serverSettings is not set', async () => {
    const panel = new SearchPanel();
    await panel.search('wiki-a', 'test');

    expect(searchWiki).not.toHaveBeenCalled();
    panel.dispose();
  });

  // ── SearchPanel-results: Render line-numbered results ────────────────────

  it('should render result rows with file, line, and content', async () => {
    (searchWiki as jest.Mock).mockResolvedValueOnce({
      results: MOCK_RESULTS
    });

    await searchPanel.search('wiki-a', 'match');

    const rows = searchPanel.node.querySelectorAll(
      '.jp-SearchPanel-row:not(.jp-SearchPanel-rowHeader)'
    );
    expect(rows.length).toBe(2);

    // First result
    expect(rows[0]?.getAttribute('data-file')).toBe('docs/guide.md');
    expect(rows[0]?.getAttribute('data-line')).toBe('12');
    expect(rows[0]?.getAttribute('data-content')).toBe(
      'This is a search match'
    );

    // Second result
    expect(rows[1]?.getAttribute('data-file')).toBe('docs/api.md');
    expect(rows[1]?.getAttribute('data-line')).toBe('45');
    expect(rows[1]?.getAttribute('data-content')).toBe('Another match here');
  });

  it('should display column headers', () => {
    const headers = searchPanel.node.querySelectorAll(
      '.jp-SearchPanel-rowHeader .jp-SearchPanel-col'
    );
    expect(headers[0]?.textContent).toBe('File');
    expect(headers[1]?.textContent).toBe('Line');
    expect(headers[2]?.textContent).toBe('Content');
  });

  // ── SearchPanel-results: Result click selection ──────────────────────────

  it('should emit resultSelected when a result row is clicked', async () => {
    (searchWiki as jest.Mock).mockResolvedValueOnce({
      results: MOCK_RESULTS
    });

    await searchPanel.search('wiki-a', 'match');

    const signalSpy = jest.fn();
    searchPanel.resultSelected.connect((_, args) => {
      signalSpy(args);
    });

    const rows = searchPanel.node.querySelectorAll(
      '.jp-SearchPanel-row:not(.jp-SearchPanel-rowHeader)'
    );
    rows[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(signalSpy).toHaveBeenCalledTimes(1);
    expect(signalSpy.mock.calls[0][0]).toEqual({
      file: 'docs/guide.md',
      line: 12,
      content: 'This is a search match'
    });
  });

  it('should not emit resultSelected when clicking non-row elements', async () => {
    (searchWiki as jest.Mock).mockResolvedValueOnce({
      results: MOCK_RESULTS
    });

    await searchPanel.search('wiki-a', 'match');

    const signalSpy = jest.fn();
    searchPanel.resultSelected.connect((_, args) => {
      signalSpy(args);
    });

    // Click the container itself (not a row)
    const container = searchPanel.node.querySelector(
      '.jp-SearchPanel-container'
    );
    container?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(signalSpy).not.toHaveBeenCalled();
  });

  // ── SearchPanel-execution: Enter key triggers search ─────────────────────

  it('should trigger search on Enter key in input', async () => {
    (searchWiki as jest.Mock).mockResolvedValueOnce({ results: MOCK_RESULTS });
    (searchWiki as jest.Mock).mockReset().mockResolvedValueOnce({
      results: MOCK_RESULTS
    });

    const input = searchPanel.node.querySelector(
      '.jp-SearchPanel-input'
    ) as HTMLInputElement;
    input.value = 'enter search';

    const signalSpy = jest.fn();
    searchPanel.resultSelected.connect(() => {
      signalSpy();
    });

    // Set wikiId first
    searchPanel.setWikiId('wiki-a');

    // Trigger Enter keydown
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );

    // Wait for async search
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(searchWiki).toHaveBeenCalledWith(
      'wiki-a',
      'enter search',
      false,
      mockServerSettings
    );
  });

  // ── SearchPanel-execution: Clear ─────────────────────────────────────────

  it('should clear input and results on clear()', () => {
    searchPanel.clear();

    const input = searchPanel.node.querySelector(
      '.jp-SearchPanel-input'
    ) as HTMLInputElement;
    expect(input.value).toBe('');
    expect(searchPanel.results).toEqual([]);
    expect(searchPanel.loading).toBe(false);
  });

  // ── SearchPanel-execution: setWikiId ─────────────────────────────────────

  it('should store the wiki ID via setWikiId', () => {
    searchPanel.setWikiId('my-wiki');
    // The wikiId is used internally by _onSearch — verify via search call
    (searchWiki as jest.Mock).mockResolvedValueOnce({ results: MOCK_RESULTS });

    // Directly call search with wiki ID set via setWikiId
    // We can verify the internal state by checking that _onSearch uses it
    const input = searchPanel.node.querySelector(
      '.jp-SearchPanel-input'
    ) as HTMLInputElement;
    input.value = 'test';

    // Trigger search via button click
    const buttons = searchPanel.node.querySelectorAll('.jp-SearchPanel-btn');
    (buttons[0] as HTMLButtonElement).click();

    expect(searchWiki).toHaveBeenCalledWith(
      'my-wiki',
      'test',
      false,
      mockServerSettings
    );
  });
});
