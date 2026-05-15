/**
 * Unit tests for src/utils/dirtyState.ts
 *
 * Tests the extracted beforeunload management and page-switch confirmation
 * logic without needing a full JupyterLab app instance.
 */

import { onDirtyChange, handlePageSwitch } from '../utils/dirtyState';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal dirty-editor fixture.
 *
 * @param isDirty — initial dirty state.
 * @param saveResult — what `save()` should resolve to (when dirty).
 */
function createEditor({
  isDirty = false,
  saveResult = true
}: {
  isDirty?: boolean;
  saveResult?: boolean;
} = {}) {
  return {
    isDirty,
    page: null,
    setPage: jest.fn(),
    setContent: jest.fn(),
    focus: jest.fn(),
    save: jest.fn(() => Promise.resolve(saveResult))
  };
}

// ── onDirtyChange tests ─────────────────────────────────────────────────────

describe('onDirtyChange', () => {
  afterEach(() => {
    // Clean up any handlers and storage left by previous tests.
    const storageKey = '__wikilabBeforeUnloadHandler';
    const win = window as unknown as Record<string, unknown>;
    const handler = win[storageKey];
    if (handler) {
      window.removeEventListener('beforeunload', handler as EventListener);
    }
    win[storageKey] = undefined;
    jest.restoreAllMocks();
  });

  it('registers beforeunload when dirty', () => {
    const editor = createEditor({ isDirty: true });
    const addSpy = jest.spyOn(window, 'addEventListener');
    onDirtyChange(editor);
    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  it('removes previous handler and does not add a new one when not dirty', () => {
    // First call: set dirty
    const dirtyEditor = createEditor({ isDirty: true });
    onDirtyChange(dirtyEditor);

    // Simulate a second call with a different (not dirty) editor
    const cleanEditor = createEditor({ isDirty: false });
    const removeSpy = jest.spyOn(window, 'removeEventListener');
    onDirtyChange(cleanEditor);

    expect(removeSpy).toHaveBeenCalledWith(
      'beforeunload',
      expect.any(Function)
    );

    // A subsequent re-dirty should not accumulate multiple listeners.
    const dirtyEditor2 = createEditor({ isDirty: true });
    const addSpy = jest.spyOn(window, 'addEventListener');
    onDirtyChange(dirtyEditor2);
    expect(addSpy).toHaveBeenCalledTimes(1);
  });

  it('toggles listener when dirty state changes', () => {
    const editor = createEditor({ isDirty: false });
    const addSpy = jest.spyOn(window, 'addEventListener');
    const removeSpy = jest.spyOn(window, 'removeEventListener');

    // Initially clean — no listener added.
    onDirtyChange(editor);
    expect(addSpy).not.toHaveBeenCalled();

    // Mark dirty via mutation.
    editor.isDirty = true;
    onDirtyChange(editor);
    expect(addSpy).toHaveBeenCalledTimes(1);

    // Mark clean again — listener removed.
    editor.isDirty = false;
    onDirtyChange(editor);
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  it('stores handler reference on window for later removal', () => {
    const storageKey = '__wikilabBeforeUnloadHandler';
    const win = window as unknown as Record<string, unknown>;
    const editor = createEditor({ isDirty: true });
    onDirtyChange(editor);
    expect(win[storageKey]).toBeDefined();
    expect(typeof win[storageKey]).toBe('function');
  });

  it('clears handler reference when editor becomes clean', () => {
    const storageKey = '__wikilabBeforeUnloadHandler';
    const win = window as unknown as Record<string, unknown>;
    const editor = createEditor({ isDirty: true });
    onDirtyChange(editor);
    expect(win[storageKey]).toBeDefined();

    editor.isDirty = false;
    onDirtyChange(editor);
    expect(win[storageKey]).toBeUndefined();
  });
});

// ── handlePageSwitch tests ──────────────────────────────────────────────────

describe('handlePageSwitch', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('switches pages immediately when not dirty', async () => {
    const editor = createEditor({ isDirty: false });
    const result = await handlePageSwitch(editor, 'wiki-a', {
      slug: 'target-page',
      head_sha: 'sha123'
    });

    expect(result).toBe(true);
    expect(editor.setPage).toHaveBeenCalledWith(
      'wiki-a',
      'target-page',
      'sha123'
    );
    expect(editor.setContent).toHaveBeenCalledWith('', false);
    expect(editor.focus).toHaveBeenCalled();
    expect(editor.save).not.toHaveBeenCalled();
  });

  it('prompts user and switches when user confirms save', async () => {
    const editor = createEditor({ isDirty: true, saveResult: true });
    jest.spyOn(window, 'confirm').mockReturnValueOnce(true);

    const result = await handlePageSwitch(editor, 'wiki-b', {
      slug: 'another-page',
      head_sha: 'sha456',
      content: 'new content'
    });

    expect(result).toBe(true);
    expect(editor.save).toHaveBeenCalled();
    expect(editor.setPage).toHaveBeenCalledWith(
      'wiki-b',
      'another-page',
      'sha456'
    );
  });

  it('does not switch when user cancels the prompt', async () => {
    const editor = createEditor({ isDirty: true });
    jest.spyOn(window, 'confirm').mockReturnValueOnce(false);

    const result = await handlePageSwitch(editor, 'wiki-c', {
      slug: 'some-page',
      head_sha: 'sha789'
    });

    expect(result).toBe(false);
    expect(editor.save).not.toHaveBeenCalled();
    expect(editor.setPage).not.toHaveBeenCalled();
    expect(editor.setContent).not.toHaveBeenCalled();
  });

  it('does not switch when save fails', async () => {
    const editor = createEditor({ isDirty: true, saveResult: false });
    jest.spyOn(window, 'confirm').mockReturnValueOnce(true);

    const result = await handlePageSwitch(editor, 'wiki-d', {
      slug: 'fail-page',
      head_sha: 'sha000'
    });

    expect(result).toBe(false);
    expect(editor.setPage).not.toHaveBeenCalled();
    expect(editor.setContent).not.toHaveBeenCalled();
  });

  it('passes content to setContent on page switch', async () => {
    const editor = createEditor({ isDirty: false });
    await handlePageSwitch(editor, 'wiki-e', {
      slug: 'content-page',
      head_sha: 'sha1',
      content: 'Hello world'
    });

    expect(editor.setContent).toHaveBeenCalledWith('Hello world', false);
  });

  it('uses empty string for content when not provided', async () => {
    const editor = createEditor({ isDirty: false });
    await handlePageSwitch(editor, 'wiki-f', {
      slug: 'empty-content-page'
    });

    expect(editor.setContent).toHaveBeenCalledWith('', false);
  });
});
