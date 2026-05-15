/**
 * Unit tests for src/components/WikiEditor.tsx
 *
 * Mocks heavy CM6/JupyterLab deps so the test suite can run without a full
 * JupyterLab environment. The component's own logic is tested with real
 * DOM via jsdom; only the editor factory and renderer are stubbed.
 */

// ── Mock @jupyterlab/codemirror (and its sub-imports) ───────────────────────

jest.mock('@jupyterlab/codemirror', () => ({
  jupyterTheme: []
}));

// ── Mock markdown renderer ──────────────────────────────────────────────────

jest.mock('../markdownRenderer', () => ({
  render: jest.fn((md: string) => `<div>${md}</div>`)
}));

// ── Mock savePage API ───────────────────────────────────────────────────────

jest.mock('../wikiApi', () => ({
  savePage: jest.fn()
}));

// ── Real imports ────────────────────────────────────────────────────────────

import { ServerConnection } from '@jupyterlab/services';

import { WikiEditor } from '../components/WikiEditor';
import type { PageEntry } from '../types';

import { render } from '../markdownRenderer';
import { savePage } from '../wikiApi';

// ── Helpers ─────────────────────────────────────────────────────────────────

function createFixture(): WikiEditor {
  return new WikiEditor();
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('WikiEditor', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  // ── Construction ──────────────────────────────────────────────────────

  it('constructs without throwing', () => {
    const editor = createFixture();
    expect(editor).toBeInstanceOf(WikiEditor);
  });

  it('has CSS class on root element', () => {
    const editor = createFixture();
    expect(editor.node.classList.contains('jp-WikiEditor')).toBe(true);
  });

  it('renders editor and preview panes', () => {
    const editor = createFixture();
    const cmHost = editor.node.querySelector('.jp-WikiEditor-cmEditor');
    const previewContent = editor.node.querySelector(
      '.jp-WikiEditor-previewContent'
    );
    expect(cmHost).not.toBeNull();
    expect(previewContent).not.toBeNull();
  });

  it('has preview toolbar with page title element', () => {
    const editor = createFixture();
    const pageTitle = editor.node.querySelector('.jp-WikiEditor-pageTitle');
    expect(pageTitle).not.toBeNull();
    expect(pageTitle?.textContent).toBe('Untitled');
  });

  // ── Page property ─────────────────────────────────────────────────────

  it('displays "Untitled" when page is null', () => {
    const editor = createFixture();
    expect(editor.page).toBeNull();
    const pageTitle = editor.node.querySelector('.jp-WikiEditor-pageTitle');
    expect(pageTitle?.textContent).toBe('Untitled');
  });

  it('updates page title display when page is set', () => {
    const editor = createFixture();
    const mockPage: PageEntry = {
      slug: 'my-page',
      title: 'My Page Title',
      mtime: '2025-01-01'
    };
    editor.page = mockPage;
    expect(editor.page).toEqual(mockPage);
    const pageTitle = editor.node.querySelector('.jp-WikiEditor-pageTitle');
    expect(pageTitle?.textContent).toContain('My Page Title');
  });

  // ── Content ───────────────────────────────────────────────────────────

  it('starts with empty content', () => {
    const editor = createFixture();
    expect(editor.content).toBe('');
  });

  it('setContent updates editor value', () => {
    const editor = createFixture();
    editor.setContent('# Hello\n\nWorld');
    expect(editor.content).toBe('# Hello\n\nWorld');
  });

  it('setContent updates preview HTML', () => {
    const editor = createFixture();
    editor.setContent('## Test');
    const previewEl = editor.node.querySelector(
      '.jp-WikiEditor-previewContent'
    ) as HTMLDivElement;
    expect(previewEl.innerHTML).toContain('Test');
  });

  it('calls markdownRenderer with editor content', () => {
    const editor = createFixture();
    editor.setContent('**bold**');
    expect(render).toHaveBeenCalledWith('**bold**');
  });

  it('addToHistory: true records a history step (undo reverts)', () => {
    const editor = createFixture();
    editor.setContent('version A', true);
    expect(editor.content).toBe('version A');
    editor.undo();
    expect(editor.content).toBe('');
  });

  it('addToHistory: false does NOT record a history step', () => {
    const editor = createFixture();
    // First set with addToHistory: true, then undo to verify it was recorded
    editor.setContent('version A', true);
    editor.undo();
    expect(editor.content).toBe('');

    // Now set with addToHistory: false
    editor.setContent('version B', false);
    expect(editor.content).toBe('version B');

    // Undo should NOT revert to empty — "version B" was not recorded
    editor.undo();
    expect(editor.content).toBe('version B');
  });

  // ── Signals ───────────────────────────────────────────────────────────

  it('emits contentChanged on setContent', () => {
    const editor = createFixture();
    const mockHandler = jest.fn();
    editor.contentChanged.connect(mockHandler);
    editor.setContent('changed content');
    expect(mockHandler).toHaveBeenCalledTimes(1);
    expect(mockHandler).toHaveBeenCalledWith(editor, {
      content: 'changed content'
    });
  });

  it('emits wikiLinkClicked on preview link click', () => {
    const editor = createFixture();
    editor.setContent('');
    const previewEl = editor.node.querySelector(
      '.jp-WikiEditor-previewContent'
    ) as HTMLDivElement;
    previewEl.innerHTML =
      '<a class="wikilab-wiki-link" data-wiki-target="TargetPage">Link</a>';

    const mockHandler = jest.fn();
    editor.wikiLinkClicked.connect(mockHandler);

    const link = previewEl.querySelector(
      '.wikilab-wiki-link'
    ) as HTMLAnchorElement;
    link.click();

    expect(mockHandler).toHaveBeenCalledTimes(1);
    expect(mockHandler).toHaveBeenCalledWith(editor, 'TargetPage');
  });

  // ── Focus ─────────────────────────────────────────────────────────────

  it('focus method does not throw', () => {
    const editor = createFixture();
    expect(() => editor.focus()).not.toThrow();
  });

  // ── Disposal ──────────────────────────────────────────────────────────

  it('dispose does not throw', () => {
    const editor = createFixture();
    expect(() => editor.dispose()).not.toThrow();
  });

  it('dispose after setContent does not throw', () => {
    const editor = createFixture();
    editor.setContent('some content');
    expect(() => editor.dispose()).not.toThrow();
  });

  // ── SetPage ───────────────────────────────────────────────────────────

  it('setPage stores wikiId, slug, and headSha', () => {
    const editor = createFixture();
    editor.setPage('my-wiki', 'my-page', 'abc123');
    // Private fields are not directly accessible, but we can verify
    // the save button starts as clean (no dirty marker).
    const saveBtn = editor.node.querySelector(
      '.jp-WikiEditor-saveBtn'
    ) as HTMLButtonElement;
    expect(saveBtn?.textContent).toBe('Save');
  });

  // ── markDirty ─────────────────────────────────────────────────────────

  it('markDirty shows asterisk on save button', () => {
    const editor = createFixture();
    editor.setPage('my-wiki', 'my-page');
    editor.markDirty();
    const saveBtn = editor.node.querySelector(
      '.jp-WikiEditor-saveBtn'
    ) as HTMLButtonElement;
    expect(saveBtn?.textContent).toBe('Save *');
  });

  it('setContent triggers markDirty via contentChanged', () => {
    const editor = createFixture();
    editor.setPage('my-wiki', 'my-page');
    editor.setContent('initial', true); // addToHistory: true to avoid history annotation issues
    const saveBtn = editor.node.querySelector(
      '.jp-WikiEditor-saveBtn'
    ) as HTMLButtonElement;
    // setContent should trigger _onContentChanged → markDirty
    expect(saveBtn?.textContent).toBe('Save *');
  });

  // ── Save button elements ──────────────────────────────────────────────

  it('save button exists and is clickable', () => {
    const editor = createFixture();
    const saveBtn = editor.node.querySelector(
      '.jp-WikiEditor-saveBtn'
    ) as HTMLButtonElement;
    expect(saveBtn).not.toBeNull();
    expect(saveBtn?.textContent).toBe('Save');
  });

  it('save status element exists', () => {
    const editor = createFixture();
    const saveStatus = editor.node.querySelector(
      '.jp-WikiEditor-saveStatus'
    ) as HTMLDivElement;
    expect(saveStatus).not.toBeNull();
  });

  it('successful _handleSave clears dirty state', async () => {
    (savePage as jest.Mock).mockResolvedValueOnce({ message: 'saved' });
    const mockServerSettings: ServerConnection.ISettings =
      ServerConnection.makeSettings();
    const editor = createFixture();
    editor.serverSettings = mockServerSettings;
    editor.setPage('wiki-a', 'test-page', 'sha1');
    editor.setContent('new content', true);

    // Now dirty
    let saveBtn = editor.node.querySelector(
      '.jp-WikiEditor-saveBtn'
    ) as HTMLButtonElement;
    expect(saveBtn?.textContent).toBe('Save *');

    // Simulate save
    await (editor as any)._handleSave();

    expect(savePage).toHaveBeenCalledWith(
      'wiki-a',
      'test-page',
      { content: 'new content', head_sha: 'sha1' },
      mockServerSettings
    );

    // After save, button should be clean
    saveBtn = editor.node.querySelector(
      '.jp-WikiEditor-saveBtn'
    ) as HTMLButtonElement;
    expect(saveBtn?.textContent).toBe('Save');
  });
});
