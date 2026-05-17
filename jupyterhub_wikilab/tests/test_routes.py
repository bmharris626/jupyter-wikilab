"""Integration tests for the probe and init API endpoints."""

import json
import subprocess
from pathlib import Path
import pytest

from jupyterhub_wikilab import wiki_service
from jupyterhub_wikilab.wiki_service import MARKER_FILE


# ── Helper ───────────────────────────────────────────────────────────────────


def _make_wiki_dir(tmp_path: Path, wiki_id: str, name: str = "Test") -> Path:
    """Create a directory with .wikilab + .git so probe returns is_wiki=true."""
    wiki_path = tmp_path / wiki_id
    wiki_path.mkdir(parents=True, exist_ok=True)
    (wiki_path / MARKER_FILE).write_text(
        json.dumps({"id": wiki_id, "name": name}), encoding="utf-8"
    )
    subprocess.run(["git", "init"], cwd=wiki_path, check=True, capture_output=True)
    return wiki_path


# ── Probe endpoint ────────────────────────────────────────────────────────────


async def test_probe_returns_is_wiki_true(jp_fetch, tmp_path):
    wiki_path = _make_wiki_dir(tmp_path, "probe-wiki")
    try:
        response = await jp_fetch(
            "wikilab", "api", "probe",
            params={"path": str(wiki_path)},
            method="GET",
        )
        assert response.code == 200
        payload = json.loads(response.body)
        assert payload["is_wiki"] is True
        assert payload["id"] == "probe-wiki"
        assert payload["name"] == "Test"
    finally:
        wiki_service._WIKI_CACHE.pop("probe-wiki", None)


async def test_probe_returns_is_wiki_false_no_marker(jp_fetch, tmp_path):
    dir_path = tmp_path / "plain-dir"
    dir_path.mkdir()
    subprocess.run(["git", "init"], cwd=dir_path, check=True, capture_output=True)
    response = await jp_fetch(
        "wikilab", "api", "probe",
        params={"path": str(dir_path)},
        method="GET",
    )
    assert response.code == 200
    assert json.loads(response.body) == {"is_wiki": False}


async def test_probe_returns_is_wiki_false_no_git(jp_fetch, tmp_path):
    dir_path = tmp_path / "no-git"
    dir_path.mkdir()
    (dir_path / MARKER_FILE).write_text(
        json.dumps({"id": "x", "name": "x"}), encoding="utf-8"
    )
    response = await jp_fetch(
        "wikilab", "api", "probe",
        params={"path": str(dir_path)},
        method="GET",
    )
    assert response.code == 200
    assert json.loads(response.body) == {"is_wiki": False}


async def test_probe_missing_path_param_returns_400(jp_fetch):
    with pytest.raises(Exception) as exc_info:
        await jp_fetch("wikilab", "api", "probe", method="GET")
    assert "400" in str(exc_info.value)


async def test_probe_relative_path_returns_400(jp_fetch):
    """probe rejects relative (non-absolute) paths."""
    with pytest.raises(Exception) as exc_info:
        await jp_fetch(
            "wikilab", "api", "probe",
            params={"path": "relative/path"},
            method="GET",
        )
    assert "400" in str(exc_info.value)


# ── Init endpoint ─────────────────────────────────────────────────────────────


async def test_init_creates_wiki(jp_fetch, tmp_path):
    new_dir = tmp_path / "new-wiki"
    new_dir.mkdir()
    response = await jp_fetch(
        "wikilab", "api", "init",
        method="POST",
        body=json.dumps({"path": str(new_dir), "name": "Brand New Wiki"}),
    )
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload["name"] == "Brand New Wiki"
    assert payload["path"] == str(new_dir)
    wiki_id = payload["id"]
    assert (new_dir / MARKER_FILE).exists()
    assert (new_dir / ".git").exists()
    gi = (new_dir / ".gitignore").read_text(encoding="utf-8")
    assert MARKER_FILE in gi

    wiki_service._WIKI_CACHE.pop(wiki_id, None)


async def test_init_missing_fields_returns_400(jp_fetch, tmp_path):
    new_dir = tmp_path / "missing-name"
    new_dir.mkdir()
    with pytest.raises(Exception) as exc_info:
        await jp_fetch(
            "wikilab", "api", "init",
            method="POST",
            body=json.dumps({"path": str(new_dir)}),
        )
    assert "400" in str(exc_info.value)


async def test_init_relative_path_returns_400(jp_fetch):
    """init rejects relative (non-absolute) paths."""
    with pytest.raises(Exception) as exc_info:
        await jp_fetch(
            "wikilab", "api", "init",
            method="POST",
            body=json.dumps({"path": "relative/path", "name": "Bad"}),
        )
    assert "400" in str(exc_info.value)
