/* =============================================================================
 * coin.js — the one place the token's real-world facts live, and the shared
 * market store that reads them.
 *
 * Lineage: VENUS-OS's js/coin.js (comeupdream/venus). Same two ideas, and both
 * are the reason the Charge deck was dead before this file existed:
 *
 *   1. THE FACTS LIVE IN ONE OBJECT. Contract, chain, pool, links — declared
 *      once, read everywhere. Nothing re-types an address.
 *   2. THE BROWSER TALKS TO DEXSCREENER DIRECTLY. DexScreener serves CORS, so
 *      a page can quote its own token with no backend in the path at all.
 *
 * The deck used to route the quote through its own FastAPI service. That put
 * four things between a visitor and a price — the service being deployed,
 * awake, correctly configured, and reachable from the browser — and any one
 * of them failing produced the same silent "--". None of that is needed to
 * read a public price feed. The backend still exists and is still read-only,
 * but it is now an ENHANCEMENT (reference majors), never the critical path.
 *
 * ROBINHOOD CHAIN, and what is different about it:
 *   - Its identifiers are 32 bytes, not the 20 bytes of an EVM address. The
 *     pool in this token's own DexScreener URL is 66 characters. So the pool
 *     is fetched BY ID from /latest/dex/pairs/robinhood/<pool>, which is
 *     exactly the URL the public page uses and cannot be got wrong.
 *   - The token-address search (/latest/dex/tokens/<address>) is kept as a
 *     fallback, because it is the right call on ordinary EVM chains — but it
 *     is second, not first, precisely because it assumes a 20-byte id.
 * ===========================================================================*/

window.GGCOIN = (function () {
  var ca = '0x401923511EC7356AeC6b7717207394feA97CEa01';
  var pool = '0x17f1144200cac91a074d2787900117d0d7803177c1b4d00f80810c189a41a99e';
  var chain = 'robinhood';
  return {
    symbol: 'GARY',
    name: 'Gear Guard Gary',
    ca: ca,
    pool: pool,
    chainSlug: chain,
    chainLabel: 'Robinhood Chain',

    reward: 'tokenized RIVN',
    rewardNetwork: 'Robinhood Chain',

    pairPage: 'https://dexscreener.com/' + chain + '/' + pool,

    /* DexScreener serves CORS, so these are called straight from the page. */
    pairApi: 'https://api.dexscreener.com/latest/dex/pairs/' + chain + '/' + pool,
    tokenApi: 'https://api.dexscreener.com/latest/dex/tokens/' + ca,

    /* GeckoTerminal serves the candles, also CORS, also keyed by the pool. */
    ohlcvApi: 'https://api.geckoterminal.com/api/v2/networks/' + chain +
              '/pools/' + pool + '/ohlcv/',

    /* A pool shallower than this is noise, not a market. */
    minLiquidityUsd: 5000
  };
})();

/* ---- shared market store ---------------------------------------------------
 * One fetch loop for the whole page. Every widget subscribes; nothing fetches
 * on its own. Fails quiet and keeps the last good reading — a dark feed is
 * not a zero.
 * --------------------------------------------------------------------------*/
window.GGMARKET = (function () {
  'use strict';
  var C = window.GGCOIN;
  var store = {
    pair: null,        // the winning DexScreener pair object
    status: 'loading', // loading | live | thin | no_pool | dark
    detail: '',
    route: '',         // which request answered — the audit trail
    at: 0,
    listeners: []
  };

  function liq(p) {
    return (p && p.liquidity && +p.liquidity.usd) || 0;
  }

  /* Pick the deepest pool, and only one that actually involves our token.
   * Without the address check a token search can hand back a pair for a
   * completely different asset that merely shares the query. */
  function deepest(pairs, wantChain) {
    var best = null;
    for (var i = 0; i < (pairs || []).length; i++) {
      var p = pairs[i];
      if (!p) continue;
      if (wantChain && p.chainId && p.chainId !== wantChain) continue;
      var b = (p.baseToken && p.baseToken.address || '').toLowerCase();
      var q = (p.quoteToken && p.quoteToken.address || '').toLowerCase();
      var mine = C.ca.toLowerCase();
      /* On a chain whose ids are not 20-byte addresses the side addresses may
       * not match our configured contract at all — so an explicitly pinned
       * pool is trusted without the check, and only SEARCH results have to
       * prove they are about our token. */
      if (wantChain === null && b !== mine && q !== mine) continue;
      if (!best || liq(p) > liq(best)) best = p;
    }
    return best;
  }

  function settle(pair, route) {
    if (!pair) return false;
    if (liq(pair) < C.minLiquidityUsd) {
      store.pair = pair;
      store.status = 'thin';
      store.route = route;
      store.detail = 'Deepest pool holds $' + Math.round(liq(pair)).toLocaleString() +
        ' — under the $' + C.minLiquidityUsd.toLocaleString() + ' floor this page will quote.';
      return true;
    }
    if (!(+pair.priceUsd > 0)) {
      store.pair = pair;
      store.status = 'no_pool';
      store.route = route;
      store.detail = 'Pool found but it is not quoting a price.';
      return true;
    }
    store.pair = pair;
    store.status = 'live';
    store.route = route;
    store.detail = '';
    return true;
  }

  function emit() {
    store.at = Date.now();
    for (var i = 0; i < store.listeners.length; i++) {
      try { store.listeners[i](store); } catch (e) { /* one bad widget must not stop the rest */ }
    }
  }

  function refresh() {
    /* PINNED POOL FIRST. This is the exact market the project means, fetched
     * by the same id its public page uses. */
    return fetch(C.pairApi, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
      .then(function (j) {
        var pairs = j.pairs || (j.pair ? [j.pair] : []);
        return settle(deepest(pairs, null), 'pinned pool');
      })
      .catch(function () { return false; })
      .then(function (done) {
        if (done) return true;
        /* FALLBACK: search by contract address. Right for ordinary EVM
         * chains; second because it assumes a 20-byte identifier. */
        return fetch(C.tokenApi, { cache: 'no-store' })
          .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
          .then(function (j) { return settle(deepest(j.pairs, C.chainSlug), 'address search'); })
          .catch(function () { return false; });
      })
      .then(function (done) {
        if (!done) {
          /* Keep the last good pair on screen rather than blanking it — the
           * difference between "we cannot see it" and "it is worthless". */
          store.status = store.pair ? 'dark' : 'no_pool';
          store.route = 'none answered';
          store.detail = store.pair
            ? 'Feed unreachable — showing the last good reading.'
            : 'No pool found for this token yet.';
        }
        emit();
        return store;
      });
  }

  refresh();
  setInterval(function () { if (!document.hidden) refresh(); }, 45000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && Date.now() - store.at > 45000) refresh();
  });

  return {
    refresh: refresh,
    get: function () { return store; },
    onUpdate: function (f) { store.listeners.push(f); if (store.at) f(store); }
  };
})();
