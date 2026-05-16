"""
Git service utilities for managing wiki repositories.
"""

import os
import subprocess
from pathlib import Path
from typing import Dict, List, Optional

from git import Repo, InvalidGitRepositoryError, Actor
from git.exc import NoSuchPathError
from .wiki_service import get_wiki_path


def get_git_repo(wiki_id: str) -> Optional[Repo]:
    """
    Return the Git repository for a registered wiki.

    Args:
        wiki_id: The wiki ID

    Returns:
        Repo instance or None if the wiki is missing or not a Git repository
    """
    wiki_path = get_wiki_path(wiki_id)
    if wiki_path is None:
        return None

    try:
        return Repo(wiki_path)
    except InvalidGitRepositoryError:
        return None


def init_wiki_git(wiki_id: str) -> bool:
    """
    Initialize Git for a registered wiki if needed.

    Args:
        wiki_id: The wiki ID

    Returns:
        True if repository exists or was initialized, False otherwise
    """
    wiki_path = get_wiki_path(wiki_id)
    if wiki_path is None:
        return False

    return detect_or_init_repo(str(wiki_path), init_if_missing=True)


def detect_or_init_repo(wiki_path: str, init_if_missing: bool = True) -> bool:
    """
    Detect if a directory is a Git repository and optionally initialize it.

    Args:
        wiki_path: Path to the wiki directory
        init_if_missing: Whether to initialize the repo if not found

    Returns:
        True if repository exists or was initialized successfully, False otherwise
    """
    try:
        repo = Repo(wiki_path)
        return True
    except (InvalidGitRepositoryError, NoSuchPathError):
        if init_if_missing:
            try:
                Path(wiki_path).mkdir(parents=True, exist_ok=True)
                Repo.init(wiki_path)
                return True
            except Exception:
                return False
        return False


class CommitActor(Actor):
    """
    Commit actor that supports both attribute and subscript access.

    Inherits from gitpython's :class:`git.Actor` and additionally supports
    dict-like access (e.g., ``actor["name"]``).
    """

    def __getitem__(self, key: str) -> str:
        if key in ("name", "email"):
            return getattr(self, key)
        raise KeyError(key)

    def __repr__(self) -> str:
        return f"{self.name} <{self.email}>"


def get_default_email(username: Optional[str] = None) -> str:
    """
    Derive the default committer email for a user.

    Falls back to ``{username}@wikilab`` or ``wikilab@example.com``.

    Args:
        username: The username to embed in the email. Defaults to
                  ``JUPYTERHUB_USER`` environment variable, then ``"wikilab"``.

    Returns:
        Email address suitable for git commits.
    """
    name = username or os.environ.get("JUPYTERHUB_USER", "wikilab")
    return f"{name}@wikilab"


def construct_commit_actor(
    email: Optional[str] = None, username: Optional[str] = None
) -> CommitActor:
    """
    Construct a commit actor from JUPYTERHUB_USER and configured email.

    Args:
        email: Email address for the commit. If omitted, uses the default
               derived from ``JUPYTERHUB_USER``.
        username: Username for the actor name. Defaults to
                  ``JUPYTERHUB_USER`` environment variable.

    Returns:
        CommitActor object for the commit
    """
    name = username or os.environ.get("JUPYTERHUB_USER", "wikilab")
    return CommitActor(name, email or get_default_email(username))


def commit_page_update(
    wiki_path: str,
    slug: str,
    user: str,
    message_template: str = "Update page: {slug}",
    committer_email: Optional[str] = None,
) -> bool:
    """
    Commit page updates with standard message template.

    Args:
        wiki_path: Path to the wiki directory
        slug: Slug of the page being updated
        user: User making the update
        message_template: Template for commit message
        committer_email: Explicit email for the committer; falls back to
                         :func:`get_default_email` when omitted.

    Returns:
        True if commit was successful, False otherwise
    """
    try:
        # Get the repository
        repo = Repo(wiki_path)

        # Create the page path
        page_name = slug if slug.endswith(".md") else f"{slug}.md"
        page_path = Path(wiki_path) / page_name

        # Add the file to the index
        repo.index.add([str(page_path)])

        # Create the commit actor, honouring explicit committer_email
        actor = construct_commit_actor(committer_email, username=user)
        commit_message = message_template.format(slug=slug)

        # Commit with the actor information
        repo.index.commit(commit_message, author=actor, committer=actor)

        return True
    except Exception:
        return False


def commit_wiki_page(
    wiki_id: str,
    slug: str,
    user: Optional[str] = None,
    email: str = "wikilab@example.com",
    message_template: str = "Update page: {slug}",
) -> bool:
    """
    Commit a page update in a registered wiki.

    Initialises the git repository for the wiki if it does not already exist.

    Args:
        wiki_id: The wiki ID
        slug: Page slug or markdown filename
        user: User making the update; defaults to JUPYTERHUB_USER
        email: Committer email address
        message_template: Template for commit message

    Returns:
        True if commit was successful, False otherwise
    """
    wiki_path = get_wiki_path(wiki_id)
    if wiki_path is None:
        return False

    try:
        # Ensure the directory is a git repo
        if not detect_or_init_repo(str(wiki_path), init_if_missing=True):
            return False

        repo = Repo(wiki_path)
        page_name = slug if slug.endswith(".md") else f"{slug}.md"
        page_path = wiki_path / page_name
        if not page_path.exists():
            return False

        repo.index.add([str(page_path)])
        if not repo.is_dirty(index=True, working_tree=False):
            return True

        actor_name = user or os.environ.get("JUPYTERHUB_USER", "wikilab")
        actor = Actor(actor_name, email)
        repo.index.commit(
            message_template.format(slug=Path(page_name).stem),
            author=actor,
            committer=actor,
        )
        return True
    except Exception:
        return False


def get_file_history(wiki_path: str, file_path: str) -> List[Dict]:
    """
    Return commit log entries for a wiki page path.

    Args:
        wiki_path: Path to the wiki directory
        file_path: Path to the file within the wiki

    Returns:
        List of commit log entries
    """
    try:
        repo = Repo(wiki_path)
        # Get history for the specific file
        commits = list(repo.iter_commits(paths=file_path))

        # Format commit information
        history = []
        for commit in commits:
            history.append(
                {
                    "sha": commit.hexsha,
                    "message": commit.message.strip(),
                    "author": commit.author.name,
                    "author_email": commit.author.email,
                    "date": commit.committed_datetime.isoformat(),
                }
            )
        return history
    except Exception:
        return []


def get_page_content_at_sha(wiki_path: str, file_path: str, sha: str) -> Optional[str]:
    """
    Return the content of a file at a specific git commit SHA.

    Args:
        wiki_path: Path to the wiki directory
        file_path: Path to the file within the wiki (e.g. 'home.md')
        sha: Git commit SHA (full or abbreviated)

    Returns:
        File content string, or None if the file does not exist at that SHA
    """
    try:
        repo = Repo(wiki_path)
        # Resolve the commit
        commit = repo.commit(sha)
        # Get the blob content from the tree at that commit
        tree = commit.tree
        blob = tree[file_path]
        return blob.data_stream.read().decode("utf-8")
    except Exception:
        return None


def get_page_sha(wiki_id: str, slug: str) -> str:
    """
    Get the latest commit SHA for a wiki page.

    Args:
        wiki_id: The wiki ID
        slug: Page slug (without .md extension)

    Returns:
        Commit hex SHA string, or empty string if page has no commit history
    """
    try:
        repo = get_git_repo(wiki_id)
        if repo is None:
            return ""

        page_name = slug if slug.endswith(".md") else f"{slug}.md"

        # Get commits that touched this specific page file
        commits = list(repo.iter_commits(paths=page_name, max_count=1))
        if commits:
            return commits[0].hexsha
        return ""
    except Exception:
        return ""


def search_grep_results(
    wiki_path: str, search_term: str, case_sensitive: bool = False
) -> List[Dict]:
    """
    Wrap git grep -n -i and parse to structured search results.

    Args:
        wiki_path: Path to the wiki directory
        search_term: Term to search for
        case_sensitive: Whether the search should be case-sensitive

    Returns:
        List of structured search results
    """
    try:
        # Build the git grep command
        cmd = ["git", "grep", "-n"]
        if not case_sensitive:
            cmd.append("-i")
        cmd.extend([search_term, "--", "."])

        # Run the command
        result = subprocess.run(
            cmd, cwd=wiki_path, capture_output=True, text=True, check=True
        )

        # Parse results
        results = []
        for line in result.stdout.splitlines():
            if ":" in line:
                file_path, line_number, content = line.split(":", 2)
                results.append(
                    {
                        "file": file_path,
                        "line": int(line_number),
                        "content": content.strip(),
                    }
                )

        return results
    except subprocess.CalledProcessError:
        return []


def backlinks_grep_results(wiki_path: str, file_path: str) -> List[str]:
    """
    Wrap git grep -l for backlink discovery.

    Args:
        wiki_path: Path to the wiki directory
        file_path: Path to the file to find backlinks for

    Returns:
        List of files that link to the given file
    """
    try:
        # Get the filename without extension
        filename = Path(file_path).stem

        # Build the git grep command to find links to this file
        cmd = ["git", "grep", "-l", f"\\[\\[{filename}\\]\\]", "--", "."]

        # Run the command
        result = subprocess.run(
            cmd, cwd=wiki_path, capture_output=True, text=True, check=True
        )

        # Parse results
        files = []
        for line in result.stdout.splitlines():
            files.append(line.strip())

        return files
    except subprocess.CalledProcessError:
        return []


def get_remote_status_pull_push_wrappers(wiki_path: str) -> Dict:
    """
    Get remote status and provide pull/push methods.

    Args:
        wiki_path: Path to the wiki directory

    Returns:
        Dictionary with status information and operations
    """
    try:
        repo = Repo(wiki_path)

        # Get status information
        status = {
            "branch": repo.active_branch.name if repo.active_branch else "unknown",
            "ahead": 0,
            "behind": 0,
            "dirty": repo.is_dirty(),
            "untracked": len(repo.untracked_files),
        }

        # Get ahead/behind status if there's a remote
        try:
            # Check for remote tracking
            if repo.heads and len(repo.heads) > 0 and repo.heads[0].tracking_branch():
                tracking_branch = repo.heads[0].tracking_branch()
                status["ahead"] = len(
                    list(repo.iter_commits(f"{tracking_branch}..HEAD"))
                )
                status["behind"] = len(
                    list(repo.iter_commits(f"HEAD..{tracking_branch}"))
                )
        except Exception:
            pass

        return status
    except Exception as e:
        return {"error": f"Failed to get repository status: {str(e)}"}


def rename_wiki_page(
    wiki_id: str,
    old_name: str,
    new_name: str,
    user: Optional[str] = None,
    email: Optional[str] = None,
) -> bool:
    """
    Rename a page using git-aware semantics and commit the change.

    If the old file is tracked in git, uses ``git mv``.  Otherwise performs a
    filesystem rename and stages the add + delete manually so the commit still
    reflects a rename.

    Args:
        wiki_id: The wiki ID.
        old_name: Existing page name (e.g. ``"old-page.md"``).
        new_name: New page name (e.g. ``"new-page.md"``).
        user: Username for the git committer.
        email: Email for the git committer.

    Returns:
        True if rename and commit were successful, False otherwise.
    """
    wiki_path = get_wiki_path(wiki_id)
    if wiki_path is None:
        return False

    # Ensure the directory is a git repo
    if not detect_or_init_repo(str(wiki_path), init_if_missing=True):
        return False

    try:
        repo = Repo(wiki_path)

        old_path = wiki_path / old_name
        new_path = wiki_path / new_name

        if not old_path.exists():
            return False

        # Determine if the old file is already tracked in git
        tracked = str(old_path) in {k[0] for k in repo.index.entries.keys()}

        if tracked:
            # Use git mv for tracked files (preserves rename in history)
            subprocess.run(
                ["git", "mv", str(old_path), str(new_path)],
                cwd=str(wiki_path),
                check=True,
                capture_output=True,
                text=True,
            )
        else:
            # Untracked: filesystem rename + manual staging (add new, skip
            # remove since old_path is not in the index)
            old_path.rename(new_path)
            repo.index.add([str(new_path)])

        # Commit the rename
        actor_name = user or os.environ.get("JUPYTERHUB_USER", "wikilab")
        actor = Actor(actor_name, email or get_default_email(user))
        repo.index.commit(
            f"Rename page: {old_name} to {new_name}",
            author=actor,
            committer=actor,
        )
        return True
    except Exception:
        return False


def get_wiki_git_status(wiki_id: str) -> Dict:
    """
    Get Git status for a registered wiki.

    Args:
        wiki_id: The wiki ID

    Returns:
        Dictionary with repository status, or an error dictionary
    """
    wiki_path = get_wiki_path(wiki_id)
    if wiki_path is None:
        return {"error": "Wiki not found"}

    return get_remote_status_pull_push_wrappers(str(wiki_path))


def git_pull_wiki(wiki_id: str) -> bool:
    """
    Pull updates from the default remote for a registered wiki.

    Args:
        wiki_id: The wiki ID

    Returns:
        True if pull succeeded, False otherwise
    """
    repo = get_git_repo(wiki_id)
    if repo is None or not repo.remotes:
        return False

    try:
        repo.remote().pull()
        return True
    except Exception:
        return False


def git_push_wiki(wiki_id: str) -> bool:
    """
    Push updates to the default remote for a registered wiki.

    Args:
        wiki_id: The wiki ID

    Returns:
        True if push succeeded, False otherwise
    """
    repo = get_git_repo(wiki_id)
    if repo is None or not repo.remotes:
        return False

    try:
        repo.remote().push()
        return True
    except Exception:
        return False
