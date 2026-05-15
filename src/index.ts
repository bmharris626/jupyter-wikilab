import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { Panel, PanelLayout } from '@lumino/widgets';

import { listWikis } from './wikiApi';

import { WikiBrowser } from './components/WikiBrowser';
import { WikiEditor } from './components/WikiEditor';
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
