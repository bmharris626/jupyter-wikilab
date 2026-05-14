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

// ── Real imports ────────────────────────────────────────────────────────────

import { WikiEditor } from '../components/WikiEditor';
import type { PageEntry } from '../types';

import { render } from '../markdownRenderer';

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
});
