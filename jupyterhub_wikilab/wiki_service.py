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
    List all pages in a wiki, including pages inside subdirectories.

    Args:
        wiki_id: The wiki ID

    Returns:
        List of page metadata; slugs use forward-slash separators for nested pages
        (e.g. ``"guides/setup"`` for ``wiki_path/guides/setup.md``).
    """
    wiki_path = get_wiki_path(wiki_id)
    if not wiki_path:
        return []

    pages = []
    for md_file in sorted(wiki_path.rglob("*.md")):
        if md_file.name == "_sidebar.md":
            continue

        rel = md_file.relative_to(wiki_path)
        # Always use forward slashes regardless of OS
        slug = str(rel).replace("\\", "/")[: -len(".md")]
        title = md_file.stem.replace("-", " ").title()
        mtime = datetime.fromtimestamp(md_file.stat().st_mtime)

        pages.append({"slug": slug, "title": title, "mtime": mtime.isoformat()})

    pages.sort(key=lambda x: x["slug"])
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
    wiki_id: str,
    slug: str,
    content: str,
    head_sha: Optional[str] = None,
    user: Optional[str] = None,
) -> bool:
    """
    Save a page to a wiki and auto-commit the change.

    Args:
        wiki_id: The wiki ID
        slug: Page slug
        content: Page content
        head_sha: Expected head SHA for conflict detection
        user: Username for the git committer (defaults to ``JUPYTERHUB_USER``).

    Returns:
        True if save and commit were successful, False if head_sha did not match
        or commit failed.

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
    except Exception:
        return False

    # Auto-commit the change (Gap 1 + Gap 2)
    from .git_service import commit_wiki_page, get_default_email

    email = get_default_email(user)
    return commit_wiki_page(wiki_id, slug, user=user, email=email)


def create_page(
    wiki_id: str,
    title: str,
    content: str,
    user: Optional[str] = None,
    folder: Optional[str] = None,
) -> Optional[str]:
    """
    Create a new page in a wiki and auto-commit it to git.

    Args:
        wiki_id: The wiki ID
        title: Page title
        content: Page content
        user: Username for the git committer (defaults to ``JUPYTERHUB_USER``).
        folder: Optional relative folder path (e.g. ``"guides"`` or
                ``"guides/tutorials"``).  The page is created inside this
                subdirectory.  Forward slashes only; must not start or end
                with a slash.

    Returns:
        Slug of created page or None if failed
    """
    wiki_path = get_wiki_path(wiki_id)
    if not wiki_path:
        return None

    name_slug = slugify(title)
    if folder:
        clean_folder = folder.strip("/").replace("\\", "/")
        slug = f"{clean_folder}/{name_slug}"
    else:
        slug = name_slug
    page_path = get_page_path(wiki_path, slug)

    try:
        page_path.parent.mkdir(parents=True, exist_ok=True)
        with open(page_path, "w", encoding="utf-8") as f:
            f.write(content)
    except Exception:
        return None

    from .git_service import commit_wiki_page, get_default_email

    email = get_default_email(user)
    committed = commit_wiki_page(wiki_id, slug, user=user, email=email, verb="Add")
    return slug if committed else None


def delete_page(
    wiki_id: str,
    slug: str,
    user: Optional[str] = None,
) -> bool:
    """
    Delete a page from a wiki, stage the removal in git, and commit.

    Args:
        wiki_id: The wiki ID
        slug: Page slug
        user: Username for the git committer (defaults to ``JUPYTERHUB_USER``).

    Returns:
        True if deletion and commit were successful, False otherwise
    """
    wiki_path = get_wiki_path(wiki_id)
    if not wiki_path:
        return False

    page_path = get_page_path(wiki_path, slug)
    if not page_path.exists():
        return False

    from .git_service import (
        detect_or_init_repo,
        get_default_email,
        _build_commit_message,
    )
    import os as _os
    from git import Repo, Actor

    try:
        detect_or_init_repo(str(wiki_path), init_if_missing=True)
        repo = Repo(wiki_path)

        page_name = f"{slug}.md"
        tracked = page_name in {entry[0] for entry in repo.index.entries.keys()}

        if tracked:
            repo.index.remove([str(page_path)], working_tree=True)
        else:
            page_path.unlink()

        actor_name = user or _os.environ.get("JUPYTERHUB_USER", "wikilab")
        email = get_default_email(user)
        actor = Actor(actor_name, email)
        commit_message = _build_commit_message("Delete", slug, actor_name, email)
        repo.index.commit(commit_message, author=actor, committer=actor)
        return True
    except Exception:
        return False


def rename_page(
    wiki_id: str, slug: str, new_title: str, user: Optional[str] = None
) -> bool:
    """
    Rename a page in a wiki using ``git mv`` semantics and commit the change.

    Args:
        wiki_id: The wiki ID
        slug: Current page slug
        new_title: New page title
        user: Username for the git committer (defaults to ``JUPYTERHUB_USER``).

    Returns:
        True if rename and commit were successful, False otherwise
    """
    wiki_path = get_wiki_path(wiki_id)
    if not wiki_path:
        return False

    # Preserve folder prefix: only the filename component is re-slugified.
    name_slug = slugify(new_title)
    if "/" in slug:
        folder_prefix = slug.rsplit("/", 1)[0]
        new_slug = f"{folder_prefix}/{name_slug}"
    else:
        new_slug = name_slug

    old_page = f"{slug}.md"
    new_page = f"{new_slug}.md"

    # Use git service for rename with git mv + commit
    from .git_service import rename_wiki_page

    return rename_wiki_page(wiki_id, old_page, new_page, user=user)
