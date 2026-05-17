/**
 * Command definitions for the wikilab extension.
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
    title: string;
    content?: string;
    committer_email?: string;
  }

  /** Arguments for the renamePage command. */
  export interface IRenamePage {
    newTitle: string;
    committer_email?: string;
  }
}

// ── Command registration ────────────────────────────────────────────────────

export function registerCommands(app: JupyterFrontEnd): void {
  app.commands.addCommand(CommandIDs.openSidebar, {
    label: 'Open WikiLab Sidebar',
    caption: 'Show the WikiLab sidebar panel',
    isEnabled: () => true,
    execute: () => {
      console.log('[wikilab] open sidebar');
    }
  });

  app.commands.addCommand(CommandIDs.createPage, {
    label: 'New Wiki Page',
    caption: 'Create a new wiki page',
    isEnabled: () => true,
    execute: (args: ReadonlyPartialJSONObject) => {
      const typedArgs = args as unknown as CommandArguments.ICreatePage;
      const title = typedArgs.title || 'New Page';
      console.log(`[wikilab] create page: ${title}`);
    }
  });

  app.commands.addCommand(CommandIDs.savePage, {
    label: 'Save Wiki Page',
    caption: 'Save the current wiki page',
    isEnabled: () => true,
    execute: () => {
      console.log('[wikilab] save page');
    }
  });

  app.commands.addKeyBinding({
    command: CommandIDs.savePage,
    keys: ['Ctrl+S'],
    selector: '.jp-WikiEditor'
  });

  app.commands.addKeyBinding({
    command: CommandIDs.savePage,
    keys: ['Ctrl+S'],
    selector: '#wikilab-editor'
  });

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

  app.commands.addCommand(CommandIDs.openHistory, {
    label: 'Page History',
    caption: 'Show git history for the current page',
    isEnabled: () => true,
    execute: () => {
      console.log('[wikilab] open page history');
    }
  });

  app.commands.addCommand(CommandIDs.openSearch, {
    label: 'Search Wiki Pages',
    caption: 'Open the full-text search panel',
    isEnabled: () => true,
    execute: () => {
      console.log('[wikilab] open search');
    }
  });

  app.commands.addCommand(CommandIDs.pushWiki, {
    label: 'Push Wiki',
    caption: 'Push local commits to the remote wiki repository',
    isEnabled: () => true,
    execute: () => {
      console.log('[wikilab] push wiki');
    }
  });

  app.commands.addCommand(CommandIDs.pullWiki, {
    label: 'Pull Wiki',
    caption: 'Pull latest changes from the remote wiki repository',
    isEnabled: () => true,
    execute: () => {
      console.log('[wikilab] pull wiki');
    }
  });
}
