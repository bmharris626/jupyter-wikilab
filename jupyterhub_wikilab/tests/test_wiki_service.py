from pathlib import Path

import jupyterhub_wikilab.wiki_registry as wiki_registry
from jupyterhub_wikilab import wiki_service
from jupyterhub_wikilab.wiki_registry import validate_path_access


def test_wiki_registry_operations_through_service(tmp_path, monkeypatch):
    """Test listing, adding, and removing wiki registry entries."""
    monkeypatch.setattr(wiki_registry, "_REGISTRY_PATH", tmp_path / "wikis.json")
    wiki_path = tmp_path / "wiki"
    wiki_path.mkdir()

    assert wiki_service.list_wikis() == {}

    assert wiki_service.create_wiki("wiki1", "Test Wiki", str(wiki_path))
    assert wiki_service.list_wikis() == {
        "wiki1": {"id": "wiki1", "name": "Test Wiki", "path": str(wiki_path)}
    }
    assert wiki_service.get_wiki_config("wiki1") == {
        "id": "wiki1",
        "name": "Test Wiki",
        "path": str(wiki_path),
    }
    assert wiki_service.get_wiki_path("wiki1") == wiki_path

    assert wiki_service.remove_wiki("wiki1")
    assert wiki_service.list_wikis() == {}
    assert wiki_service.get_wiki_config("wiki1") is None
    assert wiki_service.get_wiki_path("wiki1") is None
    assert not wiki_service.remove_wiki("wiki1")


def test_registration_path_validation(tmp_path, monkeypatch):
    """Test path validation for valid directories, missing paths, and files."""
    monkeypatch.setattr(wiki_registry, "_REGISTRY_PATH", tmp_path / "wikis.json")

    existing_directory = tmp_path / "existing"
    existing_directory.mkdir()
    assert validate_path_access(existing_directory)

    new_directory = tmp_path / "created"
    assert validate_path_access(new_directory)
    assert new_directory.is_dir()

    file_path = tmp_path / "not-a-directory.md"
    file_path.write_text("content", encoding="utf-8")
    assert not validate_path_access(file_path)
    assert not wiki_service.create_wiki("invalid", "Invalid", str(file_path))
    assert wiki_service.list_wikis() == {}


def test_slugify_edge_cases():
    """Test deterministic title-to-slug conversion for common edge cases."""
    assert wiki_service.slugify("Test Page") == "test-page"
    assert wiki_service.slugify("  Multiple   Spaces  ") == "multiple-spaces"
    assert wiki_service.slugify("Symbols! @#$ Are Removed") == "symbols-are-removed"
    assert wiki_service.slugify("Mixed CASE Title") == "mixed-case-title"
    assert wiki_service.slugify("Already-slugified") == "already-slugified"
    assert wiki_service.slugify("Version 2.0 Notes") == "version-2-0-notes"
    assert wiki_service.slugify("---") == ""


def test_page_crud_filesystem(tmp_path, monkeypatch):
    """Test page create, read, update, delete, and rename filesystem behavior."""
    monkeypatch.setattr(wiki_registry, "_REGISTRY_PATH", tmp_path / "wikis.json")
    wiki_path = tmp_path / "wiki"
    wiki_path.mkdir()
    assert wiki_service.create_wiki("wiki1", "Test Wiki", str(wiki_path))

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


def test_page_crud_missing_wiki_and_page_failures(tmp_path, monkeypatch):
    """Test graceful failure values for missing wikis and pages."""
    monkeypatch.setattr(wiki_registry, "_REGISTRY_PATH", tmp_path / "wikis.json")
    wiki_path = tmp_path / "wiki"
    wiki_path.mkdir()
    assert wiki_service.create_wiki("wiki1", "Test Wiki", str(wiki_path))

    assert wiki_service.create_page("missing", "Title", "Content") is None
    assert wiki_service.get_page_content("missing", "title") is None
    assert not wiki_service.save_page("missing", "title", "Content")
    assert not wiki_service.delete_page("missing", "title")
    assert not wiki_service.rename_page("missing", "title", "New Title")

    assert wiki_service.get_page_content("wiki1", "missing") is None
    assert not wiki_service.delete_page("wiki1", "missing")
    assert not wiki_service.rename_page("wiki1", "missing", "New Title")


def test_list_pages_returns_metadata(tmp_path, monkeypatch):
    """Test page listing returns sorted metadata and skips sidebar files."""
    monkeypatch.setattr(wiki_registry, "_REGISTRY_PATH", tmp_path / "wikis.json")
    wiki_path = tmp_path / "wiki"
    wiki_path.mkdir()
    assert wiki_service.create_wiki("wiki1", "Test Wiki", str(wiki_path))

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


def test_get_page_path_appends_markdown_suffix():
    """Test conversion from wiki path and slug to markdown page path."""
    assert wiki_service.get_page_path(Path("/tmp/wiki"), "home") == Path(
        "/tmp/wiki/home.md"
    )
