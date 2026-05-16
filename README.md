# jupyter-wikilab

[![Github Actions Status](https://github.com/bmharris626/jupyter-wikilab/workflows/Build/badge.svg)](https://github.com/bmharris626/jupyter-wikilab/actions/workflows/build.yml)

A JupyterLab 4.x extension that turns any local git repository into a wiki — letting you author, search, and track documentation without leaving your JupyterHub workspace. Each page is a Markdown file committed directly to git, giving you full portability and GitLab compatibility with no external services required.

---

## Features

- **Multiple wikis** — register any number of named wikis, each backed by its own git repository
- **Page management** — create, read, update, delete, and rename wiki pages from the sidebar
- **Auto-commit on save** — every save triggers a `git commit` using your JupyterHub username as the author identity
- **Conflict detection** — stale-write detection on every save; a three-way diff view surfaces conflicts when two users edit the same page simultaneously
- **Full page history** — git log per page with content at any past commit
- **Backlinks** — see which pages link to the current page (powered by `git grep`)
- **Full-text search** — case-insensitive `git grep` across all pages with line-level excerpts
- **Split editor** — CodeMirror 6 editor (left) with live Markdown preview (right); wiki links `[[Page Name]]` are rendered as clickable navigations
- **Sidebar** — wiki selector, page tree, search input, git ahead/behind indicator, Push/Pull buttons
- **Settings** — configurable committer email and default wiki path

---

## Requirements

- JupyterLab >= 4.0.0
- Python >= 3.10
- [GitPython](https://gitpython.readthedocs.io/) (`pip install gitpython`)

> **Note:** `gitpython` is a runtime dependency but is not yet declared in the package metadata. Install it explicitly until [this is fixed](https://github.com/bmharris626/jupyter-wikilab/issues).

---

## Install

```bash
pip install gitpython jupyterhub_wikilab
```

---

## Uninstall

```bash
pip uninstall jupyterhub_wikilab
```

---

## Settings

Settings are accessible via **Settings → Advanced Settings Editor → WikiLab**.

| Setting | Default | Description |
|---|---|---|
| `committerEmail` | `{username}@wikilab` | Email used for git commits. Set to your real email to match GitLab/GitHub commit history. |
| `defaultWikiPath` | `./wikis` | Suggested path when registering a new wiki. |

---

## Usage

1. Open the **WikiLab** panel from the left sidebar.
2. Click **+** to register a wiki — provide a name and the path to a local directory (it will be initialised as a git repo if it isn't one already).
3. Select a page from the page list to open it in the split editor.
4. Edit Markdown on the left; the preview updates on the right.
5. Press **Ctrl+S** (or the Save button) to save and auto-commit.
6. Use the **History** toolbar button to browse past commits for the current page.
7. Use the search box in the sidebar for full-text search across all pages.
8. Use **Push** / **Pull** buttons to sync with a remote (if configured).

### Wiki links

Use `[[Page Name]]` syntax to link between pages. Links are rendered as clickable anchors in the preview and navigate within JupyterLab.

### Conflict resolution

If another user saves the same page between when you opened it and when you save, a three-way diff view appears showing:
- **Base** — the content when you started editing
- **Theirs** — the current committed version
- **Yours** — your unsaved edits

Accept theirs or keep yours to resolve the conflict.

---

## Troubleshoot

If you see the frontend extension but it is not working, check that the server extension is enabled:

```bash
jupyter server extension list
```

If the server extension is installed and enabled but you do not see the frontend extension:

```bash
jupyter labextension list
```

---

## Contributing

### Development install

Note: You will need NodeJS to build the extension package.

The `jlpm` command is JupyterLab's pinned version of [yarn](https://yarnpkg.com/). You may use `yarn` or `npm` in place of `jlpm` below.

```bash
# Clone the repo
# cd into the project directory

# Set up a virtual environment and install in development mode
python -m venv .venv
source .venv/bin/activate
pip install gitpython
pip install --editable ".[dev,test]"

# Link the development version of the extension with JupyterLab
jupyter labextension develop . --overwrite
# Enable the server extension manually in develop mode
jupyter server extension enable jupyterhub_wikilab

# Build the TypeScript source
jlpm build
```

To watch the source directory and rebuild automatically:

```bash
# Terminal 1 — watch and rebuild TypeScript
jlpm watch

# Terminal 2 — run JupyterLab
jupyter lab
```

Refresh JupyterLab after each rebuild to pick up changes.

To generate source maps for JupyterLab core extensions as well:

```bash
jupyter lab build --minimize=False
```

### Development uninstall

```bash
jupyter server extension disable jupyterhub_wikilab
pip uninstall jupyterhub_wikilab
```

Also remove the symlink created by `jupyter labextension develop`:

```bash
# Find the labextensions folder
jupyter labextension list
# Remove the symlink named jupyterhub-wikilab inside that folder
```

### Testing

#### Server tests (pytest)

```bash
pip install -e ".[test]"
jupyter labextension develop . --overwrite
pytest -vv -r ap --cov jupyterhub_wikilab
```

#### Frontend tests (Jest)

```bash
jlpm
jlpm test
```

#### Integration tests (Playwright / Galata)

See [ui-tests/README.md](./ui-tests/README.md) for setup and run instructions.

---

## AI Coding Assistant Support

This project includes an `AGENTS.md` file with coding standards and best practices for JupyterLab extension development following the [AGENTS.md standard](https://agents.md) for cross-tool compatibility.

---

## Packaging

See [RELEASE.md](RELEASE.md) for release and packaging instructions.
