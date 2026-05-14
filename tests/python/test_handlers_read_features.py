"""
Tests for history, backlinks, and search endpoints.
"""

import json
from pathlib import Path
from unittest.mock import patch


async def test_history_returns_commit_log(jp_fetch, tmp_path):
    """GET /wikis/{id}/pages/{slug}/history returns commit log entries."""
    wiki_dir = tmp_path / "history-wiki"
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

    page_file = wiki_dir / "history-page.md"
    page_file.write_text("# Page one", encoding="utf-8")
    subprocess.run(
        ["git", "add", "history-page.md"],
        cwd=str(wiki_dir),
        capture_output=True,
        check=True,
    )
    subprocess.run(
        ["git", "commit", "-m", "First commit"],
        cwd=str(wiki_dir),
        capture_output=True,
        check=True,
    )

    page_file.write_text("# Page two", encoding="utf-8")
    subprocess.run(
        ["git", "add", "history-page.md"],
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

    with patch.object(
        __import__("jupyterhub_wikilab.wiki_registry", fromlist=["_REGISTRY_PATH"]),
        "_REGISTRY_PATH",
        str(tmp_path / "wikis_history.json"),
    ):
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "history-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "history-wiki",
                    "name": "History Test Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        response = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "history-wiki",
            "pages",
            "history-page",
            "history",
            method="GET",
        )

    assert response.code == 200
    body = json.loads(response.body)
    assert "history" in body
    assert len(body["history"]) == 2
    assert body["history"][0]["message"] == "Second commit"
    assert body["history"][1]["message"] == "First commit"


async def test_history_returns_404_for_unknown_wiki(jp_fetch):
    """GET history on an unregistered wiki returns 404."""
    response = await jp_fetch(
        "wikilab",
        "api",
        "wikis",
        "nonexistent-wiki",
        "pages",
        "some-page",
        "history",
        method="GET",
        raise_error=False,
    )
    assert response.code == 404


async def test_search_returns_matching_lines(jp_fetch, tmp_path):
    """GET /wikis/{id}/pages/search?term=... returns grep matches."""
    wiki_dir = tmp_path / "search-wiki"
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

    page_a = wiki_dir / "alpha.md"
    page_a.write_text("This is alpha content", encoding="utf-8")
    page_b = wiki_dir / "beta.md"
    page_b.write_text("This is beta content", encoding="utf-8")
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
        str(tmp_path / "wikis_search.json"),
    ):
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "search-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "search-wiki",
                    "name": "Search Test Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        response = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "search-wiki",
            "pages",
            "search",
            method="GET",
            params={"term": "alpha"},
        )

    assert response.code == 200
    body = json.loads(response.body)
    assert "results" in body
    assert len(body["results"]) >= 1
    assert "file" in body["results"][0]
    assert "content" in body["results"][0]


async def test_search_case_insensitive_by_default(jp_fetch, tmp_path):
    """Search is case-insensitive by default."""
    wiki_dir = tmp_path / "search-case-wiki"
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

    page = wiki_dir / "test.md"
    page.write_text("Hello World", encoding="utf-8")
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
        str(tmp_path / "wikis_search_case.json"),
    ):
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "search-case-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "search-case-wiki",
                    "name": "Search Case Test Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        response = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "search-case-wiki",
            "pages",
            "search",
            method="GET",
            params={"term": "hello"},
        )

    assert response.code == 200
    body = json.loads(response.body)
    assert "results" in body
    assert len(body["results"]) >= 1


async def test_backlinks_returns_matching_files(jp_fetch, tmp_path):
    """GET /wikis/{id}/pages/{slug}/backlinks returns files linking to the page."""
    wiki_dir = tmp_path / "backlink-wiki"
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

    # Create the target page
    target = wiki_dir / "target.md"
    target.write_text("This is the target page", encoding="utf-8")

    # Create a referencing page with [[target]] syntax
    referrer = wiki_dir / "referrer.md"
    referrer.write_text("See [[target]] for more info", encoding="utf-8")

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
        str(tmp_path / "wikis_backlink.json"),
    ):
        await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "backlink-wiki",
            method="POST",
            body=json.dumps(
                {
                    "id": "backlink-wiki",
                    "name": "Backlink Test Wiki",
                    "path": str(wiki_dir),
                }
            ),
        )

        response = await jp_fetch(
            "wikilab",
            "api",
            "wikis",
            "backlink-wiki",
            "pages",
            "target",
            "backlinks",
            method="GET",
        )

    assert response.code == 200
    body = json.loads(response.body)
    assert "backlinks" in body
    assert "referrer.md" in body["backlinks"]
