# Phase 03 — Backend Handlers & REST API Checklist

## Goal

Expose backend services through `/wikilab/api/` handlers with locking and conflict semantics.

- [x] **Register extension routes under `/wikilab/api/`**
  - **Task:** Add handler registration for the API base paths.
  - **Validation:** `pytest -q tests/python/test_handlers_routes.py::test_routes_registered`
  - **Commit suggestion:** `feat(api): register wikilab API routes`

- [x] **Implement `/wikis` endpoints**
  - **Task:** Wire GET/POST/DELETE for wiki registry operations.
  - **Validation:** `pytest -q tests/python/test_handlers_wikis.py`
  - **Commit suggestion:** `feat(api): implement wiki registry endpoints`

- [x] **Implement page CRUD endpoints**
  - **Task:** Wire pages list/get/create/update/delete and rename handlers.
  - **Validation:** `pytest -q tests/python/test_handlers_pages.py`
  - **Commit suggestion:** `feat(api): implement wiki page CRUD endpoints`

- [x] **Add per-wiki asyncio lock for write operations**
  - **Task:** Serialize save/rename/delete/commit operations by wiki path.
  - **Validation:** `pytest -q tests/python/test_handlers_locking.py::test_wiki_write_lock_serializes_updates`
  - **Commit suggestion:** `feat(api): enforce per-wiki write lock in handlers`

- [x] **Implement stale-write conflict detection**
  - **Task:** Require `head_sha` on save and return 409 when HEAD changed.
  - **Validation:** `pytest -q tests/python/test_handlers_conflicts.py::test_put_returns_409_on_stale_head`
  - **Commit suggestion:** `feat(api): add stale-write conflict detection with 409 responses`

- [ ] **Implement history/backlinks/search endpoints**
  - **Task:** Wire history retrieval and grep-backed read endpoints.
  - **Validation:** `pytest -q tests/python/test_handlers_read_features.py`
  - **Commit suggestion:** `feat(api): add history backlinks and search endpoints`

- [ ] **Implement git status/pull/push endpoints**
  - **Task:** Expose repo sync operations through REST handlers.
  - **Validation:** `pytest -q tests/python/test_handlers_git_sync.py`
  - **Commit suggestion:** `feat(api): add git status pull push endpoints`
