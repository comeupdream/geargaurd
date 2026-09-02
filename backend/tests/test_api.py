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


def test_token_with_nothing_configured_is_unset(monkeypatch) -> None:
    """Nothing to look up => no price. Not a zero, not a placeholder.

    "Nothing" now means NEITHER a pool id NOR a contract address: either one
    alone is a complete configuration, because on some chains the pool id is
    the only identifier anyone can supply.
    """
    monkeypatch.setattr(settings, "token_contract", "")
    monkeypatch.setattr(settings, "token_pair_id", "")
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


def test_pinned_pool_is_reported_as_the_source_mode(monkeypatch) -> None:
    """A pinned pool must announce itself.

    "pinned pool" and "address search" fail for completely different reasons
    — a bad pool id vs. a token whose chain identifier is not the 20-byte EVM
    address — and telling them apart from outside the service was impossible
    until this field existed.
    """
    monkeypatch.setattr(settings, "token_pair_id", "0xabc")
    assert client.get("/api/token").json()["source_mode"] == "pinned_pool"

    monkeypatch.setattr(settings, "token_pair_id", "")
    assert client.get("/api/token").json()["source_mode"] == "address_search"


def test_pinned_pool_alone_is_enough_to_quote(monkeypatch) -> None:
    """A pool id with no contract address is a complete configuration.

    On a chain whose token identifiers are not 20-byte EVM addresses, the
    pool id may be the only thing anyone can supply — so it must not be
    rejected as "unset" for want of a contract.
    """
    monkeypatch.setattr(settings, "token_contract", "")
    monkeypatch.setattr(settings, "token_pair_id", "0xpool")
    assert client.get("/api/token").json()["status"] != "unset"


def test_both_pool_sides_are_reported() -> None:
    """The deck must be able to see WHICH asset the price belongs to.

    priceUsd is the base token's price; pin a pool the wrong way round and
    the page prints the quote asset's price under our ticker — a plausible
    number about a different coin.
    """
    result = TokenFeed()._pick([{
        "priceUsd": "1.00", "liquidity": {"usd": 50_000.0}, "dexId": "deep",
        "baseToken": {"address": "0xaaa", "symbol": "GARY", "name": "Gear Guard Gary"},
        "quoteToken": {"address": "0xbbb", "symbol": "WETH", "name": "Wrapped Ether"},
    }])
    assert result["base_token"]["symbol"] == "GARY"
    assert result["quote_token"]["symbol"] == "WETH"


def test_live_pair_chain_overrides_the_configured_label(monkeypatch) -> None:
    """What the pool says beats what the config guessed.

    The configured chain is a declared label; the quoting pair reports the
    chain the token is actually trading on. If they disagree, the page must
    show the measurement — a stale config string next to a live price is how
    a visitor ends up looking for the token on the wrong explorer.
    """
    monkeypatch.setattr(settings, "token_chain", "solana")
    result = TokenFeed()._pick(
        [{"priceUsd": "1.00", "liquidity": {"usd": 50_000.0},
          "dexId": "deep", "chainId": "base"}]
    )
    assert result["chain"] == "base"


def test_chain_falls_back_to_the_label_when_upstream_omits_it() -> None:
    """A missing chainId must not blank a field that has an honest answer."""
    result = TokenFeed()._pick(
        [{"priceUsd": "1.00", "liquidity": {"usd": 50_000.0}, "dexId": "deep"}]
    )
    assert result["chain"] == settings.token_chain
