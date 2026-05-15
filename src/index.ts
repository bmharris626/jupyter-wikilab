import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { Panel, PanelLayout } from '@lumino/widgets';

import { listWikis } from './wikiApi';

import { WikiBrowser } from './components/WikiBrowser';
import { WikiEditor } from './components/WikiEditor';

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
    const onDirtyChange = (): void => {
      // Always remove previous handler to avoid accumulation
      const existing = (window as any).__wikilabBeforeUnloadHandler;
      if (existing) {
        window.removeEventListener('beforeunload', existing);
      }

      if (editor.isDirty) {
        const handler = (e: BeforeUnloadEvent) => {
          e.preventDefault();
          e.returnValue = ''; // Required by Chrome
        };
        window.addEventListener('beforeunload', handler);
        // Store reference for cleanup
        (window as any).__wikilabBeforeUnloadHandler = handler;
      } else {
        (window as any).__wikilabBeforeUnloadHandler = undefined;
      }
    };

    editor.contentChanged.connect(() => onDirtyChange());

    // ── Wire page click → load content into editor ─────────────────────────

    browser.pageSelected.connect((_, args) => {
      // Guard: warn user if there are unsaved changes
      if (editor.isDirty) {
        const answer = window.confirm(
          'You have unsaved changes. Do you want to save before switching pages?'
        );
        if (answer) {
          void editor.save().then((saved: boolean) => {
            if (saved) {
              editor.page = {
                slug: args.slug,
                title: '',
                mtime: new Date().toISOString()
              };
              editor.setPage(browser.activeWikiId, args.slug, args.head_sha);
              editor.setContent(browser._lastLoadedContent, false);
              editor.focus();
            }
            // If save failed, do NOT switch pages
          });
        }
        // If cancelled, do nothing — keep the current page loaded
      } else {
        editor.page = {
          slug: args.slug,
          title: '',
          mtime: new Date().toISOString()
        };
        editor.setPage(browser.activeWikiId, args.slug, args.head_sha);
        editor.setContent(browser._lastLoadedContent, false);
        editor.focus();
      }
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
