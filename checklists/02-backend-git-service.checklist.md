# Phase 02 — Backend Git Service Checklist

## Goal

Add git-specific operations behind a service abstraction.

- [x] **Implement git repository detection/init helper**
  - **Task:** Add utility to detect `.git` and optionally initialize repository when requested.
  - **Validation:** `pytest -q tests/python/test_git_service.py::test_detect_or_init_repo`
  - **Commit suggestion:** `feat(git): add repository detect/init helper`

- [x] **Implement commit identity construction**
  - **Task:** Build Actor from `JUPYTERHUB_USER` and configured email.
  - **Validation:** `pytest -q tests/python/test_git_service.py::test_commit_actor_identity`
  - **Commit suggestion:** `feat(git): derive commit identity from user and settings`

- [x] **Implement page commit method**
  - **Task:** Commit page updates with standard message template.
  - **Validation:** `pytest -q tests/python/test_git_service.py::test_commit_page_update_message`
  - **Commit suggestion:** `feat(git): implement page update commit operation`

- [x] **Implement per-file history retrieval**
  - **Task:** Return commit log entries for a wiki page path.
  - **Validation:** `pytest -q tests/python/test_git_service.py::test_file_history_returns_entries`
  - **Commit suggestion:** `feat(git): add per-page git history retrieval`

- [x] **Implement search grep wrapper**
  - **Task:** Wrap `git grep -n -i` and parse to structured search results.
  - **Validation:** `pytest -q tests/python/test_git_service.py::test_search_grep_parse_results`
  - **Commit suggestion:** `feat(git): add full-text git grep parser`

- [x] **Implement backlinks grep wrapper**
  - **Task:** Wrap `git grep -l` for backlink discovery.
  - **Validation:** `pytest -q tests/python/test_git_service.py::test_backlinks_grep_results`
  - **Commit suggestion:** `feat(git): add backlinks lookup via git grep`

- [x] **Implement remote status/pull/push wrappers**
  - **Task:** Add ahead/behind status plus pull/push methods with clear error propagation.
  - **Validation:** `pytest -q tests/python/test_git_service.py::test_remote_status_pull_push_wrappers`
  - **Commit suggestion:** `feat(git): implement remote status and sync operations`
