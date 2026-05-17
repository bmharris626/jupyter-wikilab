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
import { showDialog, Dialog, Notification } from '@jupyterlab/apputils';
import { PageConfig } from '@jupyterlab/coreutils';
import { ReadonlyPartialJSONObject } from '@lumino/coreutils';
import { ServerConnection } from '@jupyterlab/services';
import { Widget } from '@lumino/widgets';

import { createWiki } from './wikiApi';

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

/** Callback registered by the main plugin to reload the wiki list. */
let _reloadWikis: (() => void) | null = null;

/**
 * Register the wiki-reload callback from the main plugin.
 * Called once during plugin activation so the dialog can refresh
 * the browser after a successful registration.
 * @internal
 */
export function setReloadWikis(callback: (() => void) | null): void {
  _reloadWikis = callback;
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
    /** Optional explicit committer email for the git commit. */
    committer_email?: string;
  }

  /** Arguments for the renamePage command. */
  export interface IRenamePage {
    /** New page title. */
    newTitle: string;
    /** Optional explicit committer email for the git commit. */
    committer_email?: string;
  }

  /** Arguments for the registerWiki command. */
  export interface IRegisterWiki {
    /** Display name for the wiki. */
    name: string;
    /** Filesystem path to the git repository. */
    path: string;
  }
}

// ── Exported dialog function ────────────────────────────────────────────────

/**
 * Open the "Register New Wiki" modal directly, without going through the
 * command registry. Call this from the sidebar + button so the dialog works
 * regardless of whether the plugin's activate() has finished wiring commands.
 */
export async function openRegisterWikiDialog(
  serverSettings: ServerConnection.ISettings,
  onRegistered: () => void,
  defaultPath?: string
): Promise<void> {
  console.log('[wikilab] openRegisterWikiDialog called');
  try {
    const body = new RegisterWikiBody(defaultPath);
    const result = await showDialog({
      title: 'Register New Wiki',
      body,
      focusNodeSelector: 'input',
      buttons: [
        Dialog.cancelButton(),
        Dialog.okButton({ label: 'Register Wiki' })
      ]
    });

    if (!result.button.accept) {
      return;
    }

    const { id, name, path } = body.getValue();

    if (!name || !path) {
      void Notification.error('Name and path are required.', {
        autoClose: 4000
      });
      return;
    }

    await createWiki(id, { id, name, path }, serverSettings);
    void Notification.info(`Wiki "${name}" registered.`, { autoClose: 3000 });
    onRegistered();
  } catch (err) {
    console.error('[wikilab] openRegisterWikiDialog error:', err);
    const message = err instanceof Error ? err.message : String(err);
    void Notification.error(`WikiLab: ${message}`, { autoClose: 8000 });
  }
}

// ── Register-wiki form body ─────────────────────────────────────────────────

/** Convert a display name to a URL-safe wiki ID slug. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Inline form body used with JupyterLab's showDialog modal.
 * Collects a display name and filesystem path; the wiki ID is derived
 * automatically from the name.
 */
class RegisterWikiBody extends Widget {
  private _nameInput: HTMLInputElement;
  private _pathInput: HTMLInputElement;
  private _slugHint: HTMLSpanElement;

  constructor(defaultPath?: string) {
    super();
    this.addClass('jp-RegisterWikiBody');

    const resolvedDefaultPath =
      defaultPath ||
      PageConfig.getOption('serverRoot') ||
      PageConfig.getOption('rootDir') ||
      '';

    const makeRow = (
      labelText: string,
      placeholder: string
    ): { row: HTMLDivElement; input: HTMLInputElement } => {
      const row = document.createElement('div');
      row.className = 'jp-RegisterWikiBody-row';

      const label = document.createElement('label');
      label.className = 'jp-RegisterWikiBody-label';
      label.textContent = labelText;

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'jp-mod-styled jp-RegisterWikiBody-input';
      input.placeholder = placeholder;

      row.appendChild(label);
      row.appendChild(input);
      return { row, input };
    };

    const nameRow = makeRow('Name', 'My Wiki');
    const pathRow = makeRow('Path', '/home/user/wiki');

    this._nameInput = nameRow.input;
    this._pathInput = pathRow.input;
    this._pathInput.value = resolvedDefaultPath;

    // Slug hint shown below the name field
    this._slugHint = document.createElement('span');
    this._slugHint.className = 'jp-RegisterWikiBody-slugHint';
    this._slugHint.textContent = 'ID: —';
    nameRow.row.appendChild(this._slugHint);

    this._nameInput.addEventListener('input', () => {
      const slug = slugify(this._nameInput.value);
      this._slugHint.textContent = slug ? `ID: ${slug}` : 'ID: —';
    });

    this.node.appendChild(nameRow.row);
    this.node.appendChild(pathRow.row);
  }

  getValue(): { id: string; name: string; path: string } {
    const name = this._nameInput.value.trim();
    return {
      id: slugify(name),
      name,
      path: this._pathInput.value.trim()
    };
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
    selector: '.jp-WikiEditor'
  });

  app.commands.addKeyBinding({
    command: CommandIDs.savePage,
    keys: ['Ctrl+S'],
    selector: '#wikilab-editor'
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
    execute: async () => {
      console.log('[wikilab] register-wiki execute called');
      try {
        const body = new RegisterWikiBody();
        const result = await showDialog({
          title: 'Register New Wiki',
          body,
          focusNodeSelector: 'input',
          buttons: [
            Dialog.cancelButton(),
            Dialog.okButton({ label: 'Register Wiki' })
          ]
        });

        if (!result.button.accept) {
          return;
        }

        const { id, name, path } = body.getValue();

        if (!name || !path) {
          void Notification.error('Name and path are required.', {
            autoClose: 4000
          });
          return;
        }

        const serverSettings =
          app.serviceManager.serverSettings as ServerConnection.ISettings;

        await createWiki(id, { id, name, path }, serverSettings);
        void Notification.info(`Wiki "${name}" registered.`, {
          autoClose: 3000
        });
        if (_reloadWikis) {
          _reloadWikis();
        }
      } catch (err) {
        console.error('[wikilab] register-wiki error:', err);
        const message = err instanceof Error ? err.message : String(err);
        void Notification.error(`WikiLab: ${message}`, { autoClose: 8000 });
      }
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
