"""GEAR GUARD GARY — API tests.

The important one is ``test_no_write_path``. Everything else here checks that
the honest empty states stay honest: an unconfigured contract must not produce
a price, and a shallow pool must not be quoted.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import settings
from app.feeds import TokenFeed
from app.main import app

client = TestClient(app)


def test_health() -> None:
    body = client.get("/health").json()
    assert body["ok"] is True
    assert body["mode"] == "read-only"


def test_no_write_path() -> None:
    """No route may accept anything but GET (and the HEAD/OPTIONS that ride along).

    This is the guard on the whole posture: the service reads public feeds and
    serves JSON. A POST/PUT/PATCH/DELETE route means something is now being
    submitted to a server that sits on a public URL — a deliberate decision,
    not one that should slip in with a feature.
    """
    forbidden = {"POST", "PUT", "PATCH", "DELETE"}
    offenders = [
        (route.path, sorted(set(route.methods) & forbidden))
        for route in app.routes
        if getattr(route, "methods", None) and set(route.methods) & forbidden
    ]
    assert not offenders, f"write path(s) appeared: {offenders}"


def test_token_without_contract_is_unset(monkeypatch) -> None:
    """No contract configured => no price. Not a zero, not a placeholder."""
    monkeypatch.setattr(settings, "token_contract", "")
    body = client.get("/api/token").json()
    assert body["status"] == "unset"
    assert "price_usd" not in body


def test_shallow_pool_is_refused() -> None:
    """A pool under the liquidity floor is noise, and is reported as such."""
    feed = TokenFeed()
    result = feed._pick(
        [{"priceUsd": "0.42", "liquidity": {"usd": 120.0}, "dexId": "raydium"}]
    )
    assert result["status"] == "thin"
    assert "price_usd" not in result


def test_deepest_pool_wins() -> None:
    """Between two pools quoting the same token, the deeper one answers."""
    feed = TokenFeed()
    result = feed._pick(
        [
            {"priceUsd": "9.99", "liquidity": {"usd": 6_000.0}, "dexId": "shallow"},
            {"priceUsd": "1.00", "liquidity": {"usd": 900_000.0}, "dexId": "deep"},
        ]
    )
    assert result["status"] == "live"
    assert result["price_usd"] == 1.00
    assert result["pair"]["dex"] == "deep"
    assert result["pools_seen"] == 2


def test_empty_pair_list_is_no_pool() -> None:
    assert TokenFeed()._pick([])["status"] == "no_pool"
