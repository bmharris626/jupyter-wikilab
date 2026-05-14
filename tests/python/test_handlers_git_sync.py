"""
Tests for git status/pull/push endpoints (WikiGitStatusHandler, WikiGitPullHandler, WikiGitPushHandler).
"""

import json
from pathlib import Path
from unittest.mock import patch


async def test_git_status_returns_info(jp_fetch, tmp_path):
    """GET /wikis/{id}/git/status returns git status for a registered wiki."""
    wiki_dir = tmp_path / "git-status-wiki"
    wiki_dir.mkdir()

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

    page = wiki_dir / "page.md"
    page.write_text("# Hello", encoding="utf-8")
    subprocess.run(
        ["git", "add", "."],
        cwd=str(wiki_dir),
        capture_output=True,
        check=True,
    )
    subprocess.run(
        ["git", "commit", "-m", "Initial"],
        cwd=str(wiki_dir),
        capture_output=True,
        check=True,
    )

    with patch.object(
        __import__("jupyterhub_wikilab.wiki_registry", fromlist=["_REGISTRY_PATH"]),
        "_REGISTRY_PATH",
        str(tmp_path / "wikis_git_status.json"),
    ):
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "git-status-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "git-status-wiki",
                    "name": "Git Status Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        response = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "git-status-wiki",
            "git",
            "status",
            method="GET",
        )

    assert response.code == 200
    body = json.loads(response.body)
    assert "status" in body
    assert "branch" in body["status"]
    assert "dirty" in body["status"]


async def test_git_pull_returns_error_without_remote(jp_fetch, tmp_path):
    """POST /wikis/{id}/git/pull returns error when no remote is configured."""
    wiki_dir = tmp_path / "git-pull-wiki"
    wiki_dir.mkdir()

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

    page = wiki_dir / "page.md"
    page.write_text("# Hello", encoding="utf-8")
    subprocess.run(
        ["git", "add", "."],
        cwd=str(wiki_dir),
        capture_output=True,
        check=True,
    )
    subprocess.run(
        ["git", "commit", "-m", "Initial"],
        cwd=str(wiki_dir),
        capture_output=True,
        check=True,
    )

    with patch.object(
        __import__("jupyterhub_wikilab.wiki_registry", fromlist=["_REGISTRY_PATH"]),
        "_REGISTRY_PATH",
        str(tmp_path / "wikis_git_pull.json"),
    ):
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "git-pull-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "git-pull-wiki",
                    "name": "Git Pull Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        response = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "git-pull-wiki",
            "git",
            "pull",
            method="POST",
            body=b"",
            raise_error=False,
        )

    assert response.code == 400
    body = json.loads(response.body)
    assert "error" in body


async def test_git_push_returns_error_without_remote(jp_fetch, tmp_path):
    """POST /wikis/{id}/git/push returns error when no remote is configured."""
    wiki_dir = tmp_path / "git-push-wiki"
    wiki_dir.mkdir()

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

    page = wiki_dir / "page.md"
    page.write_text("# Hello", encoding="utf-8")
    subprocess.run(
        ["git", "add", "."],
        cwd=str(wiki_dir),
        capture_output=True,
        check=True,
    )
    subprocess.run(
        ["git", "commit", "-m", "Initial"],
        cwd=str(wiki_dir),
        capture_output=True,
        check=True,
    )

    with patch.object(
        __import__("jupyterhub_wikilab.wiki_registry", fromlist=["_REGISTRY_PATH"]),
        "_REGISTRY_PATH",
        str(tmp_path / "wikis_git_push.json"),
    ):
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "git-push-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "git-push-wiki",
                    "name": "Git Push Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        response = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "git-push-wiki",
            "git",
            "push",
            method="POST",
            body=b"",
            raise_error=False,
        )

    assert response.code == 400
    body = json.loads(response.body)
    assert "error" in body
