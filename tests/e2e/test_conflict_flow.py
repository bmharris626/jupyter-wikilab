"""
E2E test: Validate stale-write conflict behavior.

Simulates two tabs editing the same page: Tab A saves first, then Tab B
tries to save with a stale head_sha, confirming a 409 conflict response.
"""

import json
import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest
from tornado.httpclient import HTTPClientError


async def test_stale_write_conflict(jp_fetch, tmp_path):
    """Save from tab A, then stale save from tab B → confirm 409 conflict."""
    wiki_dir = tmp_path / "conflict-wiki"
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

    registry_path = tmp_path / "wikis_conflict.json"

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
            "conflict-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "conflict-wiki",
                    "name": "Conflict Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        # Create "Home" page
        resp = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "conflict-wiki",
            "pages",
            "create",
            method="POST",
            body=json.dumps(
                {
                    "title": "Home",
                    "content": "# Home\n\nOriginal content.",
                }
            ),
        )
        assert resp.code == 200

        # Commit the page so it has a git SHA
        subprocess.run(
            ["git", "add", "."],
            cwd=str(wiki_dir),
            capture_output=True,
            check=True,
        )
        subprocess.run(
            ["git", "commit", "-m", "Add Home page"],
            cwd=str(wiki_dir),
            capture_output=True,
            check=True,
        )

        # Tab A: GET the page to get head_sha
        resp_a = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "conflict-wiki",
            "pages",
            "home",
            method="GET",
        )
        assert resp_a.code == 200
        page_data = json.loads(resp_a.body.decode())
        original_sha = page_data["head_sha"]
        assert original_sha  # SHA should not be empty

        # Simulate Tab B: Modify the page directly (committing a new version)
        (wiki_dir / "home.md").write_text(
            "# Home\n\nModified by Tab B.", encoding="utf-8"
        )
        subprocess.run(
            ["git", "add", "home.md"],
            cwd=str(wiki_dir),
            capture_output=True,
            check=True,
        )
        subprocess.run(
            ["git", "commit", "-m", "Tab B modifies home"],
            cwd=str(wiki_dir),
            capture_output=True,
            check=True,
        )

        # Tab A: Try to save with stale head_sha → should get 409
        with pytest.raises(HTTPClientError) as exc_info:
            await jp_fetch(
                "wikilab",
                "api",
                "wikis",
                "conflict-wiki",
                "pages",
                "home",
                method="PUT",
                body=json.dumps(
                    {
                        "content": "# Home\n\nTab A stale save.",
                        "head_sha": original_sha,
                    }
                ),
            )
        resp_stale = exc_info.value
        assert resp_stale.code == 409
        conflict_body = json.loads(resp_stale.response.body.decode())
        assert "error" in conflict_body
        assert "Stale write" in conflict_body["error"]
        # Conflict response should include base and their content
        assert "base_content" in conflict_body
        assert "their_content" in conflict_body
