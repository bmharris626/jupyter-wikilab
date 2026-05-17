"""
Wiki service utilities for managing wiki pages and operations.
"""

import json
import os
import re
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime

MARKER_FILE = ".wikilab"

# In-memory cache: wiki_id → absolute path string.
# Populated by probe_wiki() and init_wiki(); used by get_wiki_path().
_WIKI_CACHE: Dict[str, str] = {}


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
    """Convert a title to a URL-friendly slug."""
    slug = title.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return slug


def _get_server_root() -> str:
    """Return the Jupyter server root directory."""
    return (
        os.environ.get("JUPYTER_SERVER_ROOT")
        or os.environ.get("JUPYTERHUB_USER_DIR")
        or os.path.expanduser("~")
    )


def _read_marker(path: Path) -> Optional[dict]:
    """Read and parse .wikilab JSON; return None on any error."""
    try:
        return json.loads((path / MARKER_FILE).read_text(encoding="utf-8"))
    except Exception:
        return None


def _fallback_scan(wiki_id: str) -> Optional[str]:
    """Walk the server root looking for a .wikilab whose 'id' matches wiki_id.

    Primes the cache on hit. Only called on a cache miss.
    """
    server_root = _get_server_root()
    try:
        for marker_path in Path(server_root).rglob(MARKER_FILE):
            try:
                data = json.loads(marker_path.read_text(encoding="utf-8"))
                if data.get("id") == wiki_id:
                    candidate = str(marker_path.parent)
                    _WIKI_CACHE[wiki_id] = candidate
                    return candidate
            except Exception:
                continue
    except Exception:
        pass
    return None


def _ensure_gitignore(path: Path) -> None:
    """Append .wikilab to .gitignore if not already present."""
    gi = path / ".gitignore"
    existing = gi.read_text(encoding="utf-8") if gi.exists() else ""
    if MARKER_FILE not in existing:
        with gi.open("a", encoding="utf-8") as f:
            if existing and not existing.endswith("\n"):
                f.write("\n")
            f.write(f"{MARKER_FILE}\n")


def probe_wiki(path: Path) -> Optional[dict]:
    """Check path for .wikilab + .git; if found prime the cache and return wiki info."""
    marker = _read_marker(path)
    if not marker:
        return None
    if not (path / ".git").exists():
        return None
    wiki_id = marker.get("id")
    name = marker.get("name", wiki_id)
    if not wiki_id:
        return None
    _WIKI_CACHE[wiki_id] = str(path)
    return {"id": wiki_id, "name": name, "path": str(path)}


def init_wiki(path: Path, name: str) -> dict:
    """Create .wikilab, ensure git repo exists, update .gitignore, prime cache."""
    import uuid
    from .git_service import detect_or_init_repo

    if not path.is_dir():
        raise ValueError(f"Not a directory: {path}")
    wiki_id = str(uuid.uuid4())
    marker = {"id": wiki_id, "name": name}
    (path / MARKER_FILE).write_text(json.dumps(marker, indent=2), encoding="utf-8")
    detect_or_init_repo(str(path), init_if_missing=True)
    _ensure_gitignore(path)
    _WIKI_CACHE[wiki_id] = str(path)
    return {"id": wiki_id, "name": name, "path": str(path)}


def get_wiki_path(wiki_id: str) -> Optional[Path]:
    """Get the path for a wiki by its ID (cache → fallback scan)."""
    path_str = _WIKI_CACHE.get(wiki_id)
    if path_str is None:
        path_str = _fallback_scan(wiki_id)
    return Path(path_str) if path_str else None


def get_wiki_config(wiki_id: str) -> Optional[Dict[str, Any]]:
    """Get name and path for a wiki by reading its marker file."""
    path = get_wiki_path(wiki_id)
    if path is None:
        return None
    marker = _read_marker(path)
    if not marker:
        return None
    return {"id": wiki_id, "name": marker.get("name", wiki_id), "path": str(path)}


def get_page_path(wiki_path: Path, slug: str) -> Path:
    """Get the filesystem path for a page in a wiki."""
    return wiki_path / f"{slug}.md"


def list_pages(wiki_id: str) -> List[Dict[str, Any]]:
    """List all pages in a wiki, including pages inside subdirectories."""
    wiki_path = get_wiki_path(wiki_id)
    if not wiki_path:
        return []

    pages = []
    for md_file in sorted(wiki_path.rglob("*.md")):
        if md_file.name == "_sidebar.md":
            continue
        rel = md_file.relative_to(wiki_path)
        if any(part.startswith(".") for part in rel.parts[:-1]):
            continue

        slug = str(rel).replace("\\", "/")[: -len(".md")]
        title = md_file.stem.replace("-", " ").title()
        mtime = datetime.fromtimestamp(md_file.stat().st_mtime)

        pages.append({"slug": slug, "title": title, "mtime": mtime.isoformat()})

    pages.sort(key=lambda x: x["slug"])
    return pages


def get_page_content(wiki_id: str, slug: str) -> Optional[str]:
    """Get the content of a page."""
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
    """Get page content and its current git commit SHA."""
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
    """Save a page to a wiki and auto-commit the change."""
    wiki_path = get_wiki_path(wiki_id)
    if not wiki_path:
        return False

    if head_sha:
        from .git_service import get_page_content_at_sha, get_page_sha

        current_sha = get_page_sha(wiki_id, slug)
        if current_sha and current_sha != head_sha:
            page_name = slug if slug.endswith(".md") else f"{slug}.md"
            base_content = get_page_content_at_sha(str(wiki_path), page_name, head_sha)
            their_content = get_page_content(wiki_id, slug)
            raise ConflictError(
                f"Stale write detected: expected SHA {head_sha}, "
                f"current HEAD is {current_sha}",
                base_content=base_content,
                their_content=their_content,
            )

    page_path = get_page_path(wiki_path, slug)

    try:
        page_path.parent.mkdir(parents=True, exist_ok=True)
        with open(page_path, "w", encoding="utf-8") as f:
            f.write(content)
    except Exception:
        return False

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
    """Create a new page in a wiki and auto-commit it to git."""
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
    """Delete a page from a wiki, stage the removal in git, and commit."""
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
    """Rename a page in a wiki using git mv semantics and commit the change."""
    wiki_path = get_wiki_path(wiki_id)
    if not wiki_path:
        return False

    name_slug = slugify(new_title)
    if "/" in slug:
        folder_prefix = slug.rsplit("/", 1)[0]
        new_slug = f"{folder_prefix}/{name_slug}"
    else:
        new_slug = name_slug

    old_page = f"{slug}.md"
    new_page = f"{new_slug}.md"

    from .git_service import rename_wiki_page

    return rename_wiki_page(wiki_id, old_page, new_page, user=user)
