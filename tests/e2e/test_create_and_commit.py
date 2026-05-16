"""
E2E test: Validate create-and-commit page flow.

Creates a wiki, creates a "Test Page" through the API, commits the page
to git, and verifies the git log contains the commit for test-page.md.
"""

import json
import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest


async def test_create_and_commit_flow(jp_fetch, tmp_path):
    """Create a "Test Page" and verify test-page.md commit exists in git."""
    wiki_dir = tmp_path / "create-commit-wiki"
    wiki_dir.mkdir()

    # Initialize git repo in the wiki directory
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

    registry_path = tmp_path / "wikis_create_commit.json"

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
            "create-commit-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "create-commit-wiki",
                    "name": "Create Commit Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        # Create "Test Page"
        response = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "create-commit-wiki",
            "pages",
            "create",
            method="POST",
            body=json.dumps(
                {
                    "title": "Test Page",
                    "content": "# Test Page\n\nThis is a test page for e2e verification.",
                }
            ),
        )

        assert response.code == 200
        body = json.loads(response.body)
        assert body["slug"] == "test-page"

    # Verify the git log contains a commit for test-page.md
    # create_page now auto-commits with "Add: {Title}" format
    result = subprocess.run(
        ["git", "log", "--format=%s", "--", "test-page.md"],
        cwd=str(wiki_dir),
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0
    assert "Add: Test Page" in result.stdout
