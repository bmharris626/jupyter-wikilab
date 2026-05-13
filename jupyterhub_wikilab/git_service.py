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


def construct_commit_actor(email: str) -> Actor:
    """
    Construct a commit actor from JUPYTERHUB_USER and configured email.

    Args:
        email: Email address for the commit

    Returns:
        Actor object for the commit
    """
    # Get user from environment or default to 'wikilab'
    name = os.environ.get("JUPYTERHUB_USER", "wikilab")
    return Actor(name, email)


def commit_page_update(
    wiki_path: str, slug: str, user: str, message_template: str = "Update page: {slug}"
) -> bool:
    """
    Commit page updates with standard message template.

    Args:
        wiki_path: Path to the wiki directory
        slug: Slug of the page being updated
        user: User making the update
        message_template: Template for commit message

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

        # Create the commit
        actor = construct_commit_actor("wikilab@example.com")
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


def get_git_repo(wiki_id: str) -> Optional[Repo]:
    """
    Get the Git repository for a wiki.

    Args:
        wiki_id: The ID of the wiki

    Returns:
        Git repository object or None
    """
    try:
        wiki_path = get_wiki_path(wiki_id)
        return Repo(wiki_path)
    except Exception:
        return None


def init_wiki_git(wiki_id: str, name: str = "wikilab") -> bool:
    """
    Initialize a Git repository for a wiki.

    Args:
        wiki_id: The ID of the wiki
        name: Name for the repository

    Returns:
        True if repository was initialized successfully, False otherwise
    """
    try:
        wiki_path = get_wiki_path(wiki_id)
        repo = Repo.init(wiki_path)
        return True
    except Exception:
        return False


def commit_wiki_page(wiki_id: str, slug: str, message: str = "Update page") -> bool:
    """
    Commit a page to the Git repository.

    Args:
        wiki_id: The ID of the wiki
        slug: Slug of the page being updated
        message: Commit message

    Returns:
        True if commit was successful, False otherwise
    """
    try:
        wiki_path = get_wiki_path(wiki_id)
        repo = Repo(wiki_path)

        # Create the page path
        page_path = Path(wiki_path) / f"{slug}.md"

        # Add the file to the index
        repo.index.add([str(page_path)])

        # Create the commit
        actor = construct_commit_actor("wikilab@example.com")

        # Commit with the actor information
        repo.index.commit(message, author=actor, committer=actor)

        return True
    except Exception:
        return False


def get_wiki_git_status(wiki_id: str) -> Dict:
    """
    Get the status of a wiki's Git repository.

    Args:
        wiki_id: The ID of the wiki

    Returns:
        Dictionary with status information
    """
    try:
        wiki_path = get_wiki_path(wiki_id)
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


def git_pull_wiki(wiki_id: str) -> bool:
    """
    Pull changes from the remote repository.

    Args:
        wiki_id: The ID of the wiki

    Returns:
        True if pull was successful, False otherwise
    """
    try:
        wiki_path = get_wiki_path(wiki_id)
        repo = Repo(wiki_path)
        origin = repo.remotes.origin
        origin.pull()
        return True
    except Exception:
        return False


def git_push_wiki(wiki_id: str) -> bool:
    """
    Push changes to the remote repository.

    Args:
        wiki_id: The ID of the wiki

    Returns:
        True if push was successful, False otherwise
    """
    try:
        wiki_path = get_wiki_path(wiki_id)
        repo = Repo(wiki_path)
        origin = repo.remotes.origin
        origin.push()
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
