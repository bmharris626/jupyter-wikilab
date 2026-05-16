import asyncio
import json
import os
from pathlib import Path
from typing import Any, Dict

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
import tornado

from jupyterhub_wikilab.wiki_service import (
    list_wikis,
    create_wiki,
    remove_wiki,
    list_pages,
    get_page_content,
    get_page_with_sha,
    save_page,
    create_page,
    delete_page,
    rename_page,
    ConflictError,
)

# Per-wiki asyncio locks for serializing write operations
# Keyed by canonical path (not wiki_id) so wikis sharing the same
# filesystem path correctly serialize concurrent writes.
_wiki_locks: Dict[str, asyncio.Lock] = {}


def _get_wiki_lock(wiki_id: str) -> asyncio.Lock:
    """Get or create an asyncio lock for a given wiki, keyed by its
    canonical filesystem path rather than wiki_id.
    """
    from .wiki_service import get_wiki_path

    path = get_wiki_path(wiki_id)
    if path is None:
        # Fallback: if wiki is not registered yet, fall back to wiki_id
        # so the lock still provides some serialization.
        cache_key = wiki_id
    else:
        cache_key = str(path)

    if cache_key not in _wiki_locks:
        _wiki_locks[cache_key] = asyncio.Lock()
    return _wiki_locks[cache_key]


from jupyterhub_wikilab.git_service import (
    get_wiki_git_status,
    git_pull_wiki,
    git_push_wiki,
    get_file_history,
    get_page_content_at_sha,
    search_grep_results,
    backlinks_grep_results,
)


class WikiListHandler(APIHandler):
    """Handler for listing wikis."""

    @tornado.web.authenticated
    def get(self):
        """Get list of all wikis."""
        wikis = list_wikis()
        self.finish(json.dumps({"wikis": wikis}))


class WikiCreateHandler(APIHandler):
    """Handler for creating a wiki."""

    @tornado.web.authenticated
    def post(self, wiki_id):
        """Create a new wiki."""
        body = self.get_json_body()
        # Prefer wiki_id from URL path; fall back to body
        wiki_id = wiki_id or body.get("id")
        name = body.get("name")
        path = body.get("path")

        if not wiki_id or not name or not path:
            self.set_status(400)
            self.finish(
                json.dumps({"error": "Missing required fields: id, name, path"})
            )
            return

        # Validate path is a real directory
        path_obj = Path(path)
        if not path_obj.is_dir():
            self.set_status(400)
            self.finish(json.dumps({"error": "Path must be an existing directory"}))
            return

        success = create_wiki(wiki_id, name, path)
        if success:
            self.finish(json.dumps({"message": "Wiki created successfully"}))
        else:
            self.set_status(400)
            self.finish(json.dumps({"error": "Failed to create wiki"}))


class WikiDeleteHandler(APIHandler):
    """Handler for deleting a wiki."""

    @tornado.web.authenticated
    def delete(self, wiki_id):
        """Delete a wiki."""
        success = remove_wiki(wiki_id)
        if success:
            self.finish(json.dumps({"message": "Wiki deleted successfully"}))
        else:
            self.set_status(404)
            self.finish(json.dumps({"error": "Wiki not found"}))


class WikiPageListHandler(APIHandler):
    """Handler for listing pages in a wiki."""

    @tornado.web.authenticated
    def get(self, wiki_id, slug=None):
        """Get list of pages in a wiki (no slug) or forward to get if slug provided."""
        if slug is not None:
            # Defer to WikiPageGetHandler
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
    """Handler for getting and saving a page.

    Merged GET and PUT into a single handler because tornado would
    otherwise overwrite duplicate URL patterns.
    """

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
            response = {
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

        user = getattr(self.current_user, "name", None)

        lock = _get_wiki_lock(wiki_id)
        async with lock:
            slug = create_page(wiki_id, title, content, user=user)
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
        """Get Git status."""
        status = get_wiki_git_status(wiki_id)
        self.finish(json.dumps({"status": status}))


class WikiGitPullHandler(APIHandler):
    """Handler for pulling from Git."""

    @tornado.web.authenticated
    def post(self, wiki_id):
        """Pull from remote."""
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
        """Push to remote."""
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
        """Get commit history for a page."""
        wiki_path = None
        wikis = list_wikis()
        if wiki_id in wikis:
            wiki_path = wikis[wiki_id].get("path")

        if wiki_path is None:
            self.set_status(404)
            self.finish(json.dumps({"error": "Wiki not found"}))
            return

        history = get_file_history(str(wiki_path), f"{slug}.md")
        self.finish(json.dumps({"history": history}))


class WikiPageHistoryShaHandler(APIHandler):
    """Handler for retrieving page content at a specific git commit SHA."""

    @tornado.web.authenticated
    def get(self, wiki_id, slug, sha):
        """Get page content as it existed at the given commit SHA."""
        wiki_path = None
        wikis = list_wikis()
        if wiki_id in wikis:
            wiki_path = wikis[wiki_id].get("path")

        if wiki_path is None:
            self.set_status(404)
            self.finish(json.dumps({"error": "Wiki not found"}))
            return

        content = get_page_content_at_sha(str(wiki_path), f"{slug}.md", sha)
        if content is not None:
            self.finish(json.dumps({"content": content}))
        else:
            self.set_status(404)
            self.finish(json.dumps({"error": "File not found at this commit"}))


class WikiPageBacklinksHandler(APIHandler):
    """Handler for finding backlinks to a page."""

    @tornado.web.authenticated
    def get(self, wiki_id, slug):
        """Get backlinks for a page."""
        wiki_path = None
        wikis = list_wikis()
        if wiki_id in wikis:
            wiki_path = wikis[wiki_id].get("path")

        if wiki_path is None:
            self.set_status(404)
            self.finish(json.dumps({"error": "Wiki not found"}))
            return

        backlinks = backlinks_grep_results(str(wiki_path), f"{slug}.md")
        self.finish(json.dumps({"backlinks": backlinks}))


class WikiPageSearchHandler(APIHandler):
    """Handler for full-text search across a wiki."""

    @tornado.web.authenticated
    def get(self, wiki_id):
        """Search wiki content using git grep."""
        wiki_path = None
        wikis = list_wikis()
        if wiki_id in wikis:
            wiki_path = wikis[wiki_id].get("path")

        if wiki_path is None:
            self.set_status(404)
            self.finish(json.dumps({"error": "Wiki not found"}))
            return

        term = self.get_argument("term", "")
        if not term:
            self.set_status(400)
            self.finish(json.dumps({"error": "Missing 'term' query parameter"}))
            return

        case_sensitive = self.get_argument("case_sensitive", "false").lower() == "true"
        results = search_grep_results(str(wiki_path), term, case_sensitive)
        self.finish(json.dumps({"results": results}))


def setup_route_handlers(web_app):
    """Setup all the route handlers for the wiki extension."""
    host_pattern = ".*$"
    base_url = web_app.settings.get("base_url", "/")

    # Wiki routes
    wiki_route_pattern = url_path_join(base_url, "wikilab", "api", "wikis")
    handlers = [
        (wiki_route_pattern, WikiListHandler),
        (url_path_join(wiki_route_pattern, r"([^/]+)$"), WikiCreateHandler),
        (url_path_join(wiki_route_pattern, r"([^/]+)/delete/?"), WikiDeleteHandler),
    ]

    # Wiki page routes
    # NOTE: Specific routes must come before the wildcard list route so that
    # tornado's first-match-wins ordering gives priority to dedicated handlers.
    wiki_pages_route_pattern = url_path_join(
        base_url, "wikilab", "api", "wikis", r"([^/]+)", "pages"
    )
    handlers.extend(
        [
            # Page action routes (create has no slug; delete/rename need slug)
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
            # Page read-feature routes (specific routes before wildcard)
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
            # Single-segment route (get/save merged into one handler)
            (
                url_path_join(wiki_pages_route_pattern, r"([^/]+)$"),
                WikiPageContentHandler,
            ),
            # Wildcard list route — must be last to avoid shadowing above routes
            (
                url_path_join(wiki_pages_route_pattern, r"/?$"),
                WikiPageListHandler,
            ),
        ]
    )

    # Wiki Git routes
    wiki_git_route_pattern = url_path_join(
        base_url, "wikilab", "api", "wikis", r"([^/]+)", "git"
    )
    handlers.extend(
        [
            (url_path_join(wiki_git_route_pattern, "status$"), WikiGitStatusHandler),
            (url_path_join(wiki_git_route_pattern, "pull$"), WikiGitPullHandler),
            (url_path_join(wiki_git_route_pattern, "push$"), WikiGitPushHandler),
        ]
    )

    web_app.add_handlers(host_pattern, handlers)
