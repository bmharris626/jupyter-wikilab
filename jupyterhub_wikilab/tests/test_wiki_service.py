from pathlib import Path

from jupyterhub_wikilab import wiki_service
from jupyterhub_wikilab.wiki_service import MARKER_FILE


def test_slugify_edge_cases():
    """Test deterministic title-to-slug conversion for common edge cases."""
    assert wiki_service.slugify("Test Page") == "test-page"
    assert wiki_service.slugify("  Multiple   Spaces  ") == "multiple-spaces"
    assert wiki_service.slugify("Symbols! @#$ Are Removed") == "symbols-are-removed"
    assert wiki_service.slugify("Mixed CASE Title") == "mixed-case-title"
    assert wiki_service.slugify("Already-slugified") == "already-slugified"
    assert wiki_service.slugify("Version 2.0 Notes") == "version-2-0-notes"
    assert wiki_service.slugify("---") == ""
    # .md suffix is stripped before slugification
    assert wiki_service.slugify("index.md") == "index"
    assert wiki_service.slugify("My Page.md") == "my-page"
    assert wiki_service.slugify("README.MD") == "readme"


def test_get_page_path_appends_markdown_suffix():
    """Test conversion from wiki path and slug to markdown page path."""
    assert wiki_service.get_page_path(Path("/tmp/wiki"), "home") == Path(
        "/tmp/wiki/home.md"
    )


def test_probe_wiki_returns_info(tmp_path):
    """probe_wiki returns wiki info when .wikilab and .git are both present."""
    import json, subprocess

    wiki_path = tmp_path / "mywiki"
    wiki_path.mkdir()
    (wiki_path / MARKER_FILE).write_text(
        json.dumps({"id": "test-id", "name": "Test"}), encoding="utf-8"
    )
    subprocess.run(["git", "init"], cwd=wiki_path, check=True, capture_output=True)

    result = wiki_service.probe_wiki(wiki_path)
    assert result is not None
    assert result["id"] == "test-id"
    assert result["name"] == "Test"
    assert result["path"] == str(wiki_path)
    assert wiki_service._WIKI_CACHE.get("test-id") == str(wiki_path)

    # cleanup
    wiki_service._WIKI_CACHE.pop("test-id", None)


def test_probe_wiki_missing_git(tmp_path):
    """probe_wiki returns None when .git is absent."""
    import json

    wiki_path = tmp_path / "mywiki"
    wiki_path.mkdir()
    (wiki_path / MARKER_FILE).write_text(
        json.dumps({"id": "test-id", "name": "Test"}), encoding="utf-8"
    )
    assert wiki_service.probe_wiki(wiki_path) is None


def test_probe_wiki_missing_marker(tmp_path):
    """probe_wiki returns None when .wikilab is absent."""
    import subprocess

    wiki_path = tmp_path / "mywiki"
    wiki_path.mkdir()
    subprocess.run(["git", "init"], cwd=wiki_path, check=True, capture_output=True)
    assert wiki_service.probe_wiki(wiki_path) is None


def test_init_wiki_creates_marker_and_gitignore(tmp_path):
    """init_wiki creates .wikilab, .git, .gitignore and primes the cache."""
    wiki_path = tmp_path / "newwiki"
    wiki_path.mkdir()

    result = wiki_service.init_wiki(wiki_path, "New Wiki")
    assert result["name"] == "New Wiki"
    assert result["path"] == str(wiki_path)
    wiki_id = result["id"]
    assert (wiki_path / MARKER_FILE).exists()
    assert (wiki_path / ".git").exists()
    gi = (wiki_path / ".gitignore").read_text(encoding="utf-8")
    assert MARKER_FILE in gi
    assert wiki_service._WIKI_CACHE.get(wiki_id) == str(wiki_path)

    # cleanup
    wiki_service._WIKI_CACHE.pop(wiki_id, None)


def test_get_wiki_path_via_cache(tmp_path, make_wiki):
    """get_wiki_path resolves from the in-memory cache."""
    wiki_path = make_wiki("cache-wiki")
    resolved = wiki_service.get_wiki_path("cache-wiki")
    assert resolved == wiki_path


def test_get_wiki_path_cache_miss_returns_none():
    """get_wiki_path returns None for an unknown wiki_id with no scan hit."""
    # This won't scan because the id is clearly not present anywhere
    result = wiki_service.get_wiki_path("definitely-does-not-exist-xyz-abc-12345")
    assert result is None


def test_page_crud_filesystem(make_wiki):
    """Test page create, read, update, delete, and rename filesystem behavior."""
    wiki_path = make_wiki("wiki1")

    slug = wiki_service.create_page("wiki1", "My First Page", "Initial content")
    assert slug == "my-first-page"
    page_path = wiki_path / "my-first-page.md"
    assert page_path.read_text(encoding="utf-8") == "Initial content"
    assert wiki_service.get_page_content("wiki1", slug) == "Initial content"

    assert wiki_service.save_page("wiki1", slug, "Updated content")
    assert wiki_service.get_page_content("wiki1", slug) == "Updated content"

    assert wiki_service.rename_page("wiki1", slug, "Renamed Page")
    renamed_slug = "renamed-page"
    assert not page_path.exists()
    assert (wiki_path / "renamed-page.md").read_text(
        encoding="utf-8"
    ) == "Updated content"
    assert wiki_service.get_page_content("wiki1", slug) is None
    assert wiki_service.get_page_content("wiki1", renamed_slug) == "Updated content"

    assert wiki_service.delete_page("wiki1", renamed_slug)
    assert not (wiki_path / "renamed-page.md").exists()
    assert wiki_service.get_page_content("wiki1", renamed_slug) is None


def test_page_crud_missing_wiki_and_page_failures(make_wiki):
    """Test graceful failure values for missing wikis and pages."""
    make_wiki("wiki1")

    assert wiki_service.create_page("missing", "Title", "Content") is None
    assert wiki_service.get_page_content("missing", "title") is None
    assert not wiki_service.save_page("missing", "title", "Content")
    assert not wiki_service.delete_page("missing", "title")
    assert not wiki_service.rename_page("missing", "title", "New Title")

    assert wiki_service.get_page_content("wiki1", "missing") is None
    assert not wiki_service.delete_page("wiki1", "missing")
    assert not wiki_service.rename_page("wiki1", "missing", "New Title")


def test_list_pages_returns_metadata(make_wiki):
    """Test page listing returns sorted metadata and skips sidebar files."""
    wiki_path = make_wiki("wiki1")

    (wiki_path / "z-page.md").write_text("Z content", encoding="utf-8")
    (wiki_path / "a-page.md").write_text("A content", encoding="utf-8")
    (wiki_path / "_sidebar.md").write_text("Sidebar", encoding="utf-8")
    (wiki_path / "notes.txt").write_text("Not markdown", encoding="utf-8")

    pages = wiki_service.list_pages("wiki1")

    assert [page["slug"] for page in pages] == ["a-page", "z-page"]
    assert [page["title"] for page in pages] == ["A Page", "Z Page"]
    assert all(isinstance(page["mtime"], str) for page in pages)
    assert all(set(page) == {"slug", "title", "mtime"} for page in pages)
    assert wiki_service.list_pages("missing") == []
