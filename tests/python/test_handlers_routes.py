"""
Tests for route registration in jupyterhub_wikilab.routes.
"""

import json

import pytest


async def test_routes_registered(jp_fetch):
    """Verify that the wikis list endpoint responds."""
    response = await jp_fetch("wikilab", "api", "wikis")
    assert response.code == 200
    body = json.loads(response.body)
    assert "wikis" in body
    assert isinstance(body["wikis"], dict)
