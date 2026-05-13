# Plan: jupyter-wikilab — JupyterLab 4.x Git-Backed Wiki Extension

## Context

JupyterHub instances are shared across multiple users and groups, each with different documentation needs. A native wiki extension lets users author, search, and track knowledge directly inside JupyterLab — without leaving the environment — while using git as the storage and history layer for full portability and GitLab compatibility.

---

## Scope Boundaries

**In scope:** page index, creation, renaming, backlinks, full-text search, sidebar (`_sidebar.md`), page history, unsaved-change detection, auto-commit on save, manual push/pull, conflict detection, GitLab-compatible GLFM markdown, multiple named wikis per user/group.

**Explicitly out of scope:** real-time collaborative editing (Y.js/CRDT — incompatible with auto-commit model), WYSIWYG rich-text editor, image/attachment uploads, RBAC/access control (rely on POSIX permissions), admin-managed wiki list.

---

## Architecture

### Two-component JupyterLab 4.x extension

```
jupyter-wikilab/
├── jupyter_wikilab/           # Python server package (jupyter_server extension)
│   ├── __init__.py            # _load_jupyter_server_extension()
│   ├── handlers.py            # Tornado REST handlers
│   ├── git_service.py         # gitpython wrapper (commits, push/pull, log, grep)
│   ├── wiki_service.py        # Wiki registration, page CRUD, slug<->path mapping
│   └── search_service.py      # git grep orchestration
├── src/                       # TypeScript/React frontend
│   ├── index.ts               # Plugin activation, commands, sidebar registration
│   ├── tokens.ts              # IWikiService plugin token
│   ├── components/
│   │   ├── WikiBrowser.tsx    # Left sidebar: wiki selector + page tree
│   │   ├── WikiEditor.tsx     # Main area: split CodeMirror + markdown-it preview
│   │   ├── PageHistory.tsx    # Git log per page, diff view
│   │   ├── SearchPanel.tsx    # Full-text search results
│   │   └── ConflictView.tsx   # 409 conflict presentation + resolution
│   ├── services/
│   │   ├── wikiApi.ts         # ServerConnection wrapper for all REST calls
│   │   └── markdownRenderer.ts # markdown-it instance with plugins
│   └── styles/
│       └── index.css
├── schema/plugin.json          # User settings schema
├── pyproject.toml
├── package.json
└── tsconfig.json
```

Scaffold using the official copier template:
```
copier copy --trust https://github.com/jupyterlab/extension-template .
```
Choose: frontend + server extension, JupyterLab 4.x, hatch build backend.

---

## Backend REST API

Base path: `/wikilab/api/`

| Method | Path | Purpose |
|---|---|---|
| GET | `/wikis` | List registered wikis for this user |
| POST | `/wikis` | Register a new wiki (name, path) |
| DELETE | `/wikis/{wiki_id}` | Unregister a wiki |
| GET | `/wikis/{wiki_id}/pages` | List all pages (slug, title, mtime) |
| GET | `/wikis/{wiki_id}/pages/{slug}` | Get page content + current HEAD SHA |
| PUT | `/wikis/{wiki_id}/pages/{slug}` | Save page (body: content, head_sha) |
| POST | `/wikis/{wiki_id}/pages` | Create page (body: title, content) |
| DELETE | `/wikis/{wiki_id}/pages/{slug}` | Delete page |
| POST | `/wikis/{wiki_id}/pages/{slug}/rename` | Rename page (body: new_title) |
| GET | `/wikis/{wiki_id}/pages/{slug}/history` | git log for this file |
| GET | `/wikis/{wiki_id}/pages/{slug}/history/{sha}` | Page content at a commit |
| GET | `/wikis/{wiki_id}/backlinks/{slug}` | Pages that link to this slug (git grep) |
| GET | `/wikis/{wiki_id}/search?q=` | Full-text search (git grep) |
| GET | `/wikis/{wiki_id}/git/status` | Ahead/behind counts vs remote |
| POST | `/wikis/{wiki_id}/git/pull` | Pull from remote |
| POST | `/wikis/{wiki_id}/git/push` | Push to remote |

---

## Key Implementation Details

### 1. Wiki registration storage
Stored at `~/.jupyter/wikilab/wikis.json` (per-user, created on first use).
```json
[
  {"id": "abc123", "name": "My Notes", "path": "/home/alice/notes-wiki"},
  {"id": "def456", "name": "Team Docs", "path": "/shared/team/wiki"}
]
```
Path validation on registration: path must exist, must be a git repo OR user must confirm init; path must be readable+writable by the spawned user (rely on POSIX — no extra ACL checks).

### 2. Git commit identity
Read `JUPYTERHUB_USER` environment variable as the committer name. Email pulled from user settings (schema field `committerEmail`, default `{username}@wikilab`). Applied per-commit via gitpython `Actor(name, email)`. This prevents `root@hostname` commits.

### 3. Shared-wiki concurrency
Use a **per-wiki asyncio file lock** (Python `asyncio.Lock` keyed by wiki path) around all write operations (save, rename, delete, commit). This serializes edits from multiple users on the same working tree. Trade-off: simple, correct for wiki-scale usage; not suitable for high-frequency concurrent writes (declared acceptable).

### 4. Stale-write detection (conflict prevention)
On `GET /pages/{slug}`, response includes the current `head_sha` (git rev-parse HEAD).  
On `PUT /pages/{slug}`, client sends back `head_sha`. Server checks `repo.head.commit.hexsha` before committing:
- Match → commit, return new `head_sha`.
- Mismatch → **409 Conflict** with both the base and current content in the response body.  
Frontend `ConflictView.tsx` presents a three-panel diff (base / yours / theirs) with accept/discard controls.

### 5. Auto-commit on save
Every successful `PUT` creates a git commit:
```
Update: {Page Title}

Co-authored-by: {username} <{email}>
```
No staging area exposed to users. Commit happens inside the wiki lock.

### 6. Page naming / slugification
- Title → slug: lowercase, spaces → hyphens, strip non-alphanumeric except hyphens.
- File stored as `{slug}.md` at repo root (or subpath for nested pages).
- Special filenames: `home.md` (default landing page), `_sidebar.md` (custom nav).
- Rename = `git mv old.md new.md` + commit.

### 7. Markdown engine
Use **`markdown-it`** (TypeScript) with these plugins:
- `markdown-it-anchor` — heading anchors
- `markdown-it-table-of-contents` — `[[_TOC_]]` token → auto-generated TOC
- Custom plugin for `[[Page Name]]` wiki links → rendered as `<a href="...">Page Name</a>`. Implementation: match `\[\[([^\]]+)\]\]` globally (fix GitLab's "consumes rest of line" bug — deliberate, minor divergence from GitLab behavior in edge cases).
- `highlight.js` — syntax highlighting in fenced code blocks

### 8. Backlinks
On page open, frontend calls `GET /backlinks/{slug}`. Backend runs:
```python
repo.git.grep("-l", slug, "--", "*.md")
```
Returns list of pages that reference this slug. Displayed in sidebar below page index. No pre-built index — always current.

### 9. Full-text search
`GET /search?q={term}` → backend runs `git grep -n -i {term} -- *.md`, parses output into `{slug, title, line_number, excerpt}` list. Displayed in a search panel (opens in main area or sidebar, TBD during implementation).

### 10. Unsaved change detection
`WikiEditor.tsx` tracks `isDirty: boolean`. Tab title shows `• Page Title` when dirty. `beforeunload` / widget close handler warns if dirty. Auto-save (debounced 30s) is **not** included — user presses Ctrl+S or Save button to commit.

### 11. Left sidebar — Wiki Browser
- Top: dropdown to select active wiki + "+" button to register a new wiki.
- Below: page tree (alphabetical or `_sidebar.md`-ordered when present).
- Bottom: search input + backlinks section for the current page.
- Git status indicator: "↑2 ↓1" ahead/behind, Push/Pull buttons.

### 12. Main area — WikiEditor
- `MainAreaWidget` containing a split panel.
- Left: CodeMirror 6 editor (markdown mode, line numbers, undo stack).
- Right: rendered HTML from `markdown-it`, wiki links are clickable and open pages.
- Toolbar: Save (Ctrl+S), Rename, History, Delete.
- Tab title shows page title (not filename).

---

## File-by-File Implementation Order

1. **Scaffold** — run copier template, configure pyproject.toml, package.json.
2. **`wiki_service.py`** — registration, slug mapping, page CRUD (no git yet).
3. **`git_service.py`** — gitpython wrapper: init, commit, log, grep, push/pull.
4. **`handlers.py`** — wire REST endpoints to services, add file lock, conflict detection.
5. **`wikiApi.ts`** — typed HTTP client for all REST endpoints.
6. **`markdownRenderer.ts`** — markdown-it instance with all plugins.
7. **`WikiBrowser.tsx`** — sidebar panel (wiki selector, page list, git status).
8. **`WikiEditor.tsx`** — split editor + preview, dirty state, save.
9. **`PageHistory.tsx`** — git log view.
10. **`ConflictView.tsx`** — 409 conflict handling.
11. **`SearchPanel.tsx`** — search results display.
12. **`index.ts`** — register all plugins, commands, sidebar, keyboard shortcuts.
13. **`schema/plugin.json`** — committerEmail, defaultWikiPath settings.

---

## Dependencies

**Python:** `gitpython`, `jupyter_server>=2.0`
**Frontend:** `@jupyterlab/apputils`, `@jupyterlab/codemirror`, `markdown-it`, `markdown-it-anchor`, `markdown-it-table-of-contents`, `highlight.js`

---

## Verification / Smoke Test

1. Install in editable mode: `pip install -e ".[dev]" && jupyter labextension develop .`
2. Register a new wiki pointing at a local git repo.
3. Create a page "Test Page" → verify `test-page.md` committed in git.
4. Add a `[[Test Page]]` link on another page → open that page, verify backlink shows "Test Page".
5. Open two browser tabs on the same page; save from tab 1, then save from tab 2 → verify 409 conflict is surfaced in tab 2.
6. Create `_sidebar.md` in repo → verify sidebar renders it instead of auto-list.
7. Search for a word that appears in a page body → verify result found with line excerpt.
8. Click History on a page → verify git log entries shown with diffs.
9. Configure a remote and click Push → verify `git log --remotes` shows commits.
10. Rename a page → verify old URL 404s and new URL resolves; backlinks on other pages still resolve via redirect or are updated.
