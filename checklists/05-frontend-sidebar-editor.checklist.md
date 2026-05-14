# Phase 05 — Frontend Sidebar & Editor Checklist

## Goal

Deliver primary browsing/editing experience with save and dirty-state behavior.

- [x] **Implement `WikiBrowser.tsx` basic panel structure**
  - **Task:** Render wiki selector and page list container.
  - **Validation:** `jlpm test -- WikiBrowser` — 11/11 passed
  - **Commit suggestion:** `feat(ui): add wiki browser panel skeleton`

- [x] **Wire wiki selection and page list loading**
  - **Task:** Fetch and render pages for selected wiki.
  - **Validation:** `jlpm test -- WikiBrowser-load-pages` — covered within `jlpm test -- WikiBrowser`
  - **Commit suggestion:** `feat(ui): load pages for active wiki selection`

- [x] **Add git status indicator and push/pull actions**
  - **Task:** Show ahead/behind and connect action buttons.
  - **Validation:** `jlpm test -- WikiBrowser` — 20/20 passed (11 original + 9 new)
  - **Commit suggestion:** `feat(ui): add git status indicator and push/pull actions`

- [x] **Implement `WikiEditor.tsx` split editor/preview layout**
  - **Task:** Render CodeMirror and markdown preview side-by-side.
  - **Validation:** `jlpm test -- WikiEditor` — 15/15 passed, 98.61% coverage
  - **Commit suggestion:** `feat(ui): add split wiki editor and preview layout`

- [ ] **Wire page load into editor state**
  - **Task:** Load selected page content and associated `head_sha`.
  - **Validation:** `jlpm test -- WikiEditor-load-page`
  - **Commit suggestion:** `feat(ui): connect page loading to editor state`

- [ ] **Implement save action (button + Ctrl+S)**
  - **Task:** Save current content via API PUT with `head_sha`.
  - **Validation:** `jlpm test -- WikiEditor-save`
  - **Commit suggestion:** `feat(ui): implement editor save action and shortcut`

- [ ] **Add dirty-state and unload/close warnings**
  - **Task:** Track unsaved edits and warn before leaving.
  - **Validation:** `jlpm test -- WikiEditor-dirty-state`
  - **Commit suggestion:** `feat(ui): add unsaved-change detection and warnings`
