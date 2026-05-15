# Troubleshooting Guide

## Identity and Authentication Issues

### Extension Not Loading

If the WikiLab extension icon does not appear in JupyterLab:

1. Verify the server extension is enabled:

```bash
jupyter server extension list
```

You should see `jupyterhub_wikilab` listed as enabled.

2. Verify the frontend extension is installed:

```bash
jupyter labextension list
```

The `jupyterhub-wikilab` extension should appear as OK.

3. Restart JupyterLab after installing or enabling extensions.

### Token Authentication Errors

If you see 401 Unauthorized errors in the browser console:

- Ensure you have the correct authentication token configured
- Check that the `IdentityProvider.token` is set in your Jupyter config
- If using a proxy, ensure tokens are passed correctly

### Permission Denied on Wiki Directory

If the extension cannot write to the wiki directory:

- Ensure the JupyterLab server user has read/write access to the wiki
- Check directory permissions: `ls -la /path/to/wiki`
- On Linux, use `chown` or `chmod` to fix ownership

## Conflict Resolution

### Stale Write (HTTP 409 Conflict)

When two tabs edit the same page simultaneously, the second save receives
a 409 Conflict response. The response body contains:

```json
{
  "base_content": "# Original content\n...",
  "their_content": "# Other tab content\n..."
}
```

To resolve:

1. View both `base_content` (your starting version) and `their_content`
   (the version saved by the other tab)
2. Merge the changes manually
3. Save again with the current `head_sha` (get the latest SHA from
   GET /api/wikis/{wiki_id}/pages/{slug})

### Git Merge Conflicts

If the git repository has unresolved merge conflicts:

1. Check git status: `git status -C /path/to/wiki`
2. Resolve conflicts in the affected `.md` files
3. Complete the merge with `git add` and `git commit`
4. Refresh the page in JupyterLab

### Rename Conflicts

If a rename operation fails:

- The target file may already exist — choose a different title
- The source file may not exist — verify the slug is correct
- Check the server logs for the specific error message

## Remote Sync Errors

### Git Push Failures

Push operations may fail if:

- The remote requires authentication (provide credentials in remote URL)
- There are unpushed commits on the remote branch that are not in your
  local branch (pull first, then push)
- The remote branch is protected and requires a pull request

To resolve:

```bash
# Pull first to fetch remote changes
curl -X POST http://localhost:8888/api/wikis/{wiki_id}/git/pull

# Then push your changes
curl -X POST http://localhost:8888/api/wikis/{wiki_id}/git/push
```

### Git Pull Failures

Pull operations may fail if:

- The remote is not configured: set with `git remote add origin <url>`
- There are local uncommitted changes (commit or stash first)
- The remote has force-pushed history (use `git pull --rebase`)

### Search Returns No Results

If `git grep` returns no results for a search term:

- Ensure pages are committed to git — uncommitted changes are not
  indexed by search
- Check that the search term matches (note: search is case-insensitive
  by default)
- Verify the wiki directory path is correct in the registry

## Reference

- [Quickstart Guide](./quickstart.md) — Full feature documentation
- [README](../README.md) — Installation and setup
