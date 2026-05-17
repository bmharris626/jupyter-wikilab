/**
 * Tests for the wikilab command registry.
 *
 * Verifies that all command IDs are registered with the
 * application command registry and that their metadata
 * (label, caption, isEnabled) is correct.
 */

import { JupyterFrontEnd } from '@jupyterlab/application';

import { CommandIDs, registerCommands } from '../commands';

// ── Mock application ────────────────────────────────────────────────────────

interface CommandMeta {
  label: string;
  caption: string;
  isEnabled: () => boolean;
}

interface KeyBinding {
  command: string;
  keys: string[];
  selector: string;
}

const registeredCommands = new Map<string, CommandMeta>();
const registeredKeyBindings: KeyBinding[] = [];

function createMockApp(): JupyterFrontEnd {
  const commands = {
    addCommand(
      id: string,
      options: { label: string; caption: string; isEnabled: () => boolean }
    ) {
      registeredCommands.set(id, {
        label: options.label,
        caption: options.caption,
        isEnabled: options.isEnabled
      });
    },
    addKeyBinding(binding: {
      command: string;
      keys: string[];
      selector: string;
    }) {
      registeredKeyBindings.push({
        command: binding.command,
        keys: binding.keys,
        selector: binding.selector
      });
    }
  };

  return { commands } as unknown as JupyterFrontEnd;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('registerCommands', () => {
  beforeEach(() => {
    registeredCommands.clear();
    registeredKeyBindings.length = 0;
    const mockApp = createMockApp();
    registerCommands(mockApp);
  });

  afterEach(() => {
    registeredCommands.clear();
    registeredKeyBindings.length = 0;
  });

  it('registers the openSidebar command', () => {
    const meta = registeredCommands.get(CommandIDs.openSidebar);
    expect(meta).toBeDefined();
    expect(meta?.label).toBe('Open WikiLab Sidebar');
  });

  it('registers the createPage command', () => {
    const meta = registeredCommands.get(CommandIDs.createPage);
    expect(meta).toBeDefined();
    expect(meta?.label).toBe('New Wiki Page');
  });

  it('registers the savePage command', () => {
    const meta = registeredCommands.get(CommandIDs.savePage);
    expect(meta).toBeDefined();
    expect(meta?.label).toBe('Save Wiki Page');
  });

  it('registers the renamePage command', () => {
    const meta = registeredCommands.get(CommandIDs.renamePage);
    expect(meta).toBeDefined();
    expect(meta?.label).toBe('Rename Wiki Page');
  });

  it('registers the openHistory command', () => {
    const meta = registeredCommands.get(CommandIDs.openHistory);
    expect(meta).toBeDefined();
    expect(meta?.label).toBe('Page History');
  });

  it('registers the openSearch command', () => {
    const meta = registeredCommands.get(CommandIDs.openSearch);
    expect(meta).toBeDefined();
    expect(meta?.label).toBe('Search Wiki Pages');
  });

  it('registers the registerWiki command', () => {
    const meta = registeredCommands.get(CommandIDs.registerWiki);
    expect(meta).toBeDefined();
    expect(meta?.label).toBe('Register New Wiki');
  });

  it('registers the pushWiki command', () => {
    const meta = registeredCommands.get(CommandIDs.pushWiki);
    expect(meta).toBeDefined();
    expect(meta?.label).toBe('Push Wiki');
  });

  it('registers the pullWiki command', () => {
    const meta = registeredCommands.get(CommandIDs.pullWiki);
    expect(meta).toBeDefined();
    expect(meta?.label).toBe('Pull Wiki');
  });

  it('all commands are enabled by default', () => {
    for (const meta of registeredCommands.values()) {
      expect(meta.isEnabled()).toBe(true);
    }
  });

  it('all command IDs follow the wikilab namespace convention', () => {
    const allIds = [
      CommandIDs.openSidebar,
      CommandIDs.createPage,
      CommandIDs.savePage,
      CommandIDs.renamePage,
      CommandIDs.openHistory,
      CommandIDs.openSearch,
      CommandIDs.registerWiki,
      CommandIDs.pushWiki,
      CommandIDs.pullWiki
    ];
    for (const id of allIds) {
      expect(id).toMatch(/^jupyterhub-wikilab:/);
    }
  });

  it('registers a Ctrl+S keybinding for savePage scoped to the wiki editor', () => {
    const saveBindings = registeredKeyBindings.filter(
      b => b.command === CommandIDs.savePage && b.keys.includes('Ctrl+S')
    );
    expect(saveBindings.length).toBeGreaterThan(0);
    // At least one binding must target the wiki editor widget
    const editorBinding = saveBindings.find(
      b => b.selector.includes('WikiEditor') || b.selector.includes('wikilab')
    );
    expect(editorBinding).toBeDefined();
  });
});
