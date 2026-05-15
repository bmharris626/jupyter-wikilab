/**
 * RegisterWikiDialog — Modal dialog for registering a new wiki repository.
 *
 * Collects three fields from the user (wiki ID, display name, filesystem path)
 * and posts them to `POST /wikis/{wiki_id}` via the backend API.
 *
 * ## Layout
 *
 * ```
 * ┌──────────────────────────────────────────────┐
 * │  Register New Wiki                       [×] │
 * ├──────────────────────────────────────────────┤
 * │  Wiki ID:    [________________________]      │
 * │  Display:    [________________________]      │
 * │  Path:       [________________________]      │
 * ├──────────────────────────────────────────────┤
 * │  [Cancel]                    [Register Wiki] │
 * └──────────────────────────────────────────────┘
 * ```
 */

import { Panel, PanelLayout, Widget } from '@lumino/widgets';

import { Notification } from '@jupyterlab/apputils';

import { ServerConnection } from '@jupyterlab/services';

import { createWiki } from '../wikiApi';
import type { WikiCreateRequest } from '../types';

// ── CSS class namespace ─────────────────────────────────────────────────────

const CSS_PREFIX = 'jp-RegisterWikiDialog';

// ── Public interface ────────────────────────────────────────────────────────

/** Callback fired when the user successfully registers a wiki. */
export type OnRegistered = () => void;

/** Arguments supplied to the dialog widget. */
export interface RegisterWikiDialogProps {
  /** JupyterLab server settings for API calls. */
  serverSettings: ServerConnection.ISettings;
  /** Callback invoked when registration succeeds. */
  onRegistered: OnRegistered;
}

// ── Dialog widget ───────────────────────────────────────────────────────────

/**
 * Modal dialog for registering a new wiki repository.
 *
 * The user fills in the wiki ID, display name, and filesystem path,
 * then clicks "Register Wiki" which posts the data to the backend.
 */
export class RegisterWikiDialog extends Panel {
  // ── Construction ─────────────────────────────────────────────────────

  /**
   * Construct the register-wiki dialog.
   * @param props - Dialog configuration.
   */
  constructor(props: RegisterWikiDialogProps) {
    super();
    this.addClass(CSS_PREFIX);
    this.title.caption = 'Register New Wiki';

    this._serverSettings = props.serverSettings;
    this._onRegistered = props.onRegistered;

    this._createTitleBar();
    this._createForm();
    this._createActions();

    this.addWidget(this._titleBar);
    this.addWidget(this._formPanel);
    this.addWidget(this._actionsPanel);
  }

  // ── Disposable ───────────────────────────────────────────────────────

  dispose(): void {
    super.dispose();
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private _serverSettings: ServerConnection.ISettings;
  private _onRegistered: OnRegistered;

  private _idInput!: HTMLInputElement;
  private _nameInput!: HTMLInputElement;
  private _pathInput!: HTMLInputElement;

  private _titleBar!: Panel;
  private _formPanel!: Panel;
  private _actionsPanel!: Panel;

  private _createTitleBar(): void {
    this._titleBar = new Panel();
    this._titleBar.addClass(`${CSS_PREFIX}-titleBar`);

    const titleText = document.createElement('span');
    titleText.textContent = 'Register New Wiki';
    titleText.className = `${CSS_PREFIX}-titleText`;

    const closeBtn = document.createElement('button');
    closeBtn.className = `${CSS_PREFIX}-closeBtn`;
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.addEventListener('click', () => this.dispose());

    this._titleBar.node.appendChild(titleText);
    this._titleBar.node.appendChild(closeBtn);
  }

  private _createForm(): void {
    this._formPanel = new Panel();
    this._formPanel.addClass(`${CSS_PREFIX}-form`);
    const layout = this._formPanel.layout as PanelLayout;

    // --- Wiki ID ---
    const idRow = this._createInputRow(
      'Wiki ID:',
      'Enter a unique identifier (e.g. mywiki)',
      'mywiki'
    );
    this._idInput = idRow.input;
    const idWidget = new Widget({ node: idRow.container });
    layout.addWidget(idWidget);

    // --- Display Name ---
    const nameRow = this._createInputRow(
      'Display Name:',
      'Human-readable name for the wiki',
      'My Wiki'
    );
    this._nameInput = nameRow.input;
    const nameWidget = new Widget({ node: nameRow.container });
    layout.addWidget(nameWidget);

    // --- Path ---
    const pathRow = this._createInputRow(
      'Path:',
      'Local filesystem path to the wiki directory',
      ''
    );
    this._pathInput = pathRow.input;
    const pathWidget = new Widget({ node: pathRow.container });
    layout.addWidget(pathWidget);
  }

  private _createInputRow(
    label: string,
    placeholder: string,
    defaultValue: string
  ): { container: HTMLDivElement; input: HTMLInputElement } {
    const container = document.createElement('div');
    container.className = `${CSS_PREFIX}-row`;

    const lbl = document.createElement('label');
    lbl.textContent = label;
    lbl.className = `${CSS_PREFIX}-label`;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = `${CSS_PREFIX}-input`;
    input.placeholder = placeholder;
    input.value = defaultValue;
    input.setAttribute('aria-label', label.replace(':', ''));

    if (defaultValue) {
      input.value = defaultValue;
    }

    container.appendChild(lbl);
    container.appendChild(input);

    return { container, input };
  }

  private _createActions(): void {
    this._actionsPanel = new Panel();
    this._actionsPanel.addClass(`${CSS_PREFIX}-actions`);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = `${CSS_PREFIX}-btn ${CSS_PREFIX}-btnCancel`;
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this.dispose());

    const registerBtn = document.createElement('button');
    registerBtn.className = `${CSS_PREFIX}-btn ${CSS_PREFIX}-btnRegister`;
    registerBtn.textContent = 'Register Wiki';
    registerBtn.addEventListener('click', () =>
      this._handleRegister(registerBtn)
    );

    this._actionsPanel.node.appendChild(cancelBtn);
    this._actionsPanel.node.appendChild(registerBtn);
  }

  private async _handleRegister(btn: HTMLButtonElement): Promise<void> {
    const wikiId = this._idInput.value.trim();
    const name = this._nameInput.value.trim();
    const path = this._pathInput.value.trim();

    // ── Client-side validation ─────────────────────────────────────────

    if (!wikiId || !name || !path) {
      void Notification.error('Missing field — all fields are required.');
      return;
    }

    if (wikiId.includes('/') || wikiId.includes('\\')) {
      void Notification.error(
        'Wiki ID must not contain slashes or backslashes.'
      );
      return;
    }

    // ── Disable button while in-flight ────────────────────────────────

    const originalText = btn.textContent;
    btn.textContent = 'Registering…';
    btn.disabled = true;

    try {
      const payload: WikiCreateRequest = { id: wikiId, name, path };
      await createWiki(wikiId, payload, this._serverSettings);

      void Notification.info(`Wiki "${name}" registered successfully.`);

      this.dispose();
      this._onRegistered();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      void Notification.error(`Failed to register wiki: ${message}`);
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }
}
