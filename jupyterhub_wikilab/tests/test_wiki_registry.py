import json
import tempfile
from pathlib import Path

from jupyterhub_wikilab.wiki_registry import (
    get_registry_path,
    load_registry,
    save_registry,
    validate_path_access,
    listwikis,
    addwiki,
    removewiki,
)


def test_registry_path_created():
    """Test that the registry path is created correctly."""
    registry_path = get_registry_path()
    assert str(registry_path).endswith(".jupyter/wikilab/wikis.json")
    assert registry_path.parent.exists() or registry_path.parent.parent.exists()


def test_add_list_delete_registry_entries():
    """Test that registry entries can be added, listed, and deleted."""
    # Create a temporary directory for testing
    with tempfile.TemporaryDirectory() as temp_dir:
        # Override the registry path to use temp dir
        import jupyterhub_wikilab.wiki_registry

        original_path = jupyterhub_wikilab.wiki_registry._REGISTRY_PATH
        test_path = Path(temp_dir) / "wikis.json"

        # Override the registry path for testing
        jupyterhub_wikilab.wiki_registry._REGISTRY_PATH = test_path

        try:
            # Test empty registry
            registry = load_registry()
            assert isinstance(registry, dict)
            assert len(registry) == 0

            # Test adding an entry using new API
            wiki_config = {"id": "wiki1", "path": "/path/to/wiki1"}
            addwiki("wiki1", wiki_config)

            # Reload and verify
            registry = load_registry()
            assert "wiki1" in registry
            assert registry["wiki1"]["id"] == "wiki1"
            assert registry["wiki1"]["path"] == "/path/to/wiki1"

            # Test listing entries
            all_wikis = listwikis()
            assert "wiki1" in all_wikis
            assert all_wikis["wiki1"]["id"] == "wiki1"

            # Test removing an entry
            removed = removewiki("wiki1")
            assert removed

            # Reload and verify
            registry = load_registry()
            assert "wiki1" not in registry
            assert len(registry) == 0

            # Test removing non-existent entry (should return False)
            removed = removewiki("nonexistent")
            assert not removed

        finally:
            # Restore original path
            jupyterhub_wikilab.wiki_registry._REGISTRY_PATH = original_path


def test_registration_path_validation():
    """Test path validation for wiki registration."""
    # Create a temporary directory for testing
    with tempfile.TemporaryDirectory() as temp_dir:
        test_path = Path(temp_dir)

        # Test with a valid directory
        assert validate_path_access(test_path)

        # Test with non-existent directory (should create it)
        nonexistent_path = test_path / "nonexistent"
        assert validate_path_access(nonexistent_path)
        assert nonexistent_path.exists()

        # Test with a file (should fail)
        test_file = test_path / "testfile.txt"
        test_file.touch()
        assert not validate_path_access(test_file)
