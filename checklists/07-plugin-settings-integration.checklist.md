# Phase 07 — Plugin Wiring & Settings Integration Checklist

## Goal
Wire components into a coherent JupyterLab plugin with configurable settings.

- [ ] **Define plugin token in `tokens.ts`**
  - **Task:** Create service token contract for dependency injection.
  - **Validation:** `jlpm tsc --noEmit`
  - **Commit suggestion:** `feat(plugin): add wiki service token definition`

- [ ] **Wire extension activation in `index.ts`**
  - **Task:** Register plugin and instantiate core services/components.
  - **Validation:** `jlpm tsc --noEmit`
  - **Commit suggestion:** `feat(plugin): wire extension activation and services`

- [ ] **Register commands for wiki actions**
  - **Task:** Add command IDs for open/create/save/rename/history/search.
  - **Validation:** `jlpm test -- commands`
  - **Commit suggestion:** `feat(plugin): register wikilab command set`

- [ ] **Register sidebar and main-area integration**
  - **Task:** Add WikiBrowser to left area and editor widgets to main area.
  - **Validation:** `jupyter lab --dev-mode` (manual smoke: sidebar appears and opens pages)
  - **Commit suggestion:** `feat(plugin): integrate sidebar and editor widgets`

- [ ] **Add keyboard shortcut bindings**
  - **Task:** Bind Ctrl+S to save action in editor context.
  - **Validation:** `jupyter lab --dev-mode` (manual smoke: Ctrl+S triggers save)
  - **Commit suggestion:** `feat(plugin): add editor keyboard shortcuts`

- [ ] **Define settings schema fields**
  - **Task:** Add `committerEmail` and `defaultWikiPath` in `schema/plugin.json`.
  - **Validation:** `jupyter lab --dev-mode` (Settings Editor displays both fields)
  - **Commit suggestion:** `feat(settings): add committer and default wiki settings`
