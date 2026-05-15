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

// ── Plugin ──────────────────────────────────────────────────────────────────

/**
 * Initialization data for the jupyterhub-wikilab extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterhub-wikilab:plugin',
  description:
    'An extension for displaying and editing wikis within JupyterLab.',
  autoStart: true,
  activate: async (app: JupyterFrontEnd) => {
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

    // ── Unsaved-changes guard ─────────────────────────────────────────────

    /**
     * Register a `beforeunload` listener so the browser warns the user
     * when they try to close the tab or navigate away while the editor
     * has unsaved content.
     */
    editor.contentChanged.connect(() => onDirtyChange(editor));

    // ── Conflict resolution flow ──────────────────────────────────────────

    let conflictView: ConflictView | null = null;
    let currentSlug = '';

    // Track current slug from page selection
    browser.pageSelected.connect((_, args) => {
      currentSlug = args.slug;
    });

    editor.conflictDetected.connect(async (_, conflictArgs) => {
      // Dismiss any existing conflict view first
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
          // Apply resolved content to editor and retry save
          editor.setContent(resolvedContent);
          void editor.save();
          if (conflictView) {
            conflictView.dispose();
            conflictView = null;
          }
        },
        onDiscard: () => {
          // Reload the page content from the server to discard local changes
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

      const layout = sidebar.layout as PanelLayout;
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

    console.log('JupyterLab extension jupyterhub-wikilab is activated!');
  }
};

export default plugin;
