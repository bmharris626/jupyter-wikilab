# Phase 01 — Backend Core Wiki Service Checklist

## Goal
Implement filesystem-backed wiki registration and page CRUD logic (without git commit semantics yet).

- [ ] **Create wiki registry model and storage path utility**
  - **Task:** Add helpers for `~/.jupyter/wikilab/wikis.json` path creation and safe load/save.
  - **Validation:** `pytest -q tests/python/test_wiki_registry.py::test_registry_path_created`
  - **Commit suggestion:** `feat(backend): add wiki registry storage utilities`

- [ ] **Implement list/add/remove registry operations**
  - **Task:** Support listing wikis, registering wiki records, and unregistering by `wiki_id`.
  - **Validation:** `pytest -q tests/python/test_wiki_registry.py::test_add_list_delete_registry_entries`
  - **Commit suggestion:** `feat(backend): implement wiki registry CRUD operations`

- [ ] **Implement wiki registration path validation**
  - **Task:** Validate path existence and read/write accessibility for current user.
  - **Validation:** `pytest -q tests/python/test_wiki_registry.py::test_registration_path_validation`
  - **Commit suggestion:** `feat(backend): validate wiki registration paths`

- [ ] **Implement title-to-slug conversion utility**
  - **Task:** Add deterministic slugify behavior (lowercase, spaces to hyphens, strip disallowed chars).
  - **Validation:** `pytest -q tests/python/test_wiki_service.py::test_slugify_edge_cases`
  - **Commit suggestion:** `feat(backend): add slugify utility for wiki page titles`

- [ ] **Implement page create/read/update/delete in service layer**
  - **Task:** Add filesystem page CRUD methods for markdown pages.
  - **Validation:** `pytest -q tests/python/test_wiki_service.py::test_page_crud_filesystem`
  - **Commit suggestion:** `feat(backend): implement filesystem page CRUD service`

- [ ] **Implement page list metadata**
  - **Task:** Return page list with slug, title, and mtime.
  - **Validation:** `pytest -q tests/python/test_wiki_service.py::test_list_pages_returns_metadata`
  - **Commit suggestion:** `feat(backend): add page index metadata listing`
