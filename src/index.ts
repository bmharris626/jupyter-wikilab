import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { Panel, PanelLayout } from '@lumino/widgets';

import { MainAreaWidget } from '@jupyterlab/apputils';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { listWikis } from './wikiApi';

import { WikiBrowser } from './components/WikiBrowser';
import { WikiEditor } from './components/WikiEditor';
import { ConflictView } from './components/ConflictView';
import { onDirtyChange } from './utils/dirtyState';

import { IWikiBrowser, IWikiEditor } from './tokens';

import { registerCommands, setReloadWikis } from './commands';

// Module-level reference so editorPlugin can access the most recently
// opened editor (both plugins share this module scope).
let _editorInstance: WikiEditor | null = null;

// ── Settings cache ──────────────────────────────────────────────────────────

/** Cached wikilab settings, populated on startup. */
let _settings: ISettingRegistry.ISettings | null = null;

/**
 * Returns the cached settings object.
 * Only available after the settings plugin has activated.
 */
export function getSettings(): ISettingRegistry.ISettings | null {
  return _settings;
}

// ── Plugin 1: Core activation + IWikiBrowser token ──────────────────────────

/**
 * Initialization data for the jupyterhub-wikilab extension.
 *
 * Instantiates the sidebar and editor, registers the sidebar
 * in JupyterLab's left area, and opens a new editor tab in the
 * main area for each page selected. Provides the WikiBrowser token
 * for dependency injection.
 */
const plugin: JupyterFrontEndPlugin<IWikiBrowser> = {
  id: 'jupyterhub-wikilab:plugin',
  description:
    'An extension for displaying and editing wikis within JupyterLab.',
  autoStart: true,
  provides: IWikiBrowser,
  activate: async (app: JupyterFrontEnd): Promise<IWikiBrowser> => {
    const serverSettings = app.serviceManager.serverSettings;

    // ── Register all commands ──────────────────────────────────────────────

    registerCommands(app);

    // ── Register wiki-reload callback ──────────────────────────────────────

    setReloadWikis(() => {
      void listWikis(serverSettings)
        .then(response => {
          browser.populateWikis(response.wikis);
        })
        .catch(() => {
          // Reload failed — keep current list
        });
    });

    // ── Sidebar container (left area) ──────────────────────────────────────

    const sidebar = new Panel();
    sidebar.id = 'wikilab-sidebar';
    sidebar.title.caption = 'WikiLab';
    sidebar.title.iconClass = 'lm-CommandPalette-icon';

    const sidebarLayout = sidebar.layout as PanelLayout;

    // ── WikiBrowser (left sidebar) ─────────────────────────────────────────

    const browser = new WikiBrowser();
    browser.serverSettings = serverSettings;

    // ── Reload wikis after registration ───────────────────────────────────

    browser.onWikiRegistered = () => {
      void listWikis(serverSettings)
        .then(response => {
          browser.populateWikis(response.wikis);
        })
        .catch(() => {/* keep current list */});
    };

    // ── Open editor tabs: "${wikiId}:${slug}" → { widget, editor } ────────

    const editorTabs = new Map<
      string,
      { widget: MainAreaWidget; editor: WikiEditor }
    >();

    // ── Keep all open editors in sync with the page list ──────────────────

    browser.pagesLoaded.connect((_, pages) => {
      for (const { editor } of editorTabs.values()) {
        editor.setPages(pages);
      }
    });

    // ── Update tab label + re-key map when a page is renamed ──────────────

    browser.pageRenamed.connect((_, args) => {
      const oldKey = `${browser.activeWikiId}:${args.oldSlug}`;
      const tab = editorTabs.get(oldKey);
      if (!tab) {
        return;
      }
      tab.widget.title.label = args.newTitle || args.newSlug;
      tab.editor.page = {
        slug: args.newSlug,
        title: args.newTitle,
        mtime: new Date().toISOString()
      };
      // Clear the saved SHA so the next save doesn't hit a stale-write error
      tab.editor.setPage(browser.activeWikiId, args.newSlug, undefined);
      editorTabs.delete(oldKey);
      editorTabs.set(`${browser.activeWikiId}:${args.newSlug}`, tab);
    });

    // ── Wire page click → open (or activate) a tab per page ───────────────

    browser.pageSelected.connect(async (_, args) => {
      const wikiId = browser.activeWikiId;
      const tabKey = `${wikiId}:${args.slug}`;
      const existing = editorTabs.get(tabKey);

      if (existing) {
        app.shell.activateById(existing.widget.id);
        return;
      }

      // ── Create a new editor instance for this page ─────────────────────

      const editor = new WikiEditor();
      editor.serverSettings = serverSettings;
      editor.setPages(browser.pages);
      editor.page = {
        slug: args.slug,
        title: args.title || args.slug,
        mtime: new Date().toISOString()
      };
      editor.setContent(browser._lastLoadedContent ?? '', false);
      editor.setPage(wikiId, args.slug, args.head_sha);

      const safeKey = tabKey.replace(/[^a-z0-9]/gi, '-');
      const widgetId = `wikilab-editor-${safeKey}`;

      const widget = new MainAreaWidget({ content: editor });
      widget.id = widgetId;
      widget.title.label = args.title || args.slug;
      widget.title.caption = 'WikiLab Editor';
      widget.title.iconClass = 'lm-FileIcon';
      widget.title.closable = true;

      // ── Unsaved-changes guard ──────────────────────────────────────────

      editor.contentChanged.connect(() => onDirtyChange(editor));

      // ── Conflict resolution flow ───────────────────────────────────────

      const editorSlug = args.slug;
      editor.conflictDetected.connect(async (_, conflictArgs) => {
        let conflictView: ConflictView | null = null;
        const cvId = `wikilab-conflict-${Date.now()}`;
        conflictView = new ConflictView({
          response: {
            error: 'Stale write detected, page was modified',
            base_content: conflictArgs.baseContent,
            their_content: conflictArgs.theirContent
          },
          editorContent: conflictArgs.editorContent,
          onResolve: (resolvedContent: string) => {
            editor.setContent(resolvedContent);
            void editor.save();
            conflictView?.dispose();
            conflictView = null;
          },
          onDiscard: () => {
            void browser
              .loadPage(editorSlug)
              .then(content => {
                editor.setContent(content);
              })
              .catch(() => {
                // Reload failed — keep editor as-is
              });
            conflictView?.dispose();
            conflictView = null;
          }
        });
        conflictView.id = cvId;
        conflictView.title.label = 'Resolve Conflict';
        app.shell.add(conflictView, 'main', { rank: 99 });
      });

      // ── Remove from map when tab is closed ────────────────────────────

      widget.disposed.connect(() => {
        editorTabs.delete(tabKey);
      });

      editorTabs.set(tabKey, { widget, editor });
      _editorInstance = editor;

      app.shell.add(widget, 'main', { rank: 100 });
      app.shell.activateById(widgetId);
    });

    sidebarLayout.addWidget(browser);

    // ── Populate wikis ─────────────────────────────────────────────────────

    try {
      const response = await listWikis(serverSettings);
      browser.populateWikis(response.wikis);
    } catch {
      browser.populateWikis({});
    }

    // ── Register sidebar in left area ──────────────────────────────────────

    app.shell.add(sidebar, 'left', { rank: 100 });

    console.log('JupyterLab extension jupyterhub-wikilab is activated!');

    return browser as IWikiBrowser;
  }
};

// ── Plugin 2: IWikiEditor token (requires main plugin) ─────────────────────

/**
 * Second plugin that provides the IWikiEditor token.
 * Requires the main plugin so the editor instance is already
 * available in the same activation scope.
 */
const editorPlugin: JupyterFrontEndPlugin<IWikiEditor> = {
  id: 'jupyterhub-wikilab:editor-plugin',
  description: 'Provides the WikiEditor service token.',
  autoStart: true,
  requires: [IWikiBrowser],
  provides: IWikiEditor,
  activate: async (
    _app: JupyterFrontEnd,
    _browser: IWikiBrowser
  ): Promise<IWikiEditor> => {
    // The editor was instantiated by the main plugin.
    // Both plugins share this module scope so the reference is available.
    if (!_editorInstance) {
      throw new Error('WikiEditor instance not yet initialized');
    }
    return _editorInstance as IWikiEditor;
  }
};

// ── Plugin 3: Settings integration ──────────────────────────────────────────

/**
 * Third plugin that loads wikilab settings from the schema
 * and caches them for consumption by other components.
 */
const settingsPlugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterhub-wikilab:settings-plugin',
  description: 'Loads and caches wikilab extension settings.',
  autoStart: true,
  requires: [ISettingRegistry],
  activate: (app: JupyterFrontEnd, registry: ISettingRegistry) => {
    registry
      .load('jupyterhub-wikilab:plugin')
      .then(settings => {
        _settings = settings;
        console.log('[wikilab] settings loaded:', settings.composite);
      })
      .catch(err => {
        console.error('[wikilab] failed to load settings:', err);
      });

    // Re-load whenever any plugin's settings change
    registry.pluginChanged.connect((_, pluginId) => {
      if (pluginId === 'jupyterhub-wikilab:plugin') {
        registry
          .reload('jupyterhub-wikilab:plugin')
          .then(s => {
            _settings = s;
            console.log('[wikilab] settings reloaded:', s.composite);
          })
          .catch(err => {
            console.error('[wikilab] failed to reload settings:', err);
          });
      }
    });
  }
};

export { plugin, editorPlugin, settingsPlugin };

// JupyterLab expects the frontend entrypoint to default-export either
// a single plugin object or an array of plugin objects.
// Export all three plugins as the default extension bundle.
export default [plugin, editorPlugin, settingsPlugin];
