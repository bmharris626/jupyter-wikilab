"""
Tests for wiki registry endpoints (WikiListHandler, WikiCreateHandler, WikiDeleteHandler).
"""

import json
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

# Path to the wiki registry — will be patched to a temp file for test isolation.
from jupyterhub_wikilab.wiki_registry import _REGISTRY_PATH


async def test_get_wikis_empty(jp_fetch):
    """GET /wikis returns an empty dict when no wikis are registered."""
    response = await jp_fetch("wikilab", "api", "wikis")
    assert response.code == 200
    body = json.loads(response.body)
    assert "wikis" in body
    assert isinstance(body["wikis"], dict)
    assert len(body["wikis"]) == 0


async def test_create_wiki_missing_fields(jp_fetch):
    """POST /wikis/<id> returns 400 when required fields are missing."""
    response = await jp_fetch(
        "wikilab",
        "api",
        "wikis",
        "test-wiki",
        method="POST",
        body=json.dumps({"name": "Test Wiki"}),  # missing id and path
        raise_error=False,
    )
    assert response.code == 400
    body = json.loads(response.body)
    assert "error" in body


async def test_create_wiki_success(jp_fetch, tmp_path):
    """POST /wikis/<id> creates a wiki when given valid fields."""
    # Create a temporary directory that the wiki path will point to
    wiki_dir = tmp_path / "test_wiki_repo"
    wiki_dir.mkdir()

    # Patch the registry path to a temp file so tests don't pollute the real registry
    with patch.object(
        __import__("jupyterhub_wikilab.wiki_registry", fromlist=["_REGISTRY_PATH"]),
        "_REGISTRY_PATH",
        str(tmp_path / "wikis.json"),
    ):
        response = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "test-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "test-wiki",
                    "name": "Test Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )
    assert response.code == 200
    body = json.loads(response.body)
    assert "message" in body
    assert body["message"] == "Wiki created successfully"


async def test_create_wiki_invalid_path(jp_fetch, tmp_path):
    """POST /wikis/<id> returns 400 when the path is not valid."""
    # Pass a file path (not a directory) as the wiki path
    non_existent = tmp_path / "not_a_directory"

    with patch.object(
        __import__("jupyterhub_wikilab.wiki_registry", fromlist=["_REGISTRY_PATH"]),
        "_REGISTRY_PATH",
        str(tmp_path / "wikis_invalid.json"),
    ):
        response = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "bad-wiki",
            method="POST",
            raise_error=False,
            body=json.dumps(
                {
                    "id": "bad-wiki",
                    "name": "Bad Wiki",
                    "path": str(non_existent),
                }
            ),
        )
    assert response.code == 400
    body = json.loads(response.body)
    assert "error" in body


async def test_get_wikis_after_create(jp_fetch, tmp_path):
    """GET /wikis includes the newly created wiki."""
    wiki_dir = tmp_path / "list-test-wiki"
    wiki_dir.mkdir()

    with patch.object(
        __import__("jupyterhub_wikilab.wiki_registry", fromlist=["_REGISTRY_PATH"]),
        "_REGISTRY_PATH",
        str(tmp_path / "wikis_list.json"),
    ):
        # Create the wiki
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "list-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "list-wiki",
                    "name": "List Test Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        # List wikis and verify it appears
        response = await jp_fetch("wikilab", "api", "wikis")
        assert response.code == 200
        body = json.loads(response.body)
        assert "list-wiki" in body["wikis"]
        assert body["wikis"]["list-wiki"]["name"] == "List Test Wiki"


async def test_delete_wiki_success(jp_fetch, tmp_path):
    """DELETE /wikis/<id>/delete removes the wiki."""
    wiki_dir = tmp_path / "delete-wiki"
    wiki_dir.mkdir()

    with patch.object(
        __import__("jupyterhub_wikilab.wiki_registry", fromlist=["_REGISTRY_PATH"]),
        "_REGISTRY_PATH",
        str(tmp_path / "wikis_delete.json"),
    ):
        # First create the wiki
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "delete-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "delete-wiki",
                    "name": "Delete Test Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        # Now delete it
        response = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "delete-wiki",
            "delete",
            method="DELETE",
        )
    assert response.code == 200
    body = json.loads(response.body)
    assert "message" in body


async def test_delete_wiki_not_found(jp_fetch):
    """DELETE /wikis/<id>/delete returns 404 for non-existent wiki."""
    response = await jp_fetch(
        "wikilab",
        "api",
        "wikis",
        "non-existent-wiki",
        "delete",
        method="DELETE",
        raise_error=False,
    )
    assert response.code == 404
    body = json.loads(response.body)
    assert "error" in body
