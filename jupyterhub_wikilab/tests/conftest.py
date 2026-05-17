"""Shared pytest fixtures for jupyterhub_wikilab tests."""

import json
import subprocess
import pytest

from jupyterhub_wikilab import wiki_service
from jupyterhub_wikilab.wiki_service import MARKER_FILE


@pytest.fixture
def make_wiki(tmp_path):
    """Factory fixture: make_wiki(wiki_id, name, init_git) → wiki_path.

    Writes a .wikilab marker file, primes the in-memory cache, and
    optionally initialises a bare git repo (needed for page operations).
    """
    created = []

    def _make(wiki_id: str, name: str = "Test Wiki", init_git: bool = True):
        wiki_path = tmp_path / wiki_id
        wiki_path.mkdir(parents=True, exist_ok=True)
        (wiki_path / MARKER_FILE).write_text(
            json.dumps({"id": wiki_id, "name": name}), encoding="utf-8"
        )
        wiki_service._WIKI_CACHE[wiki_id] = str(wiki_path)
        created.append(wiki_id)
        if init_git:
            subprocess.run(
                ["git", "init"], cwd=wiki_path, check=True, capture_output=True
            )
            subprocess.run(
                ["git", "config", "user.email", "test@example.com"],
                cwd=wiki_path,
                capture_output=True,
            )
            subprocess.run(
                ["git", "config", "user.name", "Test"],
                cwd=wiki_path,
                capture_output=True,
            )
        return wiki_path

    yield _make

    for wid in created:
        wiki_service._WIKI_CACHE.pop(wid, None)
