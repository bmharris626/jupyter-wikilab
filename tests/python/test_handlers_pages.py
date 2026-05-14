"""
Tests for wiki page CRUD endpoints (list, get, create, save, delete, rename).
"""

import json
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest


async def test_list_pages_empty(jp_fetch, tmp_path):
    """GET pages returns an empty list when no pages exist in a wiki."""
    # Create a wiki first
    wiki_dir = tmp_path / "list-empty-wiki"
    wiki_dir.mkdir()

    with patch.object(
        __import__("jupyterhub_wikilab.wiki_registry", fromlist=["_REGISTRY_PATH"]),
        "_REGISTRY_PATH",
        str(tmp_path / "wikis_pages_empty.json"),
    ):
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "pages-empty-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "pages-empty-wiki",
                    "name": "Pages Empty Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

    response = await jp_fetch("wikilab", "api", "wikis", "pages-empty-wiki", "pages")
    assert response.code == 200
    body = json.loads(response.body)
    assert "pages" in body
    assert isinstance(body["pages"], list)
    assert len(body["pages"]) == 0


async def test_list_pages_with_files(jp_fetch, tmp_path):
    """GET pages returns a list of pages when .md files exist."""
    wiki_dir = tmp_path / "list-files-wiki"
    wiki_dir.mkdir()

    # Create some page files
    (wiki_dir / "hello.md").write_text("# Hello", encoding="utf-8")
    (wiki_dir / "world-page.md").write_text("# World", encoding="utf-8")

    with patch.object(
        __import__("jupyterhub_wikilab.wiki_registry", fromlist=["_REGISTRY_PATH"]),
        "_REGISTRY_PATH",
        str(tmp_path / "wikis_pages_list.json"),
    ):
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "list-files-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "list-files-wiki",
                    "name": "List Files Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        response = await jp_fetch("wikilab", "api", "wikis", "list-files-wiki", "pages")
    assert response.code == 200
    body = json.loads(response.body)
    assert "pages" in body
    assert len(body["pages"]) == 2
    slugs = {p["slug"] for p in body["pages"]}
    assert "hello" in slugs
    assert "world-page" in slugs


async def test_get_page_success(jp_fetch, tmp_path):
    """GET page returns content when page exists."""
    wiki_dir = tmp_path / "get-page-wiki"
    wiki_dir.mkdir()
    expected_content = "# Hello World\n\nThis is a test page."
    (wiki_dir / "hello.md").write_text(expected_content, encoding="utf-8")

    with patch.object(
        __import__("jupyterhub_wikilab.wiki_registry", fromlist=["_REGISTRY_PATH"]),
        "_REGISTRY_PATH",
        str(tmp_path / "wikis_pages_get.json"),
    ):
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "get-page-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "get-page-wiki",
                    "name": "Get Page Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        response = await jp_fetch(
            "wikilab", "api", "wikis", "get-page-wiki", "pages", "hello"
        )
    assert response.code == 200
    body = json.loads(response.body)
    assert "content" in body
    assert body["content"] == expected_content


async def test_get_page_not_found(jp_fetch, tmp_path):
    """GET page returns 404 when page does not exist."""
    wiki_dir = tmp_path / "get-notfound-wiki"
    wiki_dir.mkdir()

    with patch.object(
        __import__("jupyterhub_wikilab.wiki_registry", fromlist=["_REGISTRY_PATH"]),
        "_REGISTRY_PATH",
        str(tmp_path / "wikis_pages_notfound.json"),
    ):
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "get-notfound-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "get-notfound-wiki",
                    "name": "Get Not Found Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

    response = await jp_fetch(
        "wikilab",
        "api",
        "wikis",
        "get-notfound-wiki",
        "pages",
        "nonexistent",
        method="GET",
        raise_error=False,
    )
    assert response.code == 404
    body = json.loads(response.body)
    assert "error" in body


async def test_create_page_success(jp_fetch, tmp_path):
    """POST page creates a new page with auto-slugified title."""
    wiki_dir = tmp_path / "create-page-wiki"
    wiki_dir.mkdir()

    with patch.object(
        __import__("jupyterhub_wikilab.wiki_registry", fromlist=["_REGISTRY_PATH"]),
        "_REGISTRY_PATH",
        str(tmp_path / "wikis_pages_create.json"),
    ):
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "create-page-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "create-page-wiki",
                    "name": "Create Page Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        response = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "create-page-wiki",
            "pages",
            "create",
            method="POST",
            body=json.dumps(
                {
                    "title": "My New Page",
                    "content": "# My New Page Content",
                }
            ),
        )

    assert response.code == 200
    body = json.loads(response.body)
    assert "slug" in body
    assert body["slug"] == "my-new-page"
    assert "message" in body

    # Verify page file was created
    page_file = wiki_dir / "my-new-page.md"
    assert page_file.exists()
    assert page_file.read_text(encoding="utf-8") == "# My New Page Content"


async def test_create_page_missing_fields(jp_fetch, tmp_path):
    """POST page returns 400 when title or content is missing."""
    wiki_dir = tmp_path / "create-missing-wiki"
    wiki_dir.mkdir()

    with patch.object(
        __import__("jupyterhub_wikilab.wiki_registry", fromlist=["_REGISTRY_PATH"]),
        "_REGISTRY_PATH",
        str(tmp_path / "wikis_pages_missing.json"),
    ):
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "create-missing-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "create-missing-wiki",
                    "name": "Create Missing Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        # Missing content
        response = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "create-missing-wiki",
            "pages",
            "create",
            method="POST",
            body=json.dumps({"title": "Title Only"}),
            raise_error=False,
        )

    assert response.code == 400
    body = json.loads(response.body)
    assert "error" in body


async def test_save_page_success(jp_fetch, tmp_path):
    """PUT page saves/updates content."""
    wiki_dir = tmp_path / "save-page-wiki"
    wiki_dir.mkdir()

    # Create initial page
    (wiki_dir / "original.md").write_text("# Original", encoding="utf-8")

    with patch.object(
        __import__("jupyterhub_wikilab.wiki_registry", fromlist=["_REGISTRY_PATH"]),
        "_REGISTRY_PATH",
        str(tmp_path / "wikis_pages_save.json"),
    ):
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "save-page-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "save-page-wiki",
                    "name": "Save Page Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        response = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "save-page-wiki",
            "pages",
            "original",
            method="PUT",
            body=json.dumps({"content": "# Updated Content"}),
        )

    assert response.code == 200
    body = json.loads(response.body)
    assert "message" in body

    # Verify content was saved
    assert (wiki_dir / "original.md").read_text(encoding="utf-8") == "# Updated Content"


async def test_save_page_missing_content(jp_fetch, tmp_path):
    """PUT page returns 400 when content is missing."""
    wiki_dir = tmp_path / "save-missing-wiki"
    wiki_dir.mkdir()

    with patch.object(
        __import__("jupyterhub_wikilab.wiki_registry", fromlist=["_REGISTRY_PATH"]),
        "_REGISTRY_PATH",
        str(tmp_path / "wikis_pages_save_missing.json"),
    ):
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "save-missing-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "save-missing-wiki",
                    "name": "Save Missing Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        response = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "save-missing-wiki",
            "pages",
            "nonexistent",
            method="PUT",
            body=json.dumps({}),
            raise_error=False,
        )

    assert response.code == 400
    body = json.loads(response.body)
    assert "error" in body


async def test_delete_page_success(jp_fetch, tmp_path):
    """DELETE page removes a page file."""
    wiki_dir = tmp_path / "delete-page-wiki"
    wiki_dir.mkdir()
    (wiki_dir / "to-delete.md").write_text("# To Delete", encoding="utf-8")

    with patch.object(
        __import__("jupyterhub_wikilab.wiki_registry", fromlist=["_REGISTRY_PATH"]),
        "_REGISTRY_PATH",
        str(tmp_path / "wikis_pages_delete.json"),
    ):
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "delete-page-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "delete-page-wiki",
                    "name": "Delete Page Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        response = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "delete-page-wiki",
            "pages",
            "to-delete",
            "delete",
            method="DELETE",
        )

    assert response.code == 200
    body = json.loads(response.body)
    assert "message" in body
    assert not (wiki_dir / "to-delete.md").exists()


async def test_delete_page_not_found(jp_fetch, tmp_path):
    """DELETE page returns 404 when page does not exist."""
    wiki_dir = tmp_path / "delete-notfound-wiki"
    wiki_dir.mkdir()

    with patch.object(
        __import__("jupyterhub_wikilab.wiki_registry", fromlist=["_REGISTRY_PATH"]),
        "_REGISTRY_PATH",
        str(tmp_path / "wikis_pages_delete_notfound.json"),
    ):
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "delete-notfound-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "delete-notfound-wiki",
                    "name": "Delete Not Found Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        response = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "delete-notfound-wiki",
            "pages",
            "nonexistent",
            "delete",
            method="DELETE",
            raise_error=False,
        )

    assert response.code == 404
    body = json.loads(response.body)
    assert "error" in body


async def test_rename_page_success(jp_fetch, tmp_path):
    """POST rename moves a page file and updates listing."""
    wiki_dir = tmp_path / "rename-page-wiki"
    wiki_dir.mkdir()
    (wiki_dir / "old-name.md").write_text("# Old Name", encoding="utf-8")

    with patch.object(
        __import__("jupyterhub_wikilab.wiki_registry", fromlist=["_REGISTRY_PATH"]),
        "_REGISTRY_PATH",
        str(tmp_path / "wikis_pages_rename.json"),
    ):
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "rename-page-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "rename-page-wiki",
                    "name": "Rename Page Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        response = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "rename-page-wiki",
            "pages",
            "old-name",
            "rename",
            method="POST",
            body=json.dumps({"new_title": "New Renamed Name"}),
        )

    assert response.code == 200
    body = json.loads(response.body)
    assert "message" in body

    # Verify old file removed and new file created
    assert not (wiki_dir / "old-name.md").exists()
    new_file = wiki_dir / "new-renamed-name.md"
    assert new_file.exists()
    assert new_file.read_text(encoding="utf-8") == "# Old Name"


async def test_rename_page_not_found(jp_fetch, tmp_path):
    """POST rename returns 400 when page does not exist."""
    wiki_dir = tmp_path / "rename-notfound-wiki"
    wiki_dir.mkdir()

    with patch.object(
        __import__("jupyterhub_wikilab.wiki_registry", fromlist=["_REGISTRY_PATH"]),
        "_REGISTRY_PATH",
        str(tmp_path / "wikis_pages_rename_notfound.json"),
    ):
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "rename-notfound-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "rename-notfound-wiki",
                    "name": "Rename Not Found Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        response = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "rename-notfound-wiki",
            "pages",
            "nonexistent",
            "rename",
            method="POST",
            body=json.dumps({"new_title": "New Title"}),
            raise_error=False,
        )

    assert response.code == 400
    body = json.loads(response.body)
    assert "error" in body


async def test_rename_page_missing_new_title(jp_fetch, tmp_path):
    """POST rename returns 400 when new_title is missing."""
    wiki_dir = tmp_path / "rename-missing-wiki"
    wiki_dir.mkdir()

    with patch.object(
        __import__("jupyterhub_wikilab.wiki_registry", fromlist=["_REGISTRY_PATH"]),
        "_REGISTRY_PATH",
        str(tmp_path / "wikis_pages_rename_missing.json"),
    ):
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "rename-missing-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "rename-missing-wiki",
                    "name": "Rename Missing Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        response = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "rename-missing-wiki",
            "pages",
            "some-page",
            "rename",
            method="POST",
            body=json.dumps({}),
            raise_error=False,
        )

    assert response.code == 400
    body = json.loads(response.body)
    assert "error" in body


async def test_page_crud_workflow(jp_fetch, tmp_path):
    """Integration test: create, get, update, rename, delete a page in sequence."""
    wiki_dir = tmp_path / "workflow-wiki"
    wiki_dir.mkdir()

    with patch.object(
        __import__("jupyterhub_wikilab.wiki_registry", fromlist=["_REGISTRY_PATH"]),
        "_REGISTRY_PATH",
        str(tmp_path / "wikis_pages_workflow.json"),
    ):
        # Create wiki
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "workflow-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "workflow-wiki",
                    "name": "Workflow Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        # Create page
        resp = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "workflow-wiki",
            "pages",
            "create",
            method="POST",
            body=json.dumps({"title": "Test Page", "content": "# Initial Content"}),
        )
        assert resp.code == 200
        slug = json.loads(resp.body)["slug"]
        assert slug == "test-page"

        # Get page
        resp = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "workflow-wiki",
            "pages",
            "test-page",
            method="GET",
        )
        assert resp.code == 200
        assert json.loads(resp.body)["content"] == "# Initial Content"

        # Update page
        resp = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "workflow-wiki",
            "pages",
            "test-page",
            method="PUT",
            body=json.dumps({"content": "# Updated Content"}),
        )
        assert resp.code == 200

        # Verify update
        resp = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "workflow-wiki",
            "pages",
            "test-page",
            method="GET",
        )
        assert json.loads(resp.body)["content"] == "# Updated Content"

        # Rename page
        resp = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "workflow-wiki",
            "pages",
            "test-page",
            "rename",
            method="POST",
            body=json.dumps({"new_title": "Renamed Page"}),
        )
        assert resp.code == 200

        # Verify rename
        resp = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "workflow-wiki",
            "pages",
            "renamed-page",
            method="GET",
        )
        assert resp.code == 200
        assert json.loads(resp.body)["content"] == "# Updated Content"

        # Delete page
        resp = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "workflow-wiki",
            "pages",
            "renamed-page",
            "delete",
            method="DELETE",
        )
        assert resp.code == 200

        # Verify deleted
        resp = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "workflow-wiki",
            "pages",
            "renamed-page",
            method="GET",
            raise_error=False,
        )
        assert resp.code == 404
