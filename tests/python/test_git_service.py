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
    commit_wiki_page,
    get_file_history,
    search_grep_results,
    backlinks_grep_results,
    get_remote_status_pull_push_wrappers,
    rename_wiki_page,
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


def test_commit_identity_contract_explicit_email():
    """Test that explicit committer_email flows through to git commit."""
    with tempfile.TemporaryDirectory() as tmpdir:
        repo_path = Path(tmpdir) / "test_wiki"
        repo_path.mkdir()

        from git import Repo

        repo = Repo.init(str(repo_path))

        # Create a test page file
        page_file = repo_path / "test-page.md"
        page_file.write_text("Test content")
        repo.index.add([str(page_file)])
        repo.index.commit("Initial commit")

        # Update the page
        page_file.write_text("Updated content")
        repo.index.add([str(page_file)])

        explicit_email = "alice@customdomain.org"
        result = commit_page_update(
            str(repo_path),
            "test-page.md",
            user="alice",
            committer_email=explicit_email,
        )
        assert result is True

        # Verify the commit actor matches the explicit email
        commits = list(repo.iter_commits(paths="test-page.md"))
        assert len(commits) >= 1
        latest = commits[0]
        assert latest.author.email == explicit_email
        assert latest.committer.email == explicit_email


def test_commit_identity_contract_fallback_email():
    """Test that omitted committer_email falls back to get_default_email."""
    with tempfile.TemporaryDirectory() as tmpdir:
        repo_path = Path(tmpdir) / "test_wiki"
        repo_path.mkdir()

        from git import Repo

        repo = Repo.init(str(repo_path))

        # Create a test page file
        page_file = repo_path / "test-page.md"
        page_file.write_text("Test content")
        repo.index.add([str(page_file)])
        repo.index.commit("Initial commit")

        # Update the page without explicit email
        page_file.write_text("Updated content")
        repo.index.add([str(page_file)])

        result = commit_page_update(
            str(repo_path),
            "test-page.md",
            user="bob",
            # No committer_email — should fall back
        )
        assert result is True

        commits = list(repo.iter_commits(paths="test-page.md"))
        assert len(commits) >= 1
        latest = commits[0]
        # Fallback should use get_default_email which includes username
        assert latest.author.email == "bob@wikilab"
        assert latest.committer.email == "bob@wikilab"


def test_commit_wiki_page_uses_explicit_email(tmp_path, monkeypatch):
    """Test commit_wiki_page honours explicit email parameter."""
    import jupyterhub_wikilab.wiki_registry as wiki_registry

    monkeypatch.setattr(wiki_registry, "_REGISTRY_PATH", tmp_path / "wikis.json")

    from jupyterhub_wikilab import wiki_service

    wiki_id = "test-wiki"
    wiki_path = tmp_path / "wikis" / wiki_id
    wiki_path.mkdir(parents=True)

    wiki_service.create_wiki(wiki_id, "Test Wiki", str(wiki_path))

    from git import Repo

    Repo.init(str(wiki_path))

    page_file = wiki_path / "home.md"
    page_file.write_text("Home content")

    explicit_email = "carol@external.dev"
    result = commit_wiki_page(
        wiki_id,
        "home",
        user="carol",
        email=explicit_email,
    )
    assert result is True

    repo = Repo(str(wiki_path))
    commits = list(repo.iter_commits(paths="home.md"))
    assert len(commits) >= 1
    latest = commits[0]
    assert latest.author.email == explicit_email
    assert latest.committer.email == explicit_email


def test_rename_wiki_page_uses_explicit_email(tmp_path, monkeypatch):
    """Test rename_wiki_page honours explicit email parameter."""
    import jupyterhub_wikilab.wiki_registry as wiki_registry

    monkeypatch.setattr(wiki_registry, "_REGISTRY_PATH", tmp_path / "wikis.json")

    from jupyterhub_wikilab import wiki_service

    wiki_id = "test-wiki"
    wiki_path = tmp_path / "wikis" / wiki_id
    wiki_path.mkdir(parents=True)

    wiki_service.create_wiki(wiki_id, "Test Wiki", str(wiki_path))

    from git import Repo

    repo = Repo.init(str(wiki_path))

    old_file = wiki_path / "old.md"
    old_file.write_text("Old content")
    repo.index.add([str(old_file)])
    repo.index.commit("Initial commit")

    explicit_email = "dave@renameserver.io"
    result = rename_wiki_page(
        wiki_id,
        "old.md",
        "new.md",
        user="dave",
        email=explicit_email,
    )
    assert result is True

    commits = list(repo.iter_commits())
    assert len(commits) >= 1
    latest = commits[0]
    assert latest.author.email == explicit_email
    assert latest.committer.email == explicit_email
