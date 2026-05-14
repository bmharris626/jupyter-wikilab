"""
Tests for git_service.py
"""

import os
import tempfile
from pathlib import Path

import pytest
from unittest.mock import patch, MagicMock

from jupyterhub_wikilab.git_service import (
    detect_or_init_repo,
    construct_commit_actor,
    commit_page_update,
    get_file_history,
    search_grep_results,
    backlinks_grep_results,
    get_remote_status_pull_push_wrappers,
)


def test_detect_or_init_repo():
    """Test repository detection and initialization."""
    # Test with a non-existent directory (should create repo)
    with tempfile.TemporaryDirectory() as tmpdir:
        repo_path = Path(tmpdir) / "nonexistent"
        result = detect_or_init_repo(str(repo_path))
        assert result is True
        # Should now detect the repo
        result = detect_or_init_repo(str(repo_path))
        assert result is True


def test_commit_actor_identity():
    """Test commit actor construction."""
    # Test with environment variable
    with patch.dict(os.environ, {"JUPYTERHUB_USER": "testuser"}):
        actor = construct_commit_actor("test@example.com")
        assert actor["name"] == "testuser"
        assert actor["email"] == "test@example.com"

    # Test with default name fallback
    with patch.dict(os.environ, {}):
        actor = construct_commit_actor("test@example.com")
        assert actor["name"] == "wikilab"
        assert actor["email"] == "test@example.com"


def test_commit_page_update_message():
    """Test page commit message formatting."""
    with tempfile.TemporaryDirectory() as tmpdir:
        repo_path = Path(tmpdir) / "test_wiki"
        repo_path.mkdir()

        # Initialize repo
        from git import Repo

        repo = Repo.init(str(repo_path))

        # Create a test page file
        page_file = repo_path / "test-page.md"
        page_file.write_text("Test content")

        # Test commit
        result = commit_page_update(str(repo_path), "test-page.md", "testuser")
        assert result is True


def test_file_history_returns_entries():
    """Test file history retrieval."""
    with tempfile.TemporaryDirectory() as tmpdir:
        repo_path = Path(tmpdir) / "test_wiki"
        repo_path.mkdir()

        # Initialize repo
        from git import Repo

        repo = Repo.init(str(repo_path))

        # Create a test page file
        page_file = repo_path / "test-page.md"
        page_file.write_text("Test content 1")
        repo.index.add([str(page_file)])
        repo.index.commit("Initial commit")

        page_file.write_text("Test content 2")
        repo.index.add([str(page_file)])
        repo.index.commit("Second commit")

        # Test history
        history = get_file_history(str(repo_path), "test-page.md")
        assert isinstance(history, list)
        assert len(history) >= 1


def test_search_grep_parse_results():
    """Test git grep search results parsing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        repo_path = Path(tmpdir) / "test_wiki"
        repo_path.mkdir()

        # Initialize repo
        from git import Repo

        repo = Repo.init(str(repo_path))

        # Create test files
        test_file = repo_path / "test.md"
        test_file.write_text("This is test content with some words")
        repo.index.add([str(test_file)])
        repo.index.commit("Initial commit")

        # Test grep
        result = search_grep_results(str(repo_path), "test")
        assert isinstance(result, list)


def test_backlinks_grep_results():
    """Test backlinks search."""
    with tempfile.TemporaryDirectory() as tmpdir:
        repo_path = Path(tmpdir) / "test_wiki"
        repo_path.mkdir()

        # Initialize repo
        from git import Repo

        repo = Repo.init(str(repo_path))

        # Create test files
        file1 = repo_path / "test.md"
        file1.write_text("This file references [[other]]")
        file2 = repo_path / "other.md"
        file2.write_text("This is the other file")
        repo.index.add([str(file1), str(file2)])
        repo.index.commit("Initial commit")

        # Test backlinks
        result = backlinks_grep_results(str(repo_path), "other.md")
        assert isinstance(result, list)


def test_remote_status_pull_push_wrappers():
    """Test remote status and sync operations."""
    with tempfile.TemporaryDirectory() as tmpdir:
        repo_path = Path(tmpdir) / "test_wiki"
        repo_path.mkdir()

        # Initialize repo
        from git import Repo

        repo = Repo.init(str(repo_path))

        # Test basic functionality
        status = get_remote_status_pull_push_wrappers(str(repo_path))
        assert isinstance(status, dict)
