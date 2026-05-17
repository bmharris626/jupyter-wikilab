try:
    from ._version import __version__
except ImportError:
    import warnings
    warnings.warn("Importing 'jupyterhub_wikilab' outside a proper installation.")
    __version__ = "dev"
from .routes import setup_route_handlers


def _jupyter_labextension_paths():
    return [{
        "src": "labextension",
        "dest": "jupyterhub-wikilab"
    }]


def _jupyter_server_extension_points():
    return [{
        "module": "jupyterhub_wikilab"
    }]


def _migrate_registry():
    """One-shot migration: convert wikis.json entries to .wikilab marker files."""
    import json
    from pathlib import Path
    from jupyterhub_wikilab.wiki_service import _WIKI_CACHE, _ensure_gitignore, MARKER_FILE

    registry_path = Path.home() / ".jupyter" / "wikilab" / "wikis.json"
    if not registry_path.exists():
        return

    try:
        entries = json.loads(registry_path.read_text(encoding="utf-8"))
    except Exception:
        return

    for wiki_id, info in entries.items():
        path = Path(info.get("path", ""))
        if not path.is_dir():
            continue
        marker = path / MARKER_FILE
        if not marker.exists():
            try:
                marker.write_text(
                    json.dumps(
                        {"id": wiki_id, "name": info.get("name", wiki_id)}, indent=2
                    ),
                    encoding="utf-8",
                )
                _ensure_gitignore(path)
            except Exception:
                pass
        # Prime cache for the current session regardless
        _WIKI_CACHE[wiki_id] = str(path)

    try:
        registry_path.rename(registry_path.with_suffix(".json.migrated"))
    except Exception:
        pass


def _load_jupyter_server_extension(server_app):
    """Registers the API handler to receive HTTP requests from the frontend extension."""
    _migrate_registry()
    setup_route_handlers(server_app.web_app)
    name = "jupyterhub_wikilab"
    server_app.log.info(f"Registered {name} server extension")
