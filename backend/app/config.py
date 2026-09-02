"""GEAR GUARD GARY — configuration.

Every setting below has a working default, so the service boots and serves
with zero environment configuration. Nothing here is a credential: the whole
backend reads keyless public endpoints and holds no wallet, no key, and no
write path (see main.py's posture note).
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "GEAR GUARD GARY"

    # --- the token -----------------------------------------------------------
    # The contract the deck quotes. Leaving it BLANK is still fully supported
    # and still the honest empty state: /api/token then answers status="unset"
    # and the deck renders "CONTRACT NOT SET" rather than inventing a price.
    token_name: str = "Gear Guard Gary"
    token_symbol: str = "RIVN"
    token_contract: str = "0x401923511EC7356AeC6b7717207394feA97CEa01"

    # A DECLARED label only, and a fallback at that. The DexScreener token
    # endpoint looks a contract up across every chain it indexes, so nothing
    # here narrows or filters the search — and when a live pair answers, the
    # chain it actually trades on overrides this string in the response. A
    # config value that disagrees with the pool must never be what the page
    # shows: the measurement wins.
    token_chain: str = "robinhood"

    # A pool shallower than this is noise, not a price (the wallet wing's
    # "a shallow pool is not a price" rule, same threshold discipline).
    min_liquidity_usd: float = 5_000.0

    # --- context markets -----------------------------------------------------
    # Pyth Hermes, keyless. Majors give the page a market backdrop that is real
    # even before the token has a pool.
    majors: str = "SOL/USD,ETH/USD,BTC/USD"

    # --- plumbing ------------------------------------------------------------
    cache_ttl_seconds: int = 30
    http_timeout_seconds: float = 8.0
    cors_origins: str = "*"

    # Free-tier hosts idle a web service out after ~15 min of no inbound
    # traffic. The self-ping keeps the quote cache warm so the first real
    # visitor does not eat a cold start plus two upstream round-trips.
    keepalive_enabled: bool = True
    keepalive_seconds: int = 600

    @property
    def major_symbols(self) -> list[str]:
        return [s.strip() for s in self.majors.split(",") if s.strip()]

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
