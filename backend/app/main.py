"""GEAR GUARD GARY — FastAPI entry point.

POSTURE, stated once and enforced by a test:

    **This service is read-only. There is no write path and none is planned.**

It holds no private key, connects no wallet, signs nothing, and broadcasts
nothing. Every endpoint below is a GET that reads a keyless public feed and
answers with what it read — or says honestly that it could not read it. A
"buy" button on this site is a link to a DEX the visitor's own wallet drives;
it is never a server that spends on their behalf.

``tests/test_api.py`` asserts that no route with a non-GET method ever appears.
The day one does, custody or authority has silently moved onto a box sitting on
a public URL, and that is a decision worth making deliberately rather than
discovering in a diff.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .feeds import DEFAULT_RANGE, RANGES, history_feed, majors_feed, token_feed

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("gearguard")


async def _keepalive() -> None:
    """Self-ping so a free-tier host does not idle the process out.

    Reads the platform-injected public URL; with none set (local dev) it is a
    no-op rather than a loop hammering localhost.
    """
    url = os.getenv("RENDER_EXTERNAL_URL") or os.getenv("PUBLIC_URL") or ""
    if not url:
        return
    target = url.rstrip("/") + "/health"
    async with httpx.AsyncClient(timeout=10.0) as client:
        while True:
            await asyncio.sleep(settings.keepalive_seconds)
            try:
                await client.get(target)
            except Exception as exc:  # noqa: BLE001 — a missed ping is not an error
                logger.debug("keepalive ping failed: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = None
    if settings.keepalive_enabled:
        task = asyncio.create_task(_keepalive())
    logger.info("%s ready (read-only).", settings.app_name)
    try:
        yield
    finally:
        if task:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task


# Bumped whenever the API's shape changes. The deck prints it in its
# diagnostics, so "is the BACKEND stale?" is answerable without guessing —
# a frontend that expects a field an old backend never sends is otherwise
# indistinguishable from a dead upstream.
API_VERSION = "1.2.0"

app = FastAPI(title=settings.app_name, version=API_VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=False,   # nothing here is authenticated; no cookies to leak
    allow_methods=["GET"],     # matches the read-only posture at the edge too
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "service": settings.app_name, "mode": "read-only"}


@app.get("/api/token")
async def token() -> dict:
    """Live quote for the project token, by contract address.

    ``status`` is the honest part: ``unset`` (no contract configured yet),
    ``no_pool``, ``thin`` (pool below the liquidity floor), ``dark`` (feed
    unreachable) or ``live``. The UI renders each one differently rather than
    coercing them all into a number.
    """
    return await asyncio.to_thread(token_feed.snapshot)


@app.get("/api/majors")
async def majors() -> dict:
    """Pyth oracle quotes for the context majors."""
    return await asyncio.to_thread(majors_feed.snapshot)


@app.get("/api/token/history")
async def token_history(range: str = DEFAULT_RANGE) -> dict:
    """OHLCV candles for the pool that is quoting the token.

    Candles come from the SAME pool the headline price does, so the chart and
    the number above it can never describe two different markets. ``status``
    carries the token's own status when there is nothing to chart yet, plus
    two of its own: ``no_history`` (pool exists, too new for candles) and
    ``unsupported_chain`` (no candle source mapped for that chain).

    An unknown ``range`` falls back to the default rather than erroring — a
    bad query string should not blank the chart.
    """
    return await asyncio.to_thread(history_feed.snapshot, range)


@app.get("/api/state")
async def state() -> dict:
    """Everything the deck needs in one round trip.

    The page polls this on an interval; one request keeps the two upstream
    caches in step so the header strip and the token card can never disagree
    about whether the feed is live.
    """
    tok, maj = await asyncio.gather(
        asyncio.to_thread(token_feed.snapshot),
        asyncio.to_thread(majors_feed.snapshot),
    )
    return {
        "service": settings.app_name,
        "api_version": API_VERSION,
        "mode": "read-only",
        "token": tok,
        "majors": maj,
        "limits": {"min_liquidity_usd": settings.min_liquidity_usd},
        "ranges": list(RANGES.keys()),
        "reward": {
            "asset": settings.reward_asset,
            "network": settings.reward_network,
        },
    }
