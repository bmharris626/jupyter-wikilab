# jupyter-wikilab

[![GitHub Actions Status](https://github.com/bmharris626/jupyter-wikilab/workflows/Build/badge.svg)](https://github.com/bmharris626/jupyter-wikilab/actions/workflows/build.yml)
[![License: BSD-3-Clause](https://img.shields.io/badge/License-BSD--3--Clause-blue.svg)](LICENSE)

A JupyterLab 4.x extension that turns any local git repository into a wiki — letting you author, search, and track documentation without leaving your JupyterHub workspace.

## Description

Each wiki page is a Markdown file committed directly to git, giving full portability and GitLab compatibility with no external services. Features include multi-wiki support, split editor with live preview, conflict detection with three-way diff, full page history via git log, backlinks, and full-text search powered by `git grep`.

## Quick Start

```bash
pip install gitpython jupyterhub_wikilab
```

Open JupyterLab, open the **WikiLab** panel from the sidebar, click **+** to register a wiki (name + path to a git repo), then create and edit pages with `Ctrl+S` to save and auto-commit.

## Installation & Setup

### From PyPI

```bash
pip install gitpython jupyterhub_wikilab
```

### From pre-built wheel

Download the pre-built wheel from the [latest release](https://github.com/bmharris626/jupyter-wikilab/releases) and install:

```bash
pip install gitpython
pip install jupyterhub_wikilab-0.1.0-py3-none-any.whl
```

The wheel is self-contained and includes the frontend bundle — no build tools required.

### Uninstall

```bash
pip uninstall jupyterhub_wikilab
```

### Development install

```bash
python -m venv .venv && source .venv/bin/activate
pip install gitpython
pip install --editable ".[dev,test]"
jupyter labextension develop . --overwrite
jupyter server extension enable jupyterhub_wikilab
jlpm build
```

To watch and auto-rebuild:

```bash
jlpm watch          # Terminal 1
jupyter lab         # Terminal 2
```

## Usage

### Basic Workflow

1. Open the **WikiLab** panel from the left sidebar.
2. Click **+** to register a wiki — provide a name and path (auto-initialised as git repo if needed).
3. Select a page from the page list to open it in the split editor.
4. Edit Markdown on the left; live preview updates on the right.
5. Press **Ctrl+S** (or Save button) to save and auto-commit.
6. Use **History** toolbar button to browse past commits for the current page.
7. Use the search box for full-text search across all pages.
8. Use **Push / Pull** buttons to sync with a remote.

### Wiki Links

Use `[[Page Name]]` syntax to link between pages. Links are rendered as clickable anchors in the preview.

### Conflict Resolution

If another user saves the same page between when you opened it and when you save, a three-way diff view appears showing **Base** (content when you started), **Theirs** (current committed version), and **Yours** (your unsaved edits). Accept theirs or keep yours.

### Settings

Open **Settings → Advanced Settings Editor → WikiLab** to configure:

| Setting | Type | Default | Description |
|---|---|---|---|
| `committerEmail` | str | `{username}@wikilab` | Email used for git commits |
| `defaultWikiPath` | str | `./wikis` | Suggested path when registering a new wiki |

## Contributing

### Server tests (pytest)

```bash
pip install -e ".[test]"
jupyter labextension develop . --overwrite
pytest -vv -r ap --cov jupyterhub_wikilab
```

### Frontend tests (Jest)

```bash
jlpm
jlpm test
```

### Integration tests (Playwright / Galata)

Build first, then:

```bash
cd ui-tests && jlpm install && jlpm playwright test
```

See [ui-tests/README.md](./ui-tests/README.md) for full setup.

## Project Structure

```
jupyterhub_wikilab/                  # Python server extension
├── __init__.py                      # Extension registration
├── _version.py                      # Auto-generated from package.json
├── routes.py                        # REST API handlers
├── git_service.py                   # Git operations (commit, log, grep, etc.)
├── wiki_service.py                  # Wiki CRUD, rename, history
├── labextension/                    # Built JS bundle
└── tests/                           # Python unit tests
src/                                 # TypeScript frontend
├── index.ts                         # JupyterLab plugin
├── commands.ts                      # Centralized command definitions
├── request.ts                       # API request helper
├── types.ts                         # TypeScript type definitions
├── tokens.ts                        # JupyterLab tokens
├── wikiApi.ts                       # Wiki API wrapper
├── markdownRenderer.ts              # Markdown-it rendering
├── typings.d.ts                     # Module declarations
├── components/                      # React components
└── utils/                           # Utility functions
ui-tests/                            # Playwright integration tests
style/                               # CSS
├── base.css
├── index.css
└── index.js
docs/                                # Additional docs
├── quickstart.md
└── troubleshooting.md
checklists/                          # Implementation checklists
schema/                              # Settings schema (committerEmail, defaultWikiPath)
package.json
pyproject.toml
setup.py                             # setuptools shim
tsconfig.json
jest.config.js
babel.config.js
LICENSE
CHANGELOG.md
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

BSD 3-Clause. See [LICENSE](LICENSE).
