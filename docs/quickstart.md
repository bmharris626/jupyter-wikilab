# WikiLab Quickstart Guide

## Overview

WikiLab is a JupyterLab extension for creating and editing wikis backed by
git repositories. Each wiki is a directory with markdown files, versioned by
git. Pages are created, edited, and searched via the JupyterLab frontend or
the REST API.

## Prerequisites

- JupyterLab 4.x with the `jupyterhub_wikilab` extension installed
- A git repository for each wiki (the extension manages git operations)

## Registering a Wiki

To register a new wiki, make a POST request to the wikis endpoint. The
extension will track the wiki in its registry and use the specified directory
as the wiki's root.

```
POST /api/wikis/{wiki_id}
```

Request body:

```json
{
  "id": "my-wiki",
  "name": "My Wiki",
  "path": "/path/to/wiki-directory"
}
```

The wiki directory must exist and be a valid git repository. The extension
automatically initializes git if the directory is a fresh directory (not yet
a repo).

To list all registered wikis:

```
GET /api/wikis
```

## Creating a Page

Create a new page with a title and content:

```
POST /api/wikis/{wiki_id}/pages/create
```

Request body:

```json
{
  "title": "Introduction",
  "content": "# Introduction\n\nWelcome to the wiki."
}
```

The title is slugified to create the filename (e.g. "Introduction" becomes
`introduction.md`). Each page creation is committed to the git repository.

## Editing a Page

To update an existing page, make a PUT request to the page endpoint. The
extension uses optimistic locking — include the SHA of the current commit
to avoid conflicts.

```
PUT /api/wikis/{wiki_id}/pages/{slug}
```

Request body:

```json
{
  "content": "# Introduction\n\nUpdated content.",
  "head_sha": "abc123def456"
}
```

If the page has been modified since your `head_sha`, the server returns
HTTP 409 (Conflict) with the base content and the conflicting content so
you can resolve the merge.

## Searching Pages

Full-text search uses `git grep` across all wiki pages:

```
GET /api/wikis/{wiki_id}/pages/search?term=keyword
```

Optional query parameter `case_sensitive=true` for case-sensitive search.

Response format:

```json
{
  "results": [
    {
      "file": "introduction.md",
      "line": 3,
      "content": "Welcome to the wiki."
    }
  ]
}
```

## Page History

View the git commit history for a page:

```
GET /api/wikis/{wiki_id}/pages/{slug}/history
```

Response:

```json
{
  "history": [
    {
      "sha": "abc123def456...",
      "message": "Update introduction",
      "author": "Alice",
      "author_email": "alice@example.com",
      "date": "2026-05-15T10:30:00+00:00"
    }
  ]
}
```

To view page content at a specific commit:

```
GET /api/wikis/{wiki_id}/pages/{slug}/history/{sha}
```

Response:

```json
{
  "content": "# Introduction\n\nOld content."
}
```

## Renaming a Page

Rename a page to update its slug:

```
POST /api/wikis/{wiki_id}/pages/{slug}/rename
```

Request body:

```json
{
  "new_title": "New Title"
}
```

The file is renamed on disk (`{slug}.md` to `{new-slug}.md`). Wiki-links
in other pages are not automatically updated.

## Git Push and Pull

To pull changes from the remote repository:

```
POST /api/wikis/{wiki_id}/git/pull
```

To push local changes to the remote repository:

```
POST /api/wikis/{wiki_id}/git/push
```

These operations synchronize the local wiki directory with the git remote.
Pull before editing if others may have made changes; push after committing
to share your work.

## Wiki-Links and Backlinks

Pages can link to each other using wiki-link syntax `[[page-slug]]` (the
slug is the filename stem in lowercase with dashes). For example,
`[[introduction]]` links to `introduction.md`.

Backlinks show which pages link to a given page:

```
GET /api/wikis/{wiki_id}/pages/{slug}/backlinks
```

Response:

```json
{
  "backlinks": {
    "overview.md": ["Line 5: See [[introduction]] for details."]
  }
}
```

## Custom Sidebar Ordering

Create a `_sidebar.md` file in the wiki root to define custom page ordering.
Each line should be a wiki-link in the desired display order. Pages not
listed in `_sidebar.md` appear alphabetically after the sidebar entries.

See also: [Troubleshooting](./troubleshooting.md)
