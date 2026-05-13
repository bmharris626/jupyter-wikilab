# Phase 04 — Frontend API Client & Markdown Renderer Checklist

## Goal
Create typed client contracts and markdown rendering pipeline.

- [ ] **Define TypeScript API contracts**
  - **Task:** Add interfaces/types for all REST payloads and responses.
  - **Validation:** `jlpm tsc --noEmit`
  - **Commit suggestion:** `feat(frontend): define typed wikilab API contracts`

- [ ] **Implement `wikiApi.ts` typed REST wrapper**
  - **Task:** Add methods for all backend endpoints via `ServerConnection`.
  - **Validation:** `jlpm test -- wikiApi`
  - **Commit suggestion:** `feat(frontend): implement typed wiki API client`

- [ ] **Implement markdown-it base renderer**
  - **Task:** Create renderer with anchors, TOC, and syntax highlighting.
  - **Validation:** `jlpm test -- markdownRenderer`
  - **Commit suggestion:** `feat(frontend): add markdown-it renderer with plugins`

- [ ] **Implement `[[Wiki Link]]` plugin**
  - **Task:** Add custom transformation for wiki-style links.
  - **Validation:** `jlpm test -- markdownRenderer-wikilinks`
  - **Commit suggestion:** `feat(frontend): add wiki link parsing plugin`

- [ ] **Add renderer unit tests for edge cases**
  - **Task:** Cover multiple links per line and malformed bracket sequences.
  - **Validation:** `jlpm test -- markdownRenderer-edgecases`
  - **Commit suggestion:** `test(frontend): cover markdown renderer edge cases`
