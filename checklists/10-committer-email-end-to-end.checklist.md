# 10-committer-email-end-to-end

## Goal

Wire `committerEmail` from frontend user settings through full stack into git commit operations; fix plan.md architecture drift and remove unused dependencies.

## Tasks

### Phase 10A: TypeScript frontend wiring

- [x] Update `src/components/WikiEditor.tsx` — add `committerEmail` setter, include in save() payload
- [x] Update `src/wikiApi.ts` — add `committer_email` to `PageSaveRequest`, `PageCreateRequest`, `PageRenameRequest` interfaces; pass in API calls
- [x] Update `src/commands.ts` — add `committer_email` to `ICreatePage`/`IRenamePage` args; pass to `wikiApi.createPage()`/`wikiApi.renamePage()`

### Phase 10B: Python backend wiring

- [x] Update `jupyterhub_wikilab/routes.py` — extract `committer_email` from request body in `WikiSaveHandler`, `WikiRenameHandler`, `WikiCreateHandler`; pass to service methods
- [x] Update `jupyterhub_wikilab/wiki_service.py` — accept `committer_email` parameter in `save_wiki_page()`, `create_wiki_page()`, `rename_wiki_page()`; forward to git service
- [x] Update `jupyterhub_wikilab/git_service.py` — `commit_page_update()` accepts `committer_email`; `construct_commit_actor()` accepts optional `username`; `CommitActor` inherits from `git.Actor`

### Phase 10C: Tests and housekeeping

- [x] Add Python tests in `tests/python/test_git_service.py` — 4 new tests for commit identity contract (explicit email, fallback email, commit_wiki_page, rename_wiki_page)
- [x] Fix `plan.md` architecture tree — duplicate `git_service.py` line replaced with `wiki_registry.py`
- [x] Remove unused `yjs` dev dependency from `package.json`
- [x] Run full test suite — 43 tests pass (39 original + 4 new)
- [x] TypeScript type check passes
