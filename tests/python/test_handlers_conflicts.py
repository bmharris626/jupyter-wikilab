"""
Tests for stale-write conflict detection (409 responses).
"""

import json
from pathlib import Path
from unittest.mock import patch

import pytest


async def test_put_returns_409_on_stale_head(jp_fetch, tmp_path):
    """PUT returns 409 Conflict when head_sha does not match current HEAD."""
    # Create a wiki directory with a real git repo
    wiki_dir = tmp_path / "conflict-wiki"
    wiki_dir.mkdir()

    # Initialize git repo
    import subprocess

    subprocess.run(["git", "init"], cwd=str(wiki_dir), capture_output=True, check=True)
    subprocess.run(
        ["git", "config", "user.email", "test@test.com"],
        cwd=str(wiki_dir),
        capture_output=True,
        check=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "Test User"],
        cwd=str(wiki_dir),
        capture_output=True,
        check=True,
    )

    # Create initial page content and commit it
    initial_content = "# Initial Content"
    page_file = wiki_dir / "conflict-page.md"
    page_file.write_text(initial_content, encoding="utf-8")

    # Commit so get_page_sha returns a non-empty SHA
    subprocess.run(
        ["git", "add", "conflict-page.md"],
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

    # Get the current HEAD SHA from git
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=str(wiki_dir),
        capture_output=True,
        text=True,
        check=True,
    )
    current_sha = result.stdout.strip()

    # Modify the file and commit to advance HEAD
    page_file.write_text("# Modified for second commit", encoding="utf-8")
    subprocess.run(
        ["git", "add", "conflict-page.md"],
        cwd=str(wiki_dir),
        capture_output=True,
        check=True,
    )
    subprocess.run(
        ["git", "commit", "-m", "Second commit"],
        cwd=str(wiki_dir),
        capture_output=True,
        check=True,
    )

    # Register the wiki under a patched registry path
    with patch.object(
        __import__("jupyterhub_wikilab.wiki_registry", fromlist=["_REGISTRY_PATH"]),
        "_REGISTRY_PATH",
        str(tmp_path / "wikis_conflict.json"),
    ):
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "conflict-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "conflict-wiki",
                    "name": "Conflict Test Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        # Update the file on disk (simulating another writer)
        page_file.write_text("# Modified by another writer", encoding="utf-8")

        # PUT with stale SHA (from before second commit) should return 409
        response = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "conflict-wiki",
            "pages",
            "conflict-page",
            method="PUT",
            body=json.dumps({"content": "# New content", "head_sha": current_sha}),
            raise_error=False,
        )

        # Verify 409 on stale write
        assert response.code == 409
        body = json.loads(response.body)
        assert "error" in body
        assert "stale" in body["error"].lower()

        # PUT without head_sha should succeed (no conflict check)
        response = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "conflict-wiki",
            "pages",
            "conflict-page",
            method="PUT",
            body=json.dumps({"content": "# No SHA update"}),
            raise_error=False,
        )

    assert response.code == 200
    body = json.loads(response.body)
    assert "message" in body
