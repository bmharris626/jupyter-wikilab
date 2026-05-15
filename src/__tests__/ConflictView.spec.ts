/**
 * Unit tests for the ConflictView conflict resolution panel.
 *
 * Tests cover construction, pane rendering, and resolution callbacks
 * using a headless JSDOM environment.
 */

import { ConflictView } from '../components/ConflictView';
import type { ConflictResponse } from '../types';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Create a minimal conflict response fixture. */
function createConflictResponse(
  overrides: Partial<ConflictResponse> = {}
): ConflictResponse {
  return {
    error: 'Stale write detected, page was modified',
    base_content: 'Base content here\nLine two of base.',
    their_content: 'Their content here\nLine two of theirs.',
    ...overrides
  };
}

/** Create a minimal editor content fixture. */
const MOCK_EDITOR_CONTENT = 'User editor content\nWith multiple lines.';

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ConflictView', () => {
  let conflictView: ConflictView;
  let onResolveMock: jest.Mock;

  beforeEach(() => {
    document.body.innerHTML = '';
    onResolveMock = jest.fn();
    const response = createConflictResponse();
    conflictView = new ConflictView({
      response,
      editorContent: MOCK_EDITOR_CONTENT,
      onResolve: onResolveMock
    });
  });

  afterEach(() => {
    conflictView.dispose();
  });

  // ── Construction ───────────────────────────────────────────────────────

  it('should be a Panel widget with the correct CSS class', () => {
    expect(conflictView.hasClass('jp-ConflictView')).toBe(true);
  });

  it('should have header, splitter, and actions as children', () => {
    expect(conflictView.widgets.length).toBe(3);
  });

  it('should show the conflict error in the header', () => {
    const headerText = conflictView.node.querySelector(
      '.jp-ConflictView-headerText'
    );
    expect(headerText?.textContent).toContain('Stale write detected');
  });

  // ── ConflictView-layout: Render base/yours/theirs panes ────────────────

  it('should render three content panes in the splitter', () => {
    const preElements = conflictView.node.querySelectorAll(
      '.jp-ConflictView-content'
    );
    expect(preElements.length).toBe(3);
  });

  it('should display base content in the first pane', () => {
    const pres = conflictView.node.querySelectorAll('.jp-ConflictView-content');
    expect(pres[0]?.textContent).toBe('Base content here\nLine two of base.');
  });

  it('should display your edits in the second pane', () => {
    const pres = conflictView.node.querySelectorAll('.jp-ConflictView-content');
    expect(pres[1]?.textContent).toBe(MOCK_EDITOR_CONTENT);
  });

  it('should display their content in the third pane', () => {
    const pres = conflictView.node.querySelectorAll('.jp-ConflictView-content');
    expect(pres[2]?.textContent).toBe(
      'Their content here\nLine two of theirs.'
    );
  });

  it('should mark your edits pane with the "yours" CSS class', () => {
    const pres = conflictView.node.querySelectorAll('.jp-ConflictView-content');
    expect(pres[1]?.classList.contains('jp-ConflictView-yours')).toBe(true);
  });

  it('should mark their content pane with the "theirs" CSS class', () => {
    const pres = conflictView.node.querySelectorAll('.jp-ConflictView-content');
    expect(pres[2]?.classList.contains('jp-ConflictView-theirs')).toBe(true);
  });

  it('should have three action buttons', () => {
    const buttons = conflictView.node.querySelectorAll('.jp-ConflictView-btn');
    expect(buttons.length).toBe(3);
  });

  it('should label buttons correctly', () => {
    const buttons = conflictView.node.querySelectorAll('.jp-ConflictView-btn');
    expect(buttons[0]?.textContent).toBe('Accept Your Edits');
    expect(buttons[1]?.textContent).toBe('Accept HEAD');
    expect(buttons[2]?.textContent).toBe('Discard Changes');
  });

  // ── ConflictView-actions: Accept your edits ────────────────────────────

  it('accept your edits button should emit editor content', () => {
    const buttons = conflictView.node.querySelectorAll('.jp-ConflictView-btn');
    (buttons[0] as HTMLButtonElement).click();
    expect(onResolveMock).toHaveBeenCalledWith(MOCK_EDITOR_CONTENT);
  });

  // ── ConflictView-actions: Accept HEAD (theirs) ─────────────────────────

  it('accept HEAD button should emit their content', () => {
    const buttons = conflictView.node.querySelectorAll('.jp-ConflictView-btn');
    (buttons[1] as HTMLButtonElement).click();
    expect(onResolveMock).toHaveBeenCalledWith(
      'Their content here\nLine two of theirs.'
    );
  });

  // ── ConflictView-actions: Discard ──────────────────────────────────────

  it('discard button should emit editor content (preserves undo capability)', () => {
    const buttons = conflictView.node.querySelectorAll('.jp-ConflictView-btn');
    (buttons[2] as HTMLButtonElement).click();
    expect(onResolveMock).toHaveBeenCalledWith(MOCK_EDITOR_CONTENT);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  it('should show placeholder when base_content is missing', () => {
    const response = createConflictResponse({ base_content: undefined });
    conflictView.dispose();
    document.body.innerHTML = '';

    const view = new ConflictView({
      response,
      editorContent: MOCK_EDITOR_CONTENT,
      onResolve: onResolveMock
    });

    const pres = view.node.querySelectorAll('.jp-ConflictView-content');
    expect(pres[0]?.textContent).toBe('(no base content available)');
    view.dispose();
  });

  it('should show placeholder when their_content is missing', () => {
    const response = createConflictResponse({ their_content: undefined });
    conflictView.dispose();
    document.body.innerHTML = '';

    const view = new ConflictView({
      response,
      editorContent: MOCK_EDITOR_CONTENT,
      onResolve: onResolveMock
    });

    const pres = view.node.querySelectorAll('.jp-ConflictView-content');
    expect(pres[2]?.textContent).toBe('(no HEAD content available)');
    view.dispose();
  });
});
