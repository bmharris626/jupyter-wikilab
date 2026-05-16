# Phase 09 — Plan Gap Remediation Checklist

## Goal

Close remaining gaps between `plan.md` expectations and current implementation.

- [x] **Implement auto-commit on save path (`PUT /pages/{slug}`)**
  - **Gap:** `save_page()` currently writes file content but does not create a git commit.
  - **Task:** Ensure save flow performs `git add` + commit inside the per-wiki write lock.
  - **Validation:** Add/update test that `PUT` immediately creates a new commit for the page without separate manual commit calls.
  - **Commit suggestion:** `fix(backend): auto-commit page updates on save`
  - **Resolved:** `save_page()` calls `commit_wiki_page()` after file write; `commit_wiki_page()` auto-initializes git repo via `detect_or_init_repo()`.

- [x] **Apply commit identity contract (`JUPYTERHUB_USER` + `committerEmail` setting)**
  - **Gap:** Backend commit paths are hardcoded to `wikilab@example.com` and do not consume the extension setting.
  - **Task:** Thread `committerEmail` (with `{username}@wikilab` fallback) into commit operations and use `JUPYTERHUB_USER` for actor name.
  - **Validation:** Add test coverage asserting author/committer name+email on new commits.
  - **Commit suggestion:** `fix(git): honor configured committer identity`
  - **Resolved:** Added `get_default_email(username)` helper; `construct_commit_actor()` uses `JUPYTERHUB_USER` env var + `{username}@wikilab` fallback; `user` parameter threaded through `save_page()` and `rename_page()`.

- [x] **Use git-aware rename semantics (`git mv` + commit)**
  - **Gap:** `rename_page()` uses filesystem rename only; no git move and no commit.
  - **Task:** Replace with git move workflow (or equivalent index-aware move) and persist a commit entry.
  - **Validation:** Add/update test ensuring rename appears in git history as a tracked rename.
  - **Commit suggestion:** `fix(wiki): persist page renames in git history`
  - **Resolved:** Added `rename_wiki_page()` to `git_service.py` — uses `git mv` for tracked files, fs-rename+index staging for untracked. Commits the rename with actor identity.

- [x] **Fix lock key granularity to wiki path (not wiki ID)**
  - **Gap:** write lock map is keyed by `wiki_id`; different IDs pointing to same path can race.
  - **Task:** key lock registry by canonical wiki path to guarantee serialization per working tree.
  - **Validation:** Add concurrency test showing two IDs sharing one repo cannot write concurrently.
  - **Commit suggestion:** `fix(routes): key write locks by wiki path`
  - **Resolved:** `_get_wiki_lock()` now keys by `get_wiki_path(wiki_id)` (canonical path) with wiki_id fallback for unregistered wikis.

- [x] **Resolve duplicate function definitions in `git_service.py`**
  - **Gap:** `get_git_repo`, `init_wiki_git`, `commit_wiki_page`, `get_wiki_git_status`, `git_pull_wiki`, and `git_push_wiki` are defined multiple times with different behavior.
  - **Task:** consolidate to one canonical implementation per function and remove dead/overridden code.
  - **Validation:** Run existing python tests and add targeted regression tests for consolidated behavior.
  - **Commit suggestion:** `refactor(git): remove duplicate service definitions`
  - **Resolved:** All 6 functions consolidated to single canonical definitions (17 total functions, no duplicates).

- [x] **Align documented API contract with implementation (or update plan/docs intentionally)**
  - **Gap:** Runtime API paths differ from `plan.md` table (e.g., `/pages/create`, `/delete` suffixes, `term` query parameter).
  - **Task:** either normalize routes to planned contract or update `plan.md` + docs/tests to record the accepted contract.
  - **Validation:** Add a route-contract test matrix for all public endpoints.
  - **Commit suggestion:** `docs(api): reconcile implemented routes with plan contract`
  - **Resolved:** Updated `plan.md` route table to reflect actual paths (`/pages/create`, `/pages/{slug}/delete`, `/pages/search?term=`, etc.), renamed `handlers.py` → `routes.py`, `search_service.py` → `git_service.py`, and fixed stale-write detection route reference.
