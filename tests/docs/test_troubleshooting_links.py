"""
Test documentation links in troubleshooting.md.

Verifies that internal markdown links and file references resolve
to existing files.
"""

import re
from pathlib import Path

import pytest

DOCS_DIR = Path(__file__).resolve().parent.parent.parent / "docs"
TROUBLESHOOTING = DOCS_DIR / "troubleshooting.md"


@pytest.fixture
def troubleshooting_content():
    """Read the troubleshooting markdown file."""
    assert TROUBLESHOOTING.exists(), "troubleshooting.md not found"
    return TROUBLESHOOTING.read_text(encoding="utf-8")


def test_troubleshooting_file_exists():
    """Documentation file should exist."""
    assert TROUBLESHOOTING.exists()


def test_troubleshooting_has_content(troubleshooting_content):
    """Documentation should not be empty."""
    assert len(troubleshooting_content.strip()) > 100


def test_internal_links_resolve(troubleshooting_content):
    """Internal markdown links should resolve to existing files."""
    pattern = r"\]\(([^)\s]+\.md)\)"
    links = re.findall(pattern, troubleshooting_content)

    for link in links:
        resolved = (DOCS_DIR / link).resolve()
        assert resolved.exists(), (
            f"Internal link '{link}' in troubleshooting.md does not resolve "
            f"to an existing file (resolved to: {resolved})"
        )


def test_no_broken_relative_links(troubleshooting_content):
    """All relative paths referenced in the document should exist."""
    # Match any [text](../path.md) links that escape the docs directory
    escape_pattern = r"\]\(\.\./([^)\s]+)\)"
    escape_links = re.findall(escape_pattern, troubleshooting_content)

    for link in escape_links:
        resolved = (DOCS_DIR.parent / link).resolve()
        assert resolved.exists(), (
            f"Escaped link '../{link}' in troubleshooting.md does not "
            f"resolve to an existing file"
        )


def test_troubleshooting_covers_key_sections(troubleshooting_content):
    """Troubleshooting should cover identity, conflicts, and sync issues."""
    required_sections = [
        "Identity and Authentication",
        "Conflict Resolution",
        "Remote Sync Errors",
    ]
    for section in required_sections:
        assert section in troubleshooting_content, (
            f"Troubleshooting is missing section: '{section}'"
        )
