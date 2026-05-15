# Phase 06 — History, Conflict, and Search UI Checklist

## Goal

Implement advanced read/reconcile workflows for a git-backed wiki.

- [x] **Implement `PageHistory.tsx` commit list**
  - **Task:** Render history entries for current page.
  - **Validation:** `jlpm test -- PageHistory` — 14/14 passed
  - **Commit suggestion:** `feat(ui): add page history commit list`

- [x] **Implement historical content view**
  - **Task:** Load and display page content at selected commit SHA.
  - **Validation:** `jlpm test -- PageHistory` — 19/19 passed (5 new content panel tests)
  - **Commit suggestion:** `feat(ui): add historical content view with backend route`

- [x] **Implement `ConflictView.tsx` layout**
  - **Task:** Render base/yours/theirs panes for 409 payload.
  - **Validation:** `jlpm test -- ConflictView` — 16/16 passed, 100% coverage
  - **Commit suggestion:** `feat(ui): add conflict view for stale-write responses`

- [x] **Implement conflict resolution actions**
  - **Task:** Provide accept/discard action flows wired to editor state.
  - **Validation:** `jlpm test -- ConflictView` — 16/16 passed; `jlpm test -- WikiEditor` — 27/27 passed (conflict signal test)
  - **Commit suggestion:** `feat(ui): wire conflict resolution actions to editor state`

- [x] **Implement `SearchPanel.tsx`**
  - **Task:** Add query input, execute search, render line-numbered results.
  - **Validation:** `jlpm test -- SearchPanel` — 22/22 passed
  - **Commit suggestion:** `feat(ui): add full-text search results panel`

- [x] **Add CSS styles for SearchPanel**
  - **Task:** Query bar, search button, results container, row/column styles.
  - **Validation:** `npx tsc --noEmit` — clean; `jlpm test` — 137/137 passed
  - **Commit suggestion:** `feat(css): add SearchPanel styles to base.css`

- [x] **Add backlinks panel section**
  - **Task:** Fetch and render pages linking to current slug.
  - **Validation:** `jlpm test -- WikiBrowser` — 25/25 passed (5 new backlinks tests)
  - **Commit suggestion:** `feat(ui): add backlinks panel to WikiBrowser sidebar`
