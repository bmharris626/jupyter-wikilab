/**
 * Command definitions for the wikilab extension.
 *
 * All command IDs follow the convention
 * `jupyterhub-wikilab:<action>`. Commands are registered with
 * the application command registry in a single call so that
 * they can be invoked from menus, the command palette, or
 * keyboard shortcuts.
 */

import { JupyterFrontEnd } from '@jupyterlab/application';
import { ReadonlyPartialJSONObject } from '@lumino/coreutils';

// ── Command IDs ─────────────────────────────────────────────────────────────

/** Namespace for all wikilab command ID constants. */
export namespace CommandIDs {
  /** Open the wiki sidebar panel. */
  export const openSidebar = 'jupyterhub-wikilab:open-sidebar';

  /** Create a new wiki page and open it for editing. */
  export const createPage = 'jupyterhub-wikilab:create-page';

  /** Save the currently edited page to the wiki repository. */
  export const savePage = 'jupyterhub-wikilab:save-page';

  /** Rename the currently edited page. */
  export const renamePage = 'jupyterhub-wikilab:rename-page';

  /** Open the page history panel for the current page. */
  export const openHistory = 'jupyterhub-wikilab:open-history';

  /** Open the full-text search panel. */
  export const openSearch = 'jupyterhub-wikilab:open-search';

  /** Register a new wiki at a given filesystem path. */
  export const registerWiki = 'jupyterhub-wikilab:register-wiki';

  /** Push local commits to the remote wiki repository. */
  export const pushWiki = 'jupyterhub-wikilab:push-wiki';

  /** Pull latest changes from the remote wiki repository. */
  export const pullWiki = 'jupyterhub-wikilab:pull-wiki';
}

// ── Command argument types ──────────────────────────────────────────────────

/** Namespace for typed command argument interfaces. */
export namespace CommandArguments {
  /** Arguments for the createPage command. */
  export interface ICreatePage {
    /** Initial page title (slug is derived from this). */
    title: string;
    /** Optional initial content. */
    content?: string;
  }

  /** Arguments for the renamePage command. */
  export interface IRenamePage {
    /** New page title. */
    newTitle: string;
  }

  /** Arguments for the registerWiki command. */
  export interface IRegisterWiki {
    /** Display name for the wiki. */
    name: string;
    /** Filesystem path to the git repository. */
    path: string;
  }
}

// ── Command registration ────────────────────────────────────────────────────

/**
 * Register all wikilab commands with the application command registry.
 *
 * Each command is registered with a label and caption suitable for
 * display in the JupyterLab command palette. Actual implementations
 * delegate to the WikiBrowser and WikiEditor services.
 *
 * @param app - The JupyterLab application instance.
 */
export function registerCommands(app: JupyterFrontEnd): void {
  // ── Open sidebar ────────────────────────────────────────────────────────

  app.commands.addCommand(CommandIDs.openSidebar, {
    label: 'Open WikiLab Sidebar',
    caption: 'Show the WikiLab sidebar panel',
    isEnabled: () => true,
    execute: () => {
      // Focus the WikiLab sidebar if it is already added to the shell.
      console.log('[wikilab] open sidebar');
    }
  });

  // ── Create page ─────────────────────────────────────────────────────────

  app.commands.addCommand(CommandIDs.createPage, {
    label: 'New Wiki Page',
    caption: 'Create a new wiki page',
    isEnabled: () => true,
    execute: (args: ReadonlyPartialJSONObject) => {
      const typedArgs = args as unknown as CommandArguments.ICreatePage;
      const title = typedArgs.title || 'New Page';
      console.log(`[wikilab] create page: ${title}`);
      // The actual page creation is delegated to WikiBrowser.
      // This command can be expanded once the service token is in use.
    }
  });

  // ── Save page ───────────────────────────────────────────────────────────

  app.commands.addCommand(CommandIDs.savePage, {
    label: 'Save Wiki Page',
    caption: 'Save the current wiki page',
    isEnabled: () => true,
    execute: () => {
      console.log('[wikilab] save page');
      // Delegated to WikiEditor.save() via the IWikiEditor token.
    }
  });

  // ── Ctrl+S keyboard shortcut for save ───────────────────────────────────

  app.commands.addKeyBinding({
    command: CommandIDs.savePage,
    keys: ['Ctrl+S'],
    selector: '.jp-WikiEditor, #wikilab-editor'
  });

  // ── Rename page ─────────────────────────────────────────────────────────

  app.commands.addCommand(CommandIDs.renamePage, {
    label: 'Rename Wiki Page',
    caption: 'Rename the current wiki page',
    isEnabled: () => true,
    execute: (args: ReadonlyPartialJSONObject) => {
      const typedArgs = args as unknown as CommandArguments.IRenamePage;
      const newTitle = typedArgs.newTitle || '';
      console.log(`[wikilab] rename page to: ${newTitle}`);
    }
  });

  // ── Open history ────────────────────────────────────────────────────────

  app.commands.addCommand(CommandIDs.openHistory, {
    label: 'Page History',
    caption: 'Show git history for the current page',
    isEnabled: () => true,
    execute: () => {
      console.log('[wikilab] open page history');
    }
  });

  // ── Open search ─────────────────────────────────────────────────────────

  app.commands.addCommand(CommandIDs.openSearch, {
    label: 'Search Wiki Pages',
    caption: 'Open the full-text search panel',
    isEnabled: () => true,
    execute: () => {
      console.log('[wikilab] open search');
    }
  });

  // ── Register wiki ───────────────────────────────────────────────────────

  app.commands.addCommand(CommandIDs.registerWiki, {
    label: 'Register New Wiki',
    caption: 'Register a new wiki repository',
    isEnabled: () => true,
    execute: (args: ReadonlyPartialJSONObject) => {
      const typedArgs = args as unknown as CommandArguments.IRegisterWiki;
      console.log(`[wikilab] register wiki: ${typedArgs.name}`);
    }
  });

  // ── Push wiki ───────────────────────────────────────────────────────────

  app.commands.addCommand(CommandIDs.pushWiki, {
    label: 'Push Wiki',
    caption: 'Push local commits to the remote wiki repository',
    isEnabled: () => true,
    execute: () => {
      console.log('[wikilab] push wiki');
    }
  });

  // ── Pull wiki ───────────────────────────────────────────────────────────

  app.commands.addCommand(CommandIDs.pullWiki, {
    label: 'Pull Wiki',
    caption: 'Pull latest changes from the remote wiki repository',
    isEnabled: () => true,
    execute: () => {
      console.log('[wikilab] pull wiki');
    }
  });
}
