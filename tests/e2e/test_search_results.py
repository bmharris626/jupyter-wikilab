"""
E2E test: Validate full-text search output.

Creates a wiki with known content, searches for a term, and verifies
that search results include file paths, line numbers, and line excerpts.
"""

import json
import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest


async def test_search_results(jp_fetch, tmp_path):
    """Search for known term and verify line excerpts and line numbers."""
    wiki_dir = tmp_path / "search-wiki"
    wiki_dir.mkdir()

    # Initialize git repo
    subprocess.run(
        ["git", "init"],
        cwd=str(wiki_dir),
        capture_output=True,
        check=True,
    )
    subprocess.run(
        ["git", "config", "user.email", "wikilab@example.com"],
        cwd=str(wiki_dir),
        capture_output=True,
        check=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "wikilab"],
        cwd=str(wiki_dir),
        capture_output=True,
        check=True,
    )

    registry_path = tmp_path / "wikis_search.json"

    with patch.object(
        __import__("jupyterhub_wikilab.wiki_registry", fromlist=["_REGISTRY_PATH"]),
        "_REGISTRY_PATH",
        str(registry_path),
    ):
        # Register the wiki
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "search-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "search-wiki",
                    "name": "Search Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        # Create pages with known content
        resp = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "search-wiki",
            "pages",
            "create",
            method="POST",
            body=json.dumps(
                {
                    "title": "Home",
                    "content": "# Home\n\nWelcome to the wiki.\nThis is the home page.",
                }
            ),
        )
        assert resp.code == 200

        resp = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "search-wiki",
            "pages",
            "create",
            method="POST",
            body=json.dumps(
                {
                    "title": "About",
                    "content": "# About\n\nThis wiki is about testing.",
                }
            ),
        )
        assert resp.code == 200

        # Commit pages
        subprocess.run(
            ["git", "add", "."],
            cwd=str(wiki_dir),
            capture_output=True,
            check=True,
        )
        subprocess.run(
            ["git", "commit", "-m", "Add pages"],
            cwd=str(wiki_dir),
            capture_output=True,
            check=True,
        )

        # Search for "wiki"
        resp = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "search-wiki",
            "pages",
            "search",
            method="GET",
            params={"term": "wiki"},
        )
        assert resp.code == 200
        data = json.loads(resp.body.decode())
        results = data["results"]

        # Should find matches in multiple files
        assert len(results) >= 2

        # Each result should have file, line, and content
        for r in results:
            assert "file" in r
            assert "line" in r
            assert "content" in r
            assert isinstance(r["line"], int)

        # The term "wiki" should appear in the content of each result
        files_with_wiki = {r["file"] for r in results if "wiki" in r["content"].lower()}
        assert "home.md" in files_with_wiki
        assert "about.md" in files_with_wiki
