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
    save_page,
    create_page,
    delete_page,
    rename_page,
)
from jupyterhub_wikilab.git_service import (
    get_wiki_git_status,
    git_pull_wiki,
    git_push_wiki,
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
    def post(self):
        """Create a new wiki."""
        body = self.get_json_body()
        wiki_id = body.get("id")
        name = body.get("name")
        path = body.get("path")

        if not wiki_id or not name or not path:
            self.set_status(400)
            self.finish(
                json.dumps({"error": "Missing required fields: id, name, path"})
            )
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


class WikiPageGetHandler(APIHandler):
    """Handler for getting a page."""

    @tornado.web.authenticated
    def get(self, wiki_id, slug):
        """Get a page's content."""
        content = get_page_content(wiki_id, slug)
        if content is not None:
            self.finish(json.dumps({"content": content}))
        else:
            self.set_status(404)
            self.finish(json.dumps({"error": "Page not found"}))


class WikiPageSaveHandler(APIHandler):
    """Handler for saving a page."""

    @tornado.web.authenticated
    def put(self, wiki_id, slug):
        """Save a page."""
        body = self.get_json_body()
        content = body.get("content")
        head_sha = body.get("head_sha")

        if content is None:
            self.set_status(400)
            self.finish(json.dumps({"error": "Missing content"}))
            return

        success = save_page(wiki_id, slug, content, head_sha)
        if success:
            self.finish(json.dumps({"message": "Page saved successfully"}))
        else:
            self.set_status(400)
            self.finish(json.dumps({"error": "Failed to save page"}))


class WikiPageCreateHandler(APIHandler):
    """Handler for creating a page."""

    @tornado.web.authenticated
    def post(self, wiki_id):
        """Create a new page."""
        body = self.get_json_body()
        title = body.get("title")
        content = body.get("content")

        if not title or content is None:
            self.set_status(400)
            self.finish(
                json.dumps({"error": "Missing required fields: title, content"})
            )
            return

        slug = create_page(wiki_id, title, content)
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
    def delete(self, wiki_id, slug):
        """Delete a page."""
        success = delete_page(wiki_id, slug)
        if success:
            self.finish(json.dumps({"message": "Page deleted successfully"}))
        else:
            self.set_status(404)
            self.finish(json.dumps({"error": "Page not found"}))


class WikiPageRenameHandler(APIHandler):
    """Handler for renaming a page."""

    @tornado.web.authenticated
    def post(self, wiki_id, slug):
        """Rename a page."""
        body = self.get_json_body()
        new_title = body.get("new_title")

        if not new_title:
            self.set_status(400)
            self.finish(json.dumps({"error": "Missing new_title"}))
            return

        success = rename_page(wiki_id, slug, new_title)
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


def setup_route_handlers(web_app):
    """Setup all the route handlers for the wiki extension."""
    host_pattern = ".*$"
    base_url = web_app.settings.get("base_url", "/")

    # Wiki routes
    wiki_route_pattern = url_path_join(base_url, "wikilab", "api", "wikis")
    handlers = [
        (wiki_route_pattern, WikiListHandler),
        (url_path_join(wiki_route_pattern, r"([^/]+)$"), WikiCreateHandler),
        (url_path_join(wiki_route_pattern, r"([^/]+)/delete$"), WikiDeleteHandler),
    ]

    # Wiki page routes
    wiki_pages_route_pattern = url_path_join(
        base_url, "wikilab", "api", "wikis", r"([^/]+)", "pages"
    )
    # Page listing route must come before page-get/save (no slug suffix)
    handlers.extend(
        [
            (url_path_join(wiki_pages_route_pattern, r"(.*)"), WikiPageListHandler),
            (url_path_join(wiki_pages_route_pattern, r"([^/]+)$"), WikiPageGetHandler),
            (url_path_join(wiki_pages_route_pattern, r"([^/]+)$"), WikiPageSaveHandler),
            (
                url_path_join(wiki_pages_route_pattern, r"([^/]+)/create$"),
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
