"""
E2E test: Validate page history and rename flow.

Verifies that history shows multiple commit entries and that renaming
a page creates a new slug while removing the old file.
"""

import json
import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest


async def test_history_and_rename(jp_fetch, tmp_path):
    """Check commit history and page rename behavior."""
    wiki_dir = tmp_path / "history-wiki"
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

    registry_path = tmp_path / "wikis_history.json"

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
            "history-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "history-wiki",
                    "name": "History Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        # Create "Home" page
        resp = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "history-wiki",
            "pages",
            "create",
            method="POST",
            body=json.dumps(
                {
                    "title": "Home",
                    "content": "# Home\n\nVersion 1 of the home page.",
                }
            ),
        )
        assert resp.code == 200

        # Save updated content (version 2)
        resp = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "history-wiki",
            "pages",
            "home",
            method="PUT",
            body=json.dumps(
                {
                    "content": "# Home\n\nVersion 2 of the home page.",
                }
            ),
        )
        assert resp.code == 200

        # Save updated content (version 3)
        resp = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "history-wiki",
            "pages",
            "home",
            method="PUT",
            body=json.dumps(
                {
                    "content": "# Home\n\nVersion 3 of the home page.",
                }
            ),
        )
        assert resp.code == 200

        # Check history: should have 3 entries
        resp = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "history-wiki",
            "pages",
            "home",
            "history",
            method="GET",
        )
        assert resp.code == 200
        data = json.loads(resp.body.decode())
        history = data["history"]
        assert len(history) == 3

        # Verify history entry structure
        for entry in history:
            assert "sha" in entry
            assert "message" in entry
            assert "author" in entry
            assert "date" in entry
            # Verify messages are present
            assert len(entry["message"]) > 0

        # Get content at first commit SHA (oldest, last in list)
        first_sha = history[-1]["sha"]
        resp = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "history-wiki",
            "pages",
            "home",
            "history",
            first_sha,
            method="GET",
        )
        assert resp.code == 200
        content_data = json.loads(resp.body.decode())
        assert "Version 1" in content_data["content"]

        # Rename "Home" to "Main"
        resp = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "history-wiki",
            "pages",
            "home",
            "rename",
            method="POST",
            body=json.dumps({"new_title": "Main"}),
        )
        assert resp.code == 200
        rename_data = json.loads(resp.body.decode())
        assert rename_data["message"] == "Page renamed successfully"

        # Verify old file no longer exists on disk
        assert not (wiki_dir / "home.md").exists()

        # Verify new file exists on disk
        new_file = wiki_dir / "main.md"
        assert new_file.exists()

        # Verify new file contains version 3 content
        content = new_file.read_text()
        assert "Version 3" in content
