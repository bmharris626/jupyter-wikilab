import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { Panel, PanelLayout } from '@lumino/widgets';

import { listWikis } from './wikiApi';

import { WikiBrowser } from './components/WikiBrowser';
import { WikiEditor } from './components/WikiEditor';
import { ConflictView } from './components/ConflictView';
import { onDirtyChange, handlePageSwitch } from './utils/dirtyState';

import { IWikiBrowser, IWikiEditor } from './tokens';

// Module-level reference so editorPlugin can access the editor
// created in the main plugin (both share this module scope).
let _editorInstance: WikiEditor | null = null;

// ── Plugin 1: Core activation + IWikiBrowser token ──────────────────────────

/**
 * Initialization data for the jupyterhub-wikilab extension.
 *
 * Instantiates the sidebar and editor, registers the sidebar
 * in JupyterLab's left area, and provides the WikiBrowser token
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

    // ── Sidebar container ──────────────────────────────────────────────────

    const sidebar = new Panel();
    sidebar.id = 'wikilab-sidebar';
    sidebar.title.caption = 'WikiLab';
    sidebar.title.iconClass = 'lm-CommandPalette-icon';

    const layout = sidebar.layout as PanelLayout;

    // ── WikiBrowser (left) ─────────────────────────────────────────────────

    const browser = new WikiBrowser();
    browser.serverSettings = serverSettings;

    // ── WikiEditor (right) ─────────────────────────────────────────────────

    const editor = new WikiEditor();
    editor.serverSettings = serverSettings;
    _editorInstance = editor;

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

      layout.insertWidget(1, conflictView);
    });

    // ── Wire page click → load content into editor ─────────────────────────

    browser.pageSelected.connect(async (_, args) => {
      await handlePageSwitch(editor, browser.activeWikiId, {
        slug: args.slug,
        head_sha: args.head_sha,
        content: browser._lastLoadedContent
      });
    });

    layout.addWidget(browser);
    layout.addWidget(editor);

    // ── Populate wikis ─────────────────────────────────────────────────────

    try {
      const response = await listWikis(serverSettings);
      browser.populateWikis(response.wikis);
    } catch {
      browser.populateWikis({});
    }

    // ── Register sidebar as a JupyterLab panel ─────────────────────────────

    app.shell.add(sidebar, 'left', { rank: 100 });

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
 * Third plugin that provides the settings schema fields
 * and registers them with the application.
 */
const settingsPlugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterhub-wikilab:settings-plugin',
  description: 'Registers wikilab settings schema fields.',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    // Settings are loaded automatically from schema/plugin.json
    // via the jupyterlab settings system. No explicit registration
    // needed — the schema file is the single source of truth.
    console.log('JupyterLab extension settings loaded.');
  }
};

export { plugin, editorPlugin, settingsPlugin };
