"""GEAR GUARD GARY — the read-only market layer.

Two keyless public sources, both read over plain HTTPS with no account:

  * **DexScreener** prices the project's own token **by contract address**,
    picking the deepest pool it is quoted in.
  * **Pyth Hermes** prices the majors (SOL/ETH/BTC) that give the page a real
    market backdrop before the token itself has a pool.

Rules that are load-bearing here — they are the same ones the station's wallet
wing learned the hard way, and breaking one makes the page lie:

* **A token is priced by CONTRACT, never by symbol.** A scam mint calling
  itself RIVN must not inherit this project's quote. Every lookup keys on the
  address, and the response echoes back which pair answered.
* **A shallow pool is not a price.** Anything under ``min_liquidity_usd`` is
  discarded as noise — a $200 puddle prints a number that moves 40% on one
  $50 buy, and putting that on a landing page is fabricating a market cap.
* **A dark feed is not a zero.** An upstream that fails keeps the last good
  reading and reports ``stale_seconds``; it never overwrites a real price with
  a zero, and it never invents one.
* **No contract configured means no price.** With ``TOKEN_CONTRACT`` blank the
  answer is ``status="unset"`` and the deck says CONTRACT NOT SET. A launch
  page that shows a chart before there is a token is the thing this refuses
  to be.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field

import httpx

from .config import settings

logger = logging.getLogger("gearguard.feeds")

DEXSCREENER_TOKENS = "https://api.dexscreener.com/latest/dex/tokens/"
HERMES_LATEST = "https://hermes.pyth.network/v2/updates/price/latest"

# Verified Pyth mainnet crypto feed ids (hermes /v2/price_feeds). Symbol ->
# 0x-prefixed id. An unknown symbol is skipped, never guessed.
PYTH_FEED_IDS: dict[str, str] = {
    "BTC/USD": "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
    "ETH/USD": "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
    "SOL/USD": "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    "BNB/USD": "0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f",
    "JUP/USD": "0x0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996",
    "BONK/USD": "0x72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419",
    "PYTH/USD": "0x0bbf28e9a841a1cc788f6a361b17ca072d0ea3098a1e5df1c3922d06719579ff",
}


@dataclass
class _Cached:
    """One cached upstream reading plus the age of the last *successful* one."""

    payload: dict = field(default_factory=dict)
    fetched_at: float = 0.0

    @property
    def age(self) -> float:
        return time.time() - self.fetched_at if self.fetched_at else float("inf")


class _Reader:
    """Shared plumbing: one HTTP client, one lock, TTL-gated refresh."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._client = httpx.Client(
            timeout=settings.http_timeout_seconds,
            headers={"user-agent": "gear-guard-gary/1.0 (+read-only)"},
        )


# --------------------------------------------------------------------------
# The token itself
# --------------------------------------------------------------------------
class TokenFeed(_Reader):
    """Live quote for the project's own token, by contract address."""

    def __init__(self) -> None:
        super().__init__()
        self._cache = _Cached()

    def snapshot(self, *, force: bool = False) -> dict:
        contract = (settings.token_contract or "").strip()
        base = {
            "name": settings.token_name,
            "symbol": settings.token_symbol,
            "chain": settings.token_chain,
            "contract": contract,
        }
        if not contract:
            # Honest empty state. Not a zero, not a placeholder chart.
            return {
                **base,
                "status": "unset",
                "detail": "No contract configured — set TOKEN_CONTRACT to go live.",
            }

        with self._lock:
            fresh_enough = self._cache.age < settings.cache_ttl_seconds
            if not force and self._cache.payload and fresh_enough:
                return {**base, **self._cache.payload, "stale_seconds": 0}

            try:
                resp = self._client.get(DEXSCREENER_TOKENS + contract)
                resp.raise_for_status()
                pairs = resp.json().get("pairs") or []
            except Exception as exc:  # noqa: BLE001 — degrade, never raise
                logger.warning("token quote failed: %s", exc)
                if self._cache.payload:
                    # A dark upstream is not a zero: last good reading stands,
                    # clearly aged so the UI can say so.
                    return {
                        **base,
                        **self._cache.payload,
                        "stale_seconds": int(self._cache.age),
                    }
                return {**base, "status": "dark", "detail": "Price feed unreachable."}

            payload = self._pick(pairs)
            if payload.get("status") == "live":
                self._cache = _Cached(payload=payload, fetched_at=time.time())
            return {**base, **payload, "stale_seconds": 0}

    def _pick(self, pairs: list[dict]) -> dict:
        """Choose the deepest pool, and refuse to quote a shallow one."""
        if not pairs:
            return {
                "status": "no_pool",
                "detail": "No liquidity pool found for this contract yet.",
            }

        def depth(p: dict) -> float:
            try:
                return float((p.get("liquidity") or {}).get("usd") or 0.0)
            except (TypeError, ValueError):
                return 0.0

        best = max(pairs, key=depth)
        liq = depth(best)
        if liq < settings.min_liquidity_usd:
            # A $50 puddle is noise. Say so rather than printing its number.
            return {
                "status": "thin",
                "detail": (
                    f"Deepest pool holds ${liq:,.0f} — under the "
                    f"${settings.min_liquidity_usd:,.0f} floor this page will quote."
                ),
                "liquidity_usd": round(liq, 2),
            }

        try:
            price = float(best.get("priceUsd") or 0.0)
        except (TypeError, ValueError):
            price = 0.0
        if price <= 0:
            return {"status": "no_pool", "detail": "Pool found but it is not quoting."}

        change = best.get("priceChange") or {}
        volume = best.get("volume") or {}
        return {
            "status": "live",
            "price_usd": price,
            "liquidity_usd": round(liq, 2),
            "fdv_usd": _num(best.get("fdv")),
            "market_cap_usd": _num(best.get("marketCap")),
            "volume_24h_usd": _num(volume.get("h24")),
            "change_1h_pct": _num(change.get("h1")),
            "change_24h_pct": _num(change.get("h24")),
            # The chain the quoting pool ACTUALLY trades on, straight from the
            # upstream. snapshot() merges this dict OVER the configured values,
            # so this overrides the token_chain label — a config string that
            # disagrees with the pool is a stale guess, and the measurement is
            # the thing worth showing. Falls back to the configured label
            # rather than to None, which would blank a field that has an
            # honest answer.
            "chain": best.get("chainId") or settings.token_chain,
            # Which pair actually answered — the audit trail for the number.
            "pair": {
                "dex": best.get("dexId"),
                "address": best.get("pairAddress"),
                "url": best.get("url"),
                "quote": (best.get("quoteToken") or {}).get("symbol"),
            },
            "pools_seen": len(pairs),
        }


# --------------------------------------------------------------------------
# Context majors
# --------------------------------------------------------------------------
class MajorsFeed(_Reader):
    """Pyth Hermes quotes for the handful of majors shown as backdrop."""

    def __init__(self) -> None:
        super().__init__()
        self._cache = _Cached()

    def snapshot(self, *, force: bool = False) -> dict:
        wanted = [s for s in settings.major_symbols if s in PYTH_FEED_IDS]
        if not wanted:
            return {"status": "unset", "quotes": []}

        with self._lock:
            fresh_enough = self._cache.age < settings.cache_ttl_seconds
            if not force and self._cache.payload and fresh_enough:
                return {**self._cache.payload, "stale_seconds": 0}

            params = [("ids[]", PYTH_FEED_IDS[s]) for s in wanted]
            try:
                resp = self._client.get(HERMES_LATEST, params=params)
                resp.raise_for_status()
                parsed = resp.json().get("parsed") or []
            except Exception as exc:  # noqa: BLE001
                logger.warning("majors refresh failed: %s", exc)
                if self._cache.payload:
                    return {**self._cache.payload, "stale_seconds": int(self._cache.age)}
                return {"status": "dark", "quotes": [], "detail": "Oracle unreachable."}

            by_id = {PYTH_FEED_IDS[s].lower().removeprefix("0x"): s for s in wanted}
            quotes: list[dict] = []
            for item in parsed:
                sym = by_id.get(str(item.get("id", "")).lower())
                if not sym:
                    continue
                p = item.get("price") or {}
                try:
                    price = int(p["price"]) * (10 ** int(p["expo"]))
                except (KeyError, TypeError, ValueError):
                    continue
                if price <= 0:
                    continue
                quotes.append(
                    {
                        "symbol": sym,
                        "price": price,
                        "publish_time": int(p.get("publish_time") or 0),
                    }
                )

            if not quotes:
                # Parsed nothing usable — treat exactly like a dark feed.
                if self._cache.payload:
                    return {**self._cache.payload, "stale_seconds": int(self._cache.age)}
                return {"status": "dark", "quotes": [], "detail": "Oracle returned nothing."}

            payload = {"status": "live", "quotes": quotes}
            self._cache = _Cached(payload=payload, fetched_at=time.time())
            return {**payload, "stale_seconds": 0}


def _num(value) -> float | None:
    """Coerce an upstream field to float, or None. Never guesses a default."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


token_feed = TokenFeed()
majors_feed = MajorsFeed()
