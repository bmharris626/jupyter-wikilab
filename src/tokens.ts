/**
 * Service tokens for the wikilab extension.
 *
 * Defines the plugin tokens used for dependency injection across
 * extension components. Each token provides a stable contract so
 * that components can be swapped without altering the activation
 * wiring in `index.ts`.
 */

import { Token } from '@lumino/coreutils';

// ── CSS class namespace ─────────────────────────────────────────────────────

const PLUGIN_ID = 'jupyterhub-wikilab:plugin';

// ── WikiBrowser service token ───────────────────────────────────────────────

/**
 * Interface for the WikiBrowser sidebar service.
 *
 * Implementations must expose the currently active wiki ID and
 * provide a method to programmatically select pages.
 */
export interface IWikiBrowser {
  /** Currently selected wiki ID (empty string when none selected). */
  readonly activeWikiId: string;

  /**
   * Load a page by its slug into the editor.
   * @param slug - The page slug to load.
   * @returns A promise that resolves with the page content.
   */
  loadPage: (slug: string) => Promise<string>;

  /**
   * Get the list of page entries for the currently active wiki.
   */
  getPages: () => readonly import('./types').PageEntry[];
}

/** Plugin token for the WikiBrowser sidebar service. */
export const IWikiBrowser = new Token<IWikiBrowser>(
  `${PLUGIN_ID}:IWikiBrowser`
);

// ── WikiEditor service token ────────────────────────────────────────────────

/**
 * Interface for the WikiEditor main-area service.
 *
 * Implementations must provide methods to get/set editor content,
 * trigger saves, and report dirty-state changes.
 */
export interface IWikiEditor {
  /** Whether the editor has unsaved changes. */
  readonly isDirty: boolean;

  /**
   * Set the editor content to the supplied string.
   * @param content - The markdown content to display.
   */
  setContent: (content: string) => void;

  /**
   * Persist the current editor content to the wiki repository.
   * Returns the new HEAD SHA on success.
   */
  save: () => Promise<string>;
}

/** Plugin token for the WikiEditor main-area service. */
export const IWikiEditor = new Token<IWikiEditor>(`${PLUGIN_ID}:IWikiEditor`);
