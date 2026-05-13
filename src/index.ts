import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { requestAPI } from './request';

/**
 * Initialization data for the jupyterhub-wikilab extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterhub-wikilab:plugin',
  description: 'An extension for displaying/editing wikis within jupyterhub workspace',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    console.log('JupyterLab extension jupyterhub-wikilab is activated!');

    requestAPI<any>('hello', app.serviceManager.serverSettings)
      .then(data => {
        console.log(data);
      })
      .catch(reason => {
        console.error(
          `The jupyterhub_wikilab server extension appears to be missing.\n${reason}`
        );
      });
  }
};

export default plugin;
