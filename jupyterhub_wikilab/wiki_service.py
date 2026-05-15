"""
Wiki service utilities for managing wiki pages and operations.
"""

import os
import re
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime

from .wiki_registry import listwikis, addwiki, removewiki, validate_path_access


class ConflictError(Exception):
    """Raised when a write conflicts with the current HEAD SHA.

    Attributes:
        base_content: The common ancestor content (from head_sha commit).
        their_content: The current on-disk content (from current HEAD).
    """

    def __init__(
        self,
        message: str,
        base_content: Optional[str] = None,
        their_content: Optional[str] = None,
    ):
        super().__init__(message)
        self.base_content = base_content
        self.their_content = their_content


def slugify(title: str) -> str:
    """
    Convert a title to a URL-friendly slug.

    Args:
        title: The title to slugify

    Returns:
        A URL-friendly slug
    """
    # Convert to lowercase
    slug = title.lower()
    # Replace spaces and non-alphanumeric characters with hyphens
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    # Remove leading/trailing hyphens
    slug = slug.strip("-")
    return slug


def get_wiki_path(wiki_id: str) -> Optional[Path]:
    """
    Get the path for a registered wiki.

    Args:
        wiki_id: The wiki ID

    Returns:
        Path to the wiki directory or None if not found
    """
    wikis = listwikis()
    if wiki_id in wikis:
        return Path(wikis[wiki_id]["path"])
    return None


def get_wiki_config(wiki_id: str) -> Optional[Dict[str, Any]]:
    """
    Get the configuration for a registered wiki.

    Args:
        wiki_id: The wiki ID

    Returns:
        Wiki configuration or None if not found
    """
    wikis = listwikis()
    if wiki_id in wikis:
        return wikis[wiki_id]
    return None


def create_wiki(wiki_id: str, name: str, path: str) -> bool:
    """
    Register a new wiki.

    Args:
        wiki_id: Unique identifier for the wiki
        name: Human-readable name for the wiki
        path: Filesystem path to the wiki

    Returns:
        True if registration was successful, False otherwise
    """
    # Validate path access
    path_obj = Path(path)
    if not validate_path_access(path_obj):
        return False

    # Create wiki config
    wiki_config = {"id": wiki_id, "name": name, "path": str(path_obj)}

    # Add to registry
    addwiki(wiki_id, wiki_config)
    return True


def remove_wiki(wiki_id: str) -> bool:
    """
    Remove a wiki from registration.

    Args:
        wiki_id: The wiki ID to remove

    Returns:
        True if removed successfully, False otherwise
    """
    return removewiki(wiki_id)


def list_wikis() -> Dict[str, Any]:
    """
    List all registered wikis.

    Returns:
        Dictionary of registered wikis
    """
    return listwikis()


def get_page_path(wiki_path: Path, slug: str) -> Path:
    """
    Get the filesystem path for a page in a wiki.

    Args:
        wiki_path: Path to the wiki directory
        slug: Page slug

    Returns:
        Path to the page file
    """
    return wiki_path / f"{slug}.md"


def list_pages(wiki_id: str) -> List[Dict[str, Any]]:
    """
    List all pages in a wiki.

    Args:
        wiki_id: The wiki ID

    Returns:
        List of page metadata
    """
    wiki_path = get_wiki_path(wiki_id)
    if not wiki_path:
        return []

    pages = []
    # Look for .md files in the wiki directory
    for md_file in wiki_path.glob("*.md"):
        if md_file.name == "_sidebar.md":
            continue  # Skip sidebar file for now

        # Get page title from filename
        title = md_file.stem.replace("-", " ").title()
        # Get last modified time
        mtime = datetime.fromtimestamp(md_file.stat().st_mtime)

        pages.append({"slug": md_file.stem, "title": title, "mtime": mtime.isoformat()})

    # Sort by title
    pages.sort(key=lambda x: x["title"])
    return pages


def get_page_content(wiki_id: str, slug: str) -> Optional[str]:
    """
    Get the content of a page.

    Args:
        wiki_id: The wiki ID
        slug: Page slug

    Returns:
        Page content or None if not found
    """
    wiki_path = get_wiki_path(wiki_id)
    if not wiki_path:
        return None

    page_path = get_page_path(wiki_path, slug)
    if not page_path.exists():
        return None

    try:
        with open(page_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        return None


def get_page_with_sha(wiki_id: str, slug: str) -> Optional[dict]:
    """
    Get page content and its current git commit SHA.

    Args:
        wiki_id: The wiki ID
        slug: Page slug

    Returns:
        Dict with 'content' and 'sha' keys, or None if page not found.
    """
    from .git_service import get_page_sha

    wiki_path = get_wiki_path(wiki_id)
    if not wiki_path:
        return None

    page_path = get_page_path(wiki_path, slug)
    if not page_path.exists():
        return None

    try:
        with open(page_path, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception:
        return None

    sha = get_page_sha(wiki_id, slug)

    return {"content": content, "sha": sha}


def save_page(
    wiki_id: str, slug: str, content: str, head_sha: Optional[str] = None
) -> bool:
    """
    Save a page to a wiki.

    Args:
        wiki_id: The wiki ID
        slug: Page slug
        content: Page content
        head_sha: Expected head SHA for conflict detection

    Returns:
        True if save was successful, False if head_sha did not match

    Raises:
        ConflictError: If head_sha was provided but did not match current HEAD
    """
    wiki_path = get_wiki_path(wiki_id)
    if not wiki_path:
        return False

    # Conflict detection: verify head_sha matches current HEAD if provided
    if head_sha:
        from .git_service import get_page_content_at_sha, get_page_sha

        current_sha = get_page_sha(wiki_id, slug)
        if current_sha and current_sha != head_sha:
            # Read base content (from the commit the user started editing)
            page_name = slug if slug.endswith(".md") else f"{slug}.md"
            base_content = get_page_content_at_sha(str(wiki_path), page_name, head_sha)
            # Read their content (current on-disk content)
            their_content = get_page_content(wiki_id, slug)
            raise ConflictError(
                f"Stale write detected: expected SHA {head_sha}, "
                f"current HEAD is {current_sha}",
                base_content=base_content,
                their_content=their_content,
            )

    page_path = get_page_path(wiki_path, slug)

    try:
        # Create directory if needed
        page_path.parent.mkdir(parents=True, exist_ok=True)

        # Write content
        with open(page_path, "w", encoding="utf-8") as f:
            f.write(content)
        return True
    except Exception:
        return False


def create_page(wiki_id: str, title: str, content: str) -> Optional[str]:
    """
    Create a new page in a wiki.

    Args:
        wiki_id: The wiki ID
        title: Page title
        content: Page content

    Returns:
        Slug of created page or None if failed
    """
    wiki_path = get_wiki_path(wiki_id)
    if not wiki_path:
        return None

    # Convert title to slug
    slug = slugify(title)

    # Create page content
    page_path = get_page_path(wiki_path, slug)

    try:
        # Create directory if needed
        page_path.parent.mkdir(parents=True, exist_ok=True)

        # Write content
        with open(page_path, "w", encoding="utf-8") as f:
            f.write(content)
        return slug
    except Exception:
        return None


def delete_page(wiki_id: str, slug: str) -> bool:
    """
    Delete a page from a wiki.

    Args:
        wiki_id: The wiki ID
        slug: Page slug

    Returns:
        True if deletion was successful, False otherwise
    """
    wiki_path = get_wiki_path(wiki_id)
    if not wiki_path:
        return False

    page_path = get_page_path(wiki_path, slug)
    if not page_path.exists():
        return False

    try:
        page_path.unlink()
        return True
    except Exception:
        return False


def rename_page(wiki_id: str, slug: str, new_title: str) -> bool:
    """
    Rename a page in a wiki.

    Args:
        wiki_id: The wiki ID
        slug: Current page slug
        new_title: New page title

    Returns:
        True if rename was successful, False otherwise
    """
    wiki_path = get_wiki_path(wiki_id)
    if not wiki_path:
        return False

    # Convert new title to slug
    new_slug = slugify(new_title)

    old_path = get_page_path(wiki_path, slug)
    new_path = get_page_path(wiki_path, new_slug)

    if not old_path.exists():
        return False

    try:
        # Rename file
        old_path.rename(new_path)
        return True
    except Exception:
        return False
