# Phase 08 — Smoke Test, E2E Verification, and Docs Checklist

## Goal
Validate end-to-end behavior and document operational usage.

- [ ] **Run install/develop workflow**
  - **Task:** Install Python package and develop labextension in editable mode.
  - **Validation:** `pip install -e ".[dev]" && jupyter labextension develop .`
  - **Commit suggestion:** `test(e2e): verify editable install and extension develop flow`

- [ ] **Validate create-and-commit page flow**
  - **Task:** Create "Test Page" and verify `test-page.md` commit exists.
  - **Validation:** `git -C <wiki_path> log --oneline -- test-page.md`
  - **Commit suggestion:** `test(e2e): validate page creation commit workflow`

- [ ] **Validate wiki-links and backlinks behavior**
  - **Task:** Add `[[Test Page]]` on another page and verify backlinks.
  - **Validation:** `pytest -q tests/e2e/test_backlinks_flow.py`
  - **Commit suggestion:** `test(e2e): verify wiki links and backlinks flow`

- [ ] **Validate stale-write conflict behavior**
  - **Task:** Save from tab A, then stale save from tab B and confirm 409 UX.
  - **Validation:** `pytest -q tests/e2e/test_conflict_flow.py`
  - **Commit suggestion:** `test(e2e): verify stale-write conflict handling`

- [ ] **Validate `_sidebar.md` ordering behavior**
  - **Task:** Add `_sidebar.md` and ensure sidebar uses custom ordering.
  - **Validation:** `pytest -q tests/e2e/test_sidebar_override.py`
  - **Commit suggestion:** `test(e2e): verify sidebar markdown override behavior`

- [ ] **Validate full-text search output**
  - **Task:** Search for known term and verify line excerpts/line numbers.
  - **Validation:** `pytest -q tests/e2e/test_search_results.py`
  - **Commit suggestion:** `test(e2e): verify full-text search result formatting`

- [ ] **Validate page history and rename flow**
  - **Task:** Confirm history view entries and rename behavior work end-to-end.
  - **Validation:** `pytest -q tests/e2e/test_history_and_rename.py`
  - **Commit suggestion:** `test(e2e): verify history and rename workflows`

- [ ] **Add user quickstart documentation**
  - **Task:** Document register wiki, edit/save, search, history, push/pull.
  - **Validation:** `python -m pytest -q tests/docs/test_quickstart_links.py`
  - **Commit suggestion:** `docs: add wikilab quickstart and operational notes`

- [ ] **Add troubleshooting documentation**
  - **Task:** Document common issues (identity, conflicts, remote sync errors).
  - **Validation:** `python -m pytest -q tests/docs/test_troubleshooting_links.py`
  - **Commit suggestion:** `docs: add troubleshooting guide for git-backed wiki flows`
