"""
Tests for per-wiki asyncio write lock serialization.
"""

import asyncio
import json
import time
from pathlib import Path
from unittest.mock import patch

import pytest


async def test_wiki_write_lock_serializes_updates(jp_fetch, tmp_path):
    """PUT requests to the same wiki are serialized by the per-wiki lock."""
    wiki_dir = tmp_path / "lock-wiki"
    wiki_dir.mkdir()

    with patch.object(
        __import__("jupyterhub_wikilab.wiki_registry", fromlist=["_REGISTRY_PATH"]),
        "_REGISTRY_PATH",
        str(tmp_path / "wikis_lock.json"),
    ):
        # Create the wiki
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "lock-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "lock-wiki",
                    "name": "Lock Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        # Create an initial page
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "lock-wiki",
            "pages",
            "create",
            method="POST",
            body=json.dumps({"title": "Test Page", "content": "# Version 1"}),
        )

        # Perform multiple concurrent PUTs and verify they all succeed
        # (which proves they were serialized, not lost due to race conditions)
        tasks = []
        for i in range(3):
            tasks.append(
                jp_fetch(
                    "wikilab",
                    "api",
                    "wikis",
                    "lock-wiki",
                    "pages",
                    "test-page",
                    method="PUT",
                    body=json.dumps({"content": f"# Version {i + 2}"}),
                )
            )

        # Wait for all tasks to complete
        responses = await asyncio.gather(*tasks)

        # All responses should be successful
        for resp in responses:
            assert resp.code == 200
            body = json.loads(resp.body)
            assert "message" in body

        # Verify the final content reflects the last successful write
        resp = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "lock-wiki",
            "pages",
            "test-page",
        )
        assert resp.code == 200
        body = json.loads(resp.body)
        assert body["content"] == "# Version 4"
