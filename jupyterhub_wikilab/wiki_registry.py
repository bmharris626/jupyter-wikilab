"""
Wiki registry utilities for managing wiki configurations.
"""

import json
import os
from pathlib import Path
from typing import Dict, Any

# Default registry path
_REGISTRY_PATH = Path.home() / ".jupyter" / "wikilab" / "wikis.json"


def get_registry_path() -> Path:
    """Get the path to the wiki registry file."""
    path = _REGISTRY_PATH
    if not isinstance(path, Path):
        path = Path(path)
    return path


def load_registry() -> Dict[str, Any]:
    """Load the wiki registry from disk."""
    registry_path = get_registry_path()

    # Create directory if it doesn't exist
    registry_path.parent.mkdir(parents=True, exist_ok=True)

    # Return empty dict if file doesn't exist
    if not registry_path.exists():
        return {}

    # Load existing registry
    try:
        with open(registry_path, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        # Return empty registry on error
        return {}


def save_registry(registry: Dict[str, Any]) -> None:
    """Save the wiki registry to disk."""
    registry_path = get_registry_path()

    # Create directory if it doesn't exist
    registry_path.parent.mkdir(parents=True, exist_ok=True)

    # Write registry to file
    try:
        with open(registry_path, "w") as f:
            json.dump(registry, f, indent=2)
    except OSError:
        # Re-raise on write error
        raise


def listwikis() -> Dict[str, Any]:
    """List all registered wikis."""
    return load_registry()


def addwiki(wiki_id: str, wiki_config: Dict[str, Any]) -> None:
    """Add a wiki to the registry."""
    registry = load_registry()
    registry[wiki_id] = wiki_config
    save_registry(registry)


def removewiki(wiki_id: str) -> bool:
    """Remove a wiki from the registry by wiki_id."""
    registry = load_registry()
    if wiki_id in registry:
        del registry[wiki_id]
        save_registry(registry)
        return True
    return False


def validate_path_access(path: Path) -> bool:
    """
    Validate that a path exists and is accessible for read/write operations.

    Args:
        path: Path to validate

    Returns:
        True if path is valid and accessible, False otherwise
    """
    try:
        # Check if path exists
        if not path.exists():
            # Try to create it
            path.mkdir(parents=True, exist_ok=True)
            return True

        # Check if it's a directory
        if not path.is_dir():
            return False

        # Try to create a temporary file to test write access
        test_file = path / ".write_test"
        try:
            test_file.touch()
            test_file.unlink()
            return True
        except (OSError, PermissionError):
            return False

    except (OSError, PermissionError):
        return False
