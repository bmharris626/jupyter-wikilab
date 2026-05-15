"""
Test documentation links in quickstart.md.

Verifies that internal markdown links and file references resolve
to existing files.
"""

import re
from pathlib import Path

import pytest

DOCS_DIR = Path(__file__).resolve().parent.parent.parent / "docs"
QUICKSTART = DOCS_DIR / "quickstart.md"


@pytest.fixture
def quickstart_content():
    """Read the quickstart markdown file."""
    assert QUICKSTART.exists(), "quickstart.md not found"
    return QUICKSTART.read_text(encoding="utf-8")


def test_quickstart_file_exists():
    """Documentation file should exist."""
    assert QUICKSTART.exists()


def test_quickstart_has_content(quickstart_content):
    """Documentation should not be empty."""
    assert len(quickstart_content.strip()) > 100


def test_internal_links_resolve(quickstart_content):
    """Internal markdown links should resolve to existing files."""
    # Match markdown links like [Text](./other.md) or [Text](other.md)
    pattern = r"\]\(([^)\s]+\.md)\)"
    links = re.findall(pattern, quickstart_content)

    for link in links:
        # Resolve relative to the docs directory
        resolved = (DOCS_DIR / link).resolve()
        assert resolved.exists(), (
            f"Internal link '{link}' in quickstart.md does not resolve to "
            f"an existing file (resolved to: {resolved})"
        )


def test_no_broken_relative_links(quickstart_content):
    """All relative paths referenced in the document should exist."""
    # Match code block file paths like /path/to/something
    pattern = r"`/api/wikis/[^`]+`"
    # These are API paths, not file paths — skip

    # Match any [text](../path.md) links that escape the docs directory
    escape_pattern = r"\]\(\.\./([^)\s]+)\)"
    escape_links = re.findall(escape_pattern, quickstart_content)

    for link in escape_links:
        resolved = (DOCS_DIR.parent / link).resolve()
        assert resolved.exists(), (
            f"Escaped link '../{link}' in quickstart.md does not resolve "
            f"to an existing file"
        )


def test_quickstart_covers_key_sections(quickstart_content):
    """Quickstart should have sections for all key features."""
    required_sections = [
        "Registering a Wiki",
        "Creating a Page",
        "Editing a Page",
        "Searching Pages",
        "Page History",
    ]
    for section in required_sections:
        assert section in quickstart_content, (
            f"Quickstart is missing section: '{section}'"
        )
