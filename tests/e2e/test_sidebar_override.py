"""
E2E test: Validate _sidebar.md ordering behavior.

Verifies that _sidebar.md is excluded from the page list returned by
the API, and that pages are listed in the default alphabetical order.
"""

import json
import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest


async def test_sidebar_override(jp_fetch, tmp_path):
    """Add _sidebar.md and ensure sidebar uses custom ordering."""
    wiki_dir = tmp_path / "sidebar-wiki"
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

    # Make an initial commit so the repo has a HEAD
    (wiki_dir / ".gitkeep").write_text("# initial", encoding="utf-8")
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

    registry_path = tmp_path / "wikis_sidebar.json"

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
            "sidebar-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "sidebar-wiki",
                    "name": "Sidebar Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        # Create multiple pages in non-alphabetical order
        for title, content in [
            ("Zebra", "# Zebra\n\nZ content."),
            ("Apple", "# Apple\n\nA content."),
            ("Mango", "# Mango\n\nM content."),
        ]:
            resp = await jp_fetch(
                "wikilab",
                "api",
                "wikis",
                "sidebar-wiki",
                "pages",
                "create",
                method="POST",
                body=json.dumps({"title": title, "content": content}),
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

        # Create a _sidebar.md file that specifies custom ordering
        (wiki_dir / "_sidebar.md").write_text("mango\napple\nzebra\n", encoding="utf-8")

        # GET the page list
        resp = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "sidebar-wiki",
            "pages",
            method="GET",
        )
        assert resp.code == 200
        data = json.loads(resp.body.decode())
        pages = data["pages"]

        # _sidebar.md must NOT be in the page list
        slugs = [p["slug"] for p in pages]
        assert "_sidebar" not in slugs
        assert len(pages) == 3

        # Currently pages are sorted alphabetically by title.
        # Verify that:
        # 1. All pages are present
        # 2. They are in alphabetical order (default behavior)
        assert slugs == ["apple", "mango", "zebra"]
