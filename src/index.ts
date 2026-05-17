import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { Panel, PanelLayout } from '@lumino/widgets';

import { MainAreaWidget } from '@jupyterlab/apputils';

import { PageConfig } from '@jupyterlab/coreutils';

import { IFileBrowserFactory } from '@jupyterlab/filebrowser';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { probeWiki } from './wikiApi';

import { WikiBrowser } from './components/WikiBrowser';
import { WikiEditor } from './components/WikiEditor';
import { ConflictView } from './components/ConflictView';
import { onDirtyChange } from './utils/dirtyState';

import { IWikiBrowser, IWikiEditor } from './tokens';

import { registerCommands } from './commands';

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

const plugin: JupyterFrontEndPlugin<IWikiBrowser> = {
  id: 'jupyterhub-wikilab:plugin',
  description:
    'An extension for displaying and editing wikis within JupyterLab.',
  autoStart: true,
  provides: IWikiBrowser,
  requires: [IFileBrowserFactory],
  activate: async (
    app: JupyterFrontEnd,
    fileBrowserFactory: IFileBrowserFactory
  ): Promise<IWikiBrowser> => {
    const serverSettings = app.serviceManager.serverSettings;

    const serverRoot =
      PageConfig.getOption('serverRoot') ||
      PageConfig.getOption('rootDir') ||
      '';

    // ── Register all commands ──────────────────────────────────────────────

    registerCommands(app);

    // ── Sidebar container (left area) ──────────────────────────────────────

    const sidebar = new Panel();
    sidebar.id = 'wikilab-sidebar';
    sidebar.title.caption = 'WikiLab';
    sidebar.title.iconClass = 'lm-CommandPalette-icon';

    const sidebarLayout = sidebar.layout as PanelLayout;

    // ── WikiBrowser (left sidebar) ─────────────────────────────────────────

    const browser = new WikiBrowser();
    browser.serverSettings = serverSettings;

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

      editor.contentChanged.connect(() => onDirtyChange(editor));

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

      widget.disposed.connect(() => {
        editorTabs.delete(tabKey);
      });

      editorTabs.set(tabKey, { widget, editor });
      _editorInstance = editor;

      app.shell.add(widget, 'main', { rank: 100 });
      app.shell.activateById(widgetId);
    });

    sidebarLayout.addWidget(browser);

    // ── Track file browser path changes → probe for wiki ──────────────────

    const trackPath = async (relativePath: string): Promise<void> => {
      const absPath = serverRoot
        ? `${serverRoot}/${relativePath}`.replace(/\/+/g, '/')
        : relativePath;
      browser.currentPath = absPath;
      try {
        const result = await probeWiki(absPath, serverSettings);
        if (result.is_wiki && result.id && result.name && result.path) {
          browser.setActiveWiki(result.id, result.name, result.path);
        } else {
          browser.clearWiki();
        }
      } catch {
        browser.clearWiki();
      }
    };

    const tracker = fileBrowserFactory.tracker;

    tracker.currentChanged.connect((_, widget) => {
      if (!widget) {
        return;
      }
      void trackPath(widget.model.path);
      widget.model.pathChanged.connect((_, args) => {
        void trackPath(args.newValue);
      });
    });

    // Probe the already-active directory on startup
    if (tracker.currentWidget) {
      void trackPath(tracker.currentWidget.model.path);
    } else {
      // No file browser open yet — show the "no wiki" placeholder
      browser.clearWiki();
    }

    // ── Register sidebar in left area ──────────────────────────────────────

    app.shell.add(sidebar, 'left', { rank: 100 });

    console.log('JupyterLab extension jupyterhub-wikilab is activated!');

    return browser as IWikiBrowser;
  }
};

// ── Plugin 2: IWikiEditor token (requires main plugin) ─────────────────────

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
    if (!_editorInstance) {
      throw new Error('WikiEditor instance not yet initialized');
    }
    return _editorInstance as IWikiEditor;
  }
};

// ── Plugin 3: Settings integration ──────────────────────────────────────────

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

export default [plugin, editorPlugin, settingsPlugin];
