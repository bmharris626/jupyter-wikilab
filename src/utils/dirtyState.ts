/**
 * Dirty-state utilities — beforeunload handling and page-switch warnings.
 *
 * Extracted from src/index.ts so the logic can be unit-tested without a
 * full JupyterLab app instance.
 */

// ── beforeunload management ──────────────────────────────────────────────────

/** Minimal editor interface required by the dirty-state utilities. */
export interface IDirtyEditor {
  readonly isDirty: boolean;
}

/**
 * Handle a dirty-state change: register or remove the `beforeunload`
 * browser listener so the user is warned when they try to close the tab
 * while the editor has unsaved content.
 *
 * @param editor — the editor whose dirty-state drives the listener.
 */
export function onDirtyChange(editor: IDirtyEditor): void {
  const storageKey = '__wikilabBeforeUnloadHandler';
  // Use `any` to bypass strict Window type for storage key access.
  const win = window as unknown as Record<string, unknown>;
  const existing = win[storageKey];
  if (existing && typeof existing === 'function') {
    window.removeEventListener('beforeunload', existing as EventListener);
  }

  if (editor.isDirty) {
    const handler = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      e.returnValue = ''; // Required by Chrome
    };
    window.addEventListener('beforeunload', handler as EventListener);
    win[storageKey] = handler;
  } else {
    win[storageKey] = undefined;
  }
}

// ── page-switch confirmation ────────────────────────────────────────────────

/** Arguments passed to a page-switch signal. */
export interface IPageSelectedArgs {
  slug: string;
  head_sha?: string;
}

/** Minimal page-entry metadata. */
export interface IPageEntry {
  slug: string;
  title: string;
  mtime: string;
}

/**
 * Attempt to switch pages, prompting the user to save if there are
 * unsaved changes.
 *
 * @param editor — the editor with dirty-state and save capability.
 * @param browserWikiId — the wiki ID of the target page (from browser).
 * @param args — the page-selected signal arguments.
 * @returns `true` if the switch was accepted, `false` otherwise.
 */
export async function handlePageSwitch(
  editor: IDirtyEditor & {
    page: IPageEntry | null;
    setPage(wikiId: string, slug: string, headSha?: string): void;
    setContent(content: string, addToHistory?: boolean): void;
    focus(): void;
    save(): Promise<boolean>;
  },
  browserWikiId: string,
  args: IPageSelectedArgs & { content?: string }
): Promise<boolean> {
  if (!editor.isDirty) {
    _applyPageSwitch(editor, browserWikiId, args);
    return true;
  }

  const answer = window.confirm(
    'You have unsaved changes. Do you want to save before switching pages?'
  );
  if (!answer) {
    return false; // user cancelled
  }

  const saved = await editor.save();
  if (saved) {
    _applyPageSwitch(editor, browserWikiId, args);
    return true;
  }
  return false; // save failed — do not switch
}

/**
 * Apply the page switch after save is confirmed or no dirty state.
 *
 * @internal
 */
function _applyPageSwitch(
  editor: IDirtyEditor & {
    page: IPageEntry | null;
    setPage(wikiId: string, slug: string, headSha?: string): void;
    setContent(content: string, addToHistory?: boolean): void;
    focus(): void;
  },
  browserWikiId: string,
  args: IPageSelectedArgs & { content?: string }
): void {
  editor.page = {
    slug: args.slug,
    title: '',
    mtime: new Date().toISOString()
  };
  editor.setPage(browserWikiId, args.slug, args.head_sha);
  editor.setContent(args.content ?? '', false);
  editor.focus();
}
