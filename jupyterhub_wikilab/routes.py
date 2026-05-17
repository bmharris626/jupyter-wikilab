import asyncio
import json
import os
from pathlib import Path
from typing import Any, Dict

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
import tornado

from jupyterhub_wikilab.wiki_service import (
    probe_wiki,
    init_wiki,
    get_wiki_path,
    list_pages,
    get_page_content,
    get_page_with_sha,
    save_page,
    create_page,
    delete_page,
    rename_page,
    ConflictError,
)

from jupyterhub_wikilab.git_service import (
    get_wiki_git_status,
    git_pull_wiki,
    git_push_wiki,
    get_file_history,
    get_page_content_at_sha,
    search_grep_results,
    backlinks_grep_results,
)

# Per-wiki asyncio locks for serializing write operations.
# Keyed by canonical path so wikis sharing the same filesystem path
# correctly serialize concurrent writes.
_wiki_locks: Dict[str, asyncio.Lock] = {}

# Server root — set once in setup_route_handlers() and used for path validation.
_SERVER_ROOT: str = ""


def _get_wiki_lock(wiki_id: str) -> asyncio.Lock:
    """Get or create an asyncio lock for a given wiki, keyed by its path."""
    path = get_wiki_path(wiki_id)
    cache_key = str(path) if path is not None else wiki_id
    if cache_key not in _wiki_locks:
        _wiki_locks[cache_key] = asyncio.Lock()
    return _wiki_locks[cache_key]


def _is_under_server_root(abs_path: str) -> bool:
    """Return True if abs_path is inside or equal to the server root."""
    if not _SERVER_ROOT:
        return False
    try:
        Path(abs_path).resolve().relative_to(Path(_SERVER_ROOT).resolve())
        return True
    except ValueError:
        return False


class WikiProbeHandler(APIHandler):
    """GET /wikilab/api/probe?path=...

    Checks whether a directory is a wikilab wiki (.wikilab + .git present).
    On success primes the in-memory wiki_id → path cache.
    """

    @tornado.web.authenticated
    def get(self):
        raw_path = self.get_argument("path", "")
        if not raw_path:
            self.set_status(400)
            self.finish(json.dumps({"error": "Missing path parameter"}))
            return

        path = Path(raw_path).resolve()
        if not _is_under_server_root(str(path)):
            self.set_status(403)
            self.finish(json.dumps({"error": "Path outside server root"}))
            return

        result = probe_wiki(path)
        if result:
            self.finish(json.dumps({"is_wiki": True, **result}))
        else:
            self.finish(json.dumps({"is_wiki": False}))


class WikiInitHandler(APIHandler):
    """POST /wikilab/api/init

    Body: {"path": "...", "name": "..."}
    Creates .wikilab, ensures .git exists, adds .wikilab to .gitignore.
    Returns {"id": ..., "name": ..., "path": ...}.
    """

    @tornado.web.authenticated
    def post(self):
        body = self.get_json_body()
        raw_path = body.get("path", "")
        name = body.get("name", "")
        if not raw_path or not name:
            self.set_status(400)
            self.finish(json.dumps({"error": "Missing required fields: path, name"}))
            return

        path = Path(raw_path).resolve()
        if not _is_under_server_root(str(path)):
            self.set_status(403)
            self.finish(json.dumps({"error": "Path outside server root"}))
            return

        try:
            info = init_wiki(path, name)
            self.finish(json.dumps(info))
        except ValueError as exc:
            self.set_status(400)
            self.finish(json.dumps({"error": str(exc)}))


class WikiPageListHandler(APIHandler):
    """Handler for listing pages in a wiki."""

    @tornado.web.authenticated
    def get(self, wiki_id, slug=None):
        """Get list of pages in a wiki (no slug) or content if slug provided."""
        if slug is not None:
            content = get_page_content(wiki_id, slug)
            if content is not None:
                self.finish(json.dumps({"content": content}))
            else:
                self.set_status(404)
                self.finish(json.dumps({"error": "Page not found"}))
            return
        pages = list_pages(wiki_id)
        self.finish(json.dumps({"pages": pages}))


class WikiPageContentHandler(APIHandler):
    """Handler for getting and saving a page."""

    @tornado.web.authenticated
    def get(self, wiki_id, slug):
        """Get a page's content and current git SHA."""
        result = get_page_with_sha(wiki_id, slug)
        if result is not None:
            self.finish(
                json.dumps({"content": result["content"], "head_sha": result["sha"]})
            )
        else:
            self.set_status(404)
            self.finish(json.dumps({"error": "Page not found"}))

    @tornado.web.authenticated
    async def put(self, wiki_id, slug):
        """Save a page — serialized per-wiki via asyncio lock."""
        body = self.get_json_body()
        content = body.get("content")
        head_sha = body.get("head_sha")

        if content is None:
            self.set_status(400)
            self.finish(json.dumps({"error": "Missing content"}))
            return

        user = getattr(self.current_user, "name", None)

        lock = _get_wiki_lock(wiki_id)
        try:
            async with lock:
                success = save_page(wiki_id, slug, content, head_sha, user=user)
        except ConflictError as exc:
            self.set_status(409)
            response: Dict[str, Any] = {
                "error": "Stale write detected, page was modified",
            }
            if exc.base_content is not None:
                response["base_content"] = exc.base_content
            if exc.their_content is not None:
                response["their_content"] = exc.their_content
            self.finish(json.dumps(response))
            return

        if success:
            self.finish(json.dumps({"message": "Page saved successfully"}))
        else:
            self.set_status(400)
            self.finish(json.dumps({"error": "Failed to save page"}))


class WikiPageCreateHandler(APIHandler):
    """Handler for creating a page."""

    @tornado.web.authenticated
    async def post(self, wiki_id):
        """Create a new page — serialized per-wiki via asyncio lock."""
        body = self.get_json_body()
        title = body.get("title")
        content = body.get("content")

        if not title or content is None:
            self.set_status(400)
            self.finish(
                json.dumps({"error": "Missing required fields: title, content"})
            )
            return

        folder = body.get("folder") or None
        user = getattr(self.current_user, "name", None)

        lock = _get_wiki_lock(wiki_id)
        async with lock:
            slug = create_page(wiki_id, title, content, user=user, folder=folder)
        if slug:
            self.finish(
                json.dumps({"slug": slug, "message": "Page created successfully"})
            )
        else:
            self.set_status(400)
            self.finish(json.dumps({"error": "Failed to create page"}))


class WikiPageDeleteHandler(APIHandler):
    """Handler for deleting a page."""

    @tornado.web.authenticated
    async def delete(self, wiki_id, slug):
        """Delete a page — serialized per-wiki via asyncio lock."""
        user = getattr(self.current_user, "name", None)

        lock = _get_wiki_lock(wiki_id)
        async with lock:
            success = delete_page(wiki_id, slug, user=user)
        if success:
            self.finish(json.dumps({"message": "Page deleted successfully"}))
        else:
            self.set_status(404)
            self.finish(json.dumps({"error": "Page not found"}))


class WikiPageRenameHandler(APIHandler):
    """Handler for renaming a page."""

    @tornado.web.authenticated
    async def post(self, wiki_id, slug):
        """Rename a page — serialized per-wiki via asyncio lock."""
        body = self.get_json_body()
        new_title = body.get("new_title")

        if not new_title:
            self.set_status(400)
            self.finish(json.dumps({"error": "Missing new_title"}))
            return

        user = getattr(self.current_user, "name", None)

        lock = _get_wiki_lock(wiki_id)
        async with lock:
            success = rename_page(wiki_id, slug, new_title, user=user)
        if success:
            self.finish(json.dumps({"message": "Page renamed successfully"}))
        else:
            self.set_status(400)
            self.finish(json.dumps({"error": "Failed to rename page"}))


class WikiGitStatusHandler(APIHandler):
    """Handler for getting Git status."""

    @tornado.web.authenticated
    def get(self, wiki_id):
        status = get_wiki_git_status(wiki_id)
        self.finish(json.dumps({"status": status}))


class WikiGitPullHandler(APIHandler):
    """Handler for pulling from Git."""

    @tornado.web.authenticated
    def post(self, wiki_id):
        success = git_pull_wiki(wiki_id)
        if success:
            self.finish(json.dumps({"message": "Git pull successful"}))
        else:
            self.set_status(400)
            self.finish(json.dumps({"error": "Git pull failed"}))


class WikiGitPushHandler(APIHandler):
    """Handler for pushing to Git."""

    @tornado.web.authenticated
    def post(self, wiki_id):
        success = git_push_wiki(wiki_id)
        if success:
            self.finish(json.dumps({"message": "Git push successful"}))
        else:
            self.set_status(400)
            self.finish(json.dumps({"error": "Git push failed"}))


class WikiPageHistoryHandler(APIHandler):
    """Handler for retrieving commit history for a page."""

    @tornado.web.authenticated
    def get(self, wiki_id, slug):
        wiki_path_obj = get_wiki_path(wiki_id)
        if wiki_path_obj is None:
            self.set_status(404)
            self.finish(json.dumps({"error": "Wiki not found"}))
            return
        history = get_file_history(str(wiki_path_obj), f"{slug}.md")
        self.finish(json.dumps({"history": history}))


class WikiPageHistoryShaHandler(APIHandler):
    """Handler for retrieving page content at a specific git commit SHA."""

    @tornado.web.authenticated
    def get(self, wiki_id, slug, sha):
        wiki_path_obj = get_wiki_path(wiki_id)
        if wiki_path_obj is None:
            self.set_status(404)
            self.finish(json.dumps({"error": "Wiki not found"}))
            return
        content = get_page_content_at_sha(str(wiki_path_obj), f"{slug}.md", sha)
        if content is not None:
            self.finish(json.dumps({"content": content}))
        else:
            self.set_status(404)
            self.finish(json.dumps({"error": "File not found at this commit"}))


class WikiPageBacklinksHandler(APIHandler):
    """Handler for finding backlinks to a page."""

    @tornado.web.authenticated
    def get(self, wiki_id, slug):
        wiki_path_obj = get_wiki_path(wiki_id)
        if wiki_path_obj is None:
            self.set_status(404)
            self.finish(json.dumps({"error": "Wiki not found"}))
            return
        backlinks = backlinks_grep_results(str(wiki_path_obj), f"{slug}.md")
        self.finish(json.dumps({"backlinks": backlinks}))


class WikiPageSearchHandler(APIHandler):
    """Handler for full-text search across a wiki."""

    @tornado.web.authenticated
    def get(self, wiki_id):
        wiki_path_obj = get_wiki_path(wiki_id)
        if wiki_path_obj is None:
            self.set_status(404)
            self.finish(json.dumps({"error": "Wiki not found"}))
            return

        term = self.get_argument("term", "")
        if not term:
            self.set_status(400)
            self.finish(json.dumps({"error": "Missing 'term' query parameter"}))
            return

        case_sensitive = self.get_argument("case_sensitive", "false").lower() == "true"
        results = search_grep_results(str(wiki_path_obj), term, case_sensitive)
        self.finish(json.dumps({"results": results}))


def setup_route_handlers(web_app):
    """Setup all the route handlers for the wiki extension."""
    global _SERVER_ROOT
    _SERVER_ROOT = (
        str(web_app.settings.get("root_dir", "")) or os.path.expanduser("~")
    )

    base_url = web_app.settings.get("base_url", "/")

    # Discovery routes
    probe_url = url_path_join(base_url, "wikilab", "api", "probe")
    init_url = url_path_join(base_url, "wikilab", "api", "init")

    handlers = [
        (probe_url, WikiProbeHandler),
        (init_url, WikiInitHandler),
    ]

    # Wiki page routes
    wiki_pages_route_pattern = url_path_join(
        base_url, "wikilab", "api", "wikis", r"([^/]+)", "pages"
    )
    handlers.extend(
        [
            (
                url_path_join(wiki_pages_route_pattern, "create$"),
                WikiPageCreateHandler,
            ),
            (
                url_path_join(wiki_pages_route_pattern, r"([^/]+)/delete$"),
                WikiPageDeleteHandler,
            ),
            (
                url_path_join(wiki_pages_route_pattern, r"([^/]+)/rename$"),
                WikiPageRenameHandler,
            ),
            (
                url_path_join(wiki_pages_route_pattern, "search$"),
                WikiPageSearchHandler,
            ),
            (
                url_path_join(wiki_pages_route_pattern, r"([^/]+)/history/([^/]+)$"),
                WikiPageHistoryShaHandler,
            ),
            (
                url_path_join(wiki_pages_route_pattern, r"([^/]+)/history$"),
                WikiPageHistoryHandler,
            ),
            (
                url_path_join(wiki_pages_route_pattern, r"([^/]+)/backlinks$"),
                WikiPageBacklinksHandler,
            ),
            # Page content GET/PUT (must come after specific routes)
            (
                url_path_join(wiki_pages_route_pattern, r"(.+)$"),
                WikiPageContentHandler,
            ),
            # Page list (no slug)
            (wiki_pages_route_pattern, WikiPageListHandler),
        ]
    )

    # Git routes
    wiki_git_route_pattern = url_path_join(
        base_url, "wikilab", "api", "wikis", r"([^/]+)", "git"
    )
    handlers.extend(
        [
            (
                url_path_join(wiki_git_route_pattern, "status$"),
                WikiGitStatusHandler,
            ),
            (
                url_path_join(wiki_git_route_pattern, "pull$"),
                WikiGitPullHandler,
            ),
            (
                url_path_join(wiki_git_route_pattern, "push$"),
                WikiGitPushHandler,
            ),
        ]
    )

    web_app.add_handlers(".*$", handlers)
