# Phase 06 — History, Conflict, and Search UI Checklist

## Goal
Implement advanced read/reconcile workflows for a git-backed wiki.

- [ ] **Implement `PageHistory.tsx` commit list**
  - **Task:** Render history entries for current page.
  - **Validation:** `jlpm test -- PageHistory-list`
  - **Commit suggestion:** `feat(ui): add page history commit list`

- [ ] **Implement historical content view**
  - **Task:** Load and display page content at selected commit SHA.
  - **Validation:** `jlpm test -- PageHistory-commit-content`
  - **Commit suggestion:** `feat(ui): support viewing page content at commit`

- [ ] **Implement `ConflictView.tsx` layout**
  - **Task:** Render base/yours/theirs panes for 409 payload.
  - **Validation:** `jlpm test -- ConflictView-layout`
  - **Commit suggestion:** `feat(ui): add conflict view for stale-write responses`

- [ ] **Implement conflict resolution actions**
  - **Task:** Provide accept/discard action flows wired to editor state.
  - **Validation:** `jlpm test -- ConflictView-actions`
  - **Commit suggestion:** `feat(ui): add conflict resolution actions`

- [ ] **Implement `SearchPanel.tsx`**
  - **Task:** Add query input, execute search, render line-numbered results.
  - **Validation:** `jlpm test -- SearchPanel-results`
  - **Commit suggestion:** `feat(ui): add full-text search results panel`

- [ ] **Add backlinks panel section**
  - **Task:** Fetch and render pages linking to current slug.
  - **Validation:** `jlpm test -- WikiBrowser-backlinks`
  - **Commit suggestion:** `feat(ui): show backlinks for active page`
