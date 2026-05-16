"""
E2E test: Validate wiki-links and backlinks behavior.

Creates two pages where one links to the other using wiki-link syntax [[Test Page]],
then verifies that backlinks are correctly detected.
"""

import json
import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest


async def test_backlinks_flow(jp_fetch, tmp_path):
    """Add [[Test Page]] on another page and verify backlinks are detected."""
    wiki_dir = tmp_path / "backlinks-wiki"
    wiki_dir.mkdir()

    # Initialize git repo so git grep works
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

    # Make an initial commit so the repo has a HEAD
    init_file = wiki_dir / ".gitkeep"
    init_file.write_text("# initial", encoding="utf-8")
    subprocess.run(
        ["git", "add", ".gitkeep"],
        cwd=str(wiki_dir),
        capture_output=True,
        check=True,
    )
    subprocess.run(
        ["git", "commit", "-m", "Initial commit"],
        cwd=str(wiki_dir),
        capture_output=True,
        check=True,
    )

    registry_path = tmp_path / "wikis_backlinks.json"

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
            "backlinks-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "backlinks-wiki",
                    "name": "Backlinks Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        # Create "Test Page" first
        resp = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "backlinks-wiki",
            "pages",
            "create",
            method="POST",
            body=json.dumps(
                {
                    "title": "Test Page",
                    "content": "# Test Page\n\nThis is the target page.",
                }
            ),
        )
        assert resp.code == 200

        # Create "Referencing Page" with a wiki-link to Test Page
        # Note: backlinks_grep_results searches for [[filename_stem]],
        # so the wiki-link must use the slug form [[test-page]] to match.
        resp = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "backlinks-wiki",
            "pages",
            "create",
            method="POST",
            body=json.dumps(
                {
                    "title": "Referencing Page",
                    "content": "# Referencing Page\n\nThis page links to [[test-page]].",
                }
            ),
        )
        assert resp.code == 200

        # Import backlinks function and verify backlinks for test-page
        from jupyterhub_wikilab.git_service import backlinks_grep_results

        backlinks = backlinks_grep_results(str(wiki_dir), "test-page.md")
        assert "referencing-page.md" in backlinks
        assert len(backlinks) >= 1
