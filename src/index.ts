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
import { onDirtyChange, handlePageSwitch } from './utils/dirtyState';

import { IWikiBrowser, IWikiEditor } from './tokens';

import { registerCommands } from './commands';

// Module-level reference so editorPlugin can access the editor
// created in the main plugin (both share this module scope).
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
 * in JupyterLab's left area, and the editor in the main area.
 * Provides the WikiBrowser token for dependency injection.
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

    // ── Sidebar container (left area) ──────────────────────────────────────

    const sidebar = new Panel();
    sidebar.id = 'wikilab-sidebar';
    sidebar.title.caption = 'WikiLab';
    sidebar.title.iconClass = 'lm-CommandPalette-icon';

    const sidebarLayout = sidebar.layout as PanelLayout;

    // ── WikiBrowser (left sidebar) ─────────────────────────────────────────

    const browser = new WikiBrowser();
    browser.serverSettings = serverSettings;

    // ── WikiEditor (main area) ─────────────────────────────────────────────

    const editor = new WikiEditor();
    editor.serverSettings = serverSettings;
    _editorInstance = editor;

    // ── Main-area widget wrapping the editor ───────────────────────────────

    const editorWidget = new MainAreaWidget({ content: editor });
    editorWidget.id = 'wikilab-editor';
    editorWidget.title.caption = 'WikiLab Editor';
    editorWidget.title.iconClass = 'lm-FileIcon';

    // ── Unsaved-changes guard ─────────────────────────────────────────────

    editor.contentChanged.connect(() => onDirtyChange(editor));

    // ── Conflict resolution flow ──────────────────────────────────────────

    let conflictView: ConflictView | null = null;
    let currentSlug = '';

    browser.pageSelected.connect((_, args) => {
      currentSlug = args.slug;
    });

    editor.conflictDetected.connect(async (_, conflictArgs) => {
      if (conflictView) {
        conflictView.dispose();
        conflictView = null;
      }

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
          if (conflictView) {
            conflictView.dispose();
            conflictView = null;
          }
        },
        onDiscard: () => {
          void browser
            .loadPage(currentSlug)
            .then(content => {
              editor.setContent(content);
            })
            .catch(() => {
              // Reload failed — keep editor as-is
            });
          if (conflictView) {
            conflictView.dispose();
            conflictView = null;
          }
        }
      });

      // Place conflict view above the editor in the main area
      app.shell.add(conflictView, 'main', { rank: 99 });
    });

    // ── Wire page click → load content into editor ─────────────────────────

    browser.pageSelected.connect(async (_, args) => {
      await handlePageSwitch(editor, browser.activeWikiId, {
        slug: args.slug,
        head_sha: args.head_sha,
        content: browser._lastLoadedContent
      });
      // Focus the editor in the main area
      app.shell.activateById('wikilab-editor');
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

    // ── Register editor in main area ───────────────────────────────────────

    app.shell.add(editorWidget, 'main', { rank: 100 });

    // ── Return the WikiBrowser service ─────────────────────────────────────

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
