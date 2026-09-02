/* =============================================================================
 * token.js — the live readout.
 *
 * Polls the backend's /api/state and paints the header lamp, the token card,
 * the gauge cluster and the majors strip.
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE: never render a number the backend
 * did not measure. The API answers with a `status`, and each status gets its
 * own rendering:
 *
 *   unset    no contract configured yet   -> "CONTRACT NOT SET"
 *   no_pool  contract exists, no pool     -> "NO POOL YET"
 *   thin     pool below the floor         -> "POOL TOO SHALLOW TO QUOTE"
 *   dark     upstream unreachable         -> "FEED DARK" (last good value kept,
 *                                            visibly aged, never replaced by 0)
 *   live     a real quote                 -> the number
 *
 * Coercing all five into "$0.00" would be the single most dishonest thing this
 * page could do, so none of them is allowed to become a zero.
 * ===========================================================================*/
(function () {
'use strict';

var API = (window.GG_API || '').replace(/\/+$/, '');
/* A scheme-less host is promoted rather than rejected — it saves a hand-typed
 * URL from silently producing a relative path. It cannot save an
 * unresolvable one; see the deploy note in render.yaml about INTERNAL
 * hostnames, which resolve only inside the host's private network. */
if (API && !/^https?:\/\//i.test(API)) API = 'https://' + API;

var $ = function (id) { return document.getElementById(id); };
var POLL_MS = 30000;

/* Every call into another script goes through this. A partial deploy — one
 * asset served stale, missing, or (with a catch-all rewrite in front of it)
 * as an HTML page that `nosniff` then refuses — used to throw here and take
 * the ENTIRE readout down with it: no price, no telemetry, no channel rows,
 * because one chart helper was undefined. Now a missing helper costs you that
 * one widget and nothing else, and says so in the console. */
function safe(fnName) {
  var args = Array.prototype.slice.call(arguments, 1);
  var GG = window.GG;
  if (!GG || typeof GG[fnName] !== 'function') {
    if (!safe.warned[fnName]) {
      safe.warned[fnName] = true;
      console.warn('[gg] GG.' + fnName + ' is unavailable — is assets/js/' +
                   (fnName === 'gauge' ? 'enhance' : 'charts') + '.js being served? ' +
                   'The rest of the readout still works.');
    }
    return;
  }
  try { return GG[fnName].apply(GG, args); }
  catch (e) { console.warn('[gg] GG.' + fnName + ' threw:', e); }
}
safe.warned = {};

var STATUS_TEXT = {
  unset: 'Contract not set',
  no_pool: 'No pool yet',
  thin: 'Pool too shallow to quote',
  dark: 'Feed dark',
  live: 'Live'
};

function money(n, dp) {
  if (typeof n !== 'number' || !isFinite(n)) return '--';
  if (n >= 1000) return '$' + Math.round(n).toLocaleString();
  return '$' + n.toFixed(dp === undefined ? (n < 1 ? 6 : 4) : dp);
}
function compact(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '--';
  var u = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (var i = 0; i < u.length; i++) if (n >= u[i][0]) return '$' + (n / u[i][0]).toFixed(1) + u[i][1];
  return '$' + Math.round(n);
}
function pct(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '--';
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}
function setText(id, text, cls) {
  var el = $(id);
  if (!el) return;
  el.textContent = text;
  if (cls !== undefined) el.className = cls;
}

function paintLamp(state, label) {
  document.querySelectorAll('.lamp[data-live]').forEach(function (el) {
    el.dataset.state = state;
    el.textContent = label;
  });
}

function paintToken(tok, limits) {
  var status = tok.status || 'dark';
  var live = status === 'live';
  var stale = live && (tok.stale_seconds || 0) > 90;

  paintLamp(live ? (stale ? 'stale' : 'live') : (status === 'unset' ? 'idle' : 'dark'),
            live ? (stale ? 'Feed stale' : 'Feed live') : STATUS_TEXT[status] || 'Feed dark');

  setText('tokPair', tok.symbol ? '$' + tok.symbol : '$--');
  /* tok.chain is the chain the QUOTING POOL reports when there is one, and
   * the configured label otherwise — so this row follows the measurement. */
  setText('tokChainRow', (tok.chain || '--').toUpperCase());

  /* The address printed in the hero is the one visitors copy; tok.contract is
   * the one the price is actually read from. They come from two different
   * places (the page vs. the backend's environment), so they CAN drift — and
   * a page that hands out one address while quoting another is the single
   * worst thing this deck could do to someone. Compare them every poll and
   * say so loudly rather than quietly showing both.
   *
   * Compared case-insensitively: EIP-55 casing is a checksum, not identity. */
  var heroCa = $('caText'), caWarn = $('caWarn');
  if (heroCa && caWarn) {
    var shown = (heroCa.textContent || '').trim().toLowerCase();
    var quoted = String(tok.contract || '').trim().toLowerCase();
    var mismatch = !!shown && !!quoted && shown !== quoted;
    caWarn.hidden = !mismatch;
    if (mismatch) {
      caWarn.textContent =
        'Address mismatch — the readout is pricing ' + tok.contract +
        ', which is NOT the address above. Do not use either until this is resolved.';
    }
  }
  setText('tokContract', tok.contract || 'not set');

  if (!live) {
    /* No measurement means no number. The detail line carries the reason in
     * the backend's own words, so the page and the API can never disagree. */
    setText('tokPrice', '--', 'v dim');
    setText('tok24h', '--', 'v dim');
    setText('tokStatus', tok.detail || STATUS_TEXT[status] || 'No quote available.');
    safe('gauge', $('gDepth'), null, '--', '#8fa099');
    safe('gauge', $('gMom'), null, '--', '#8fa099');
    paintChannels(null);
    safe('flowMeter', $('flowMeter'), null);
    paintTelemetry(tok, false);
    return;
  }

  var ch = tok.change_24h_pct;
  setText('tokPrice', money(tok.price_usd), 'v');
  setText('tok24h', pct(ch), 'v ' + (typeof ch === 'number' && ch < 0 ? 'down' : 'up'));
  setText('tokStatus', stale
    ? 'Last quote is ' + Math.round(tok.stale_seconds) + 's old — upstream is not answering.'
    /* Names the route that actually answered. Saying "by contract address"
     * when the pinned pool answered would describe the wrong mechanism, and
     * that sentence is the page's own audit trail for its number. */
    : 'Quoted live from DexScreener via the ' + (tok.route || 'pool') + ' on ' +
      ((tok.pair && tok.pair.dex) || 'a DEX') + '.');

  var link = $('tokPairLink');
  if (link && tok.pair && tok.pair.url) { link.href = tok.pair.url; link.hidden = false; }

  /* Gauge ceilings are DISPLAY scales, declared here and stated on the label.
   * A gauge whose maximum is invisible tells you nothing about the value. */
  var depthMax = 250000;
  safe('gauge', $('gDepth'), (tok.liquidity_usd || 0) / depthMax, compact(tok.liquidity_usd), '#3fd98a');
  /* Momentum is bidirectional, so it is mapped from -25%..+25% onto the dial
   * with the centre as flat, and the arc takes the sign's colour. */
  var m = typeof ch === 'number' ? ch : 0;
  safe('gauge', $('gMom'), (Math.max(-25, Math.min(25, m)) + 25) / 50, pct(ch),
       m < 0 ? '#ff5a4d' : '#ffd400');

  paintChannels(tok);
  safe('flowMeter', $('flowMeter'), tok.txns_24h);
  paintTelemetry(tok, live);

  var floorEl = $('tokFloor');
  if (floorEl && limits) floorEl.textContent = compact(limits.min_liquidity_usd);
}

/* The header telemetry rail. Every field is a real reading or "--" — a rail
 * of decorative numbers is the fastest way to teach a visitor that nothing on
 * the page means anything. The `lit` glow is applied only while the feed is
 * live, so the glow itself carries the status. */
function paintTelemetry(tok, live) {
  var ch = tok && tok.change_24h_pct;
  setText('telPrice', live ? money(tok.price_usd) : '--');
  setText('tel24h', live ? pct(ch) : '--',
          live && typeof ch === 'number' ? (ch < 0 ? 'down' : 'up') : '');
  setText('telLiq', live ? compact(tok.liquidity_usd) : '--');
  setText('telVol', live ? compact(tok.volume_24h_usd) : '--');
  setText('telChain', (tok && tok.chain ? String(tok.chain) : '--').toUpperCase());
  var p = $('telPrice');
  if (p) p.classList.toggle('lit', !!live);
}

/* Channel rows: label, value, and a meter bar against a DECLARED scale. The
 * scale is printed on the row, because a bar with an invisible maximum tells
 * you nothing — it is decoration that looks like information. */
var CHANNELS = [
  { k: 'liquidity_usd',  label: 'Liquidity',   max: 250000, scale: '$250K' },
  { k: 'volume_24h_usd', label: 'Volume 24h',  max: 500000, scale: '$500K' },
  { k: 'volume_6h_usd',  label: 'Volume 6h',   max: 150000, scale: '$150K' },
  { k: 'market_cap_usd', label: 'Market cap',  max: 5000000, scale: '$5M' },
  { k: 'fdv_usd',        label: 'FDV',         max: 5000000, scale: '$5M' }
];

function paintChannels(tok) {
  var host = $('chanRows');
  if (!host) return;
  host.textContent = '';
  CHANNELS.forEach(function (c) {
    var v = tok ? tok[c.k] : null;
    var known = typeof v === 'number' && isFinite(v);
    var row = document.createElement('div');
    row.className = 'chan-row';
    row.innerHTML =
      '<span class="cr-k">' + c.label + '</span>' +
      '<span class="cr-v">' + (known ? compact(v) : '--') + '</span>' +
      '<span class="cr-bar"><i></i></span>' +
      '<span class="cr-s">' + c.scale + '</span>';
    /* Width set from script, not markup, so an unknown value renders an empty
     * track rather than a zero-length bar that reads as a measured zero. */
    if (known) {
      row.querySelector('i').style.width = Math.max(1.5, Math.min(100, (v / c.max) * 100)) + '%';
    } else {
      row.classList.add('unknown');
    }
    host.appendChild(row);
  });
}

function paintMajors(maj) {
  var host = $('majors');
  if (!host) return;
  if (!maj || maj.status !== 'live' || !maj.quotes || !maj.quotes.length) {
    host.innerHTML = '<span class="r"><span>ORACLE</span><b>feed dark</b></span>';
    return;
  }
  host.innerHTML = maj.quotes.map(function (q) {
    var dp = q.price >= 100 ? 0 : q.price >= 1 ? 2 : 5;
    return '<span class="r"><span>' + q.symbol.replace('/USD', '') + '</span><b>$' +
      q.price.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp }) +
      '</b></span>';
  }).join('');
}

/* ---------------------------------------------------------------------------
 * Adapting the market store to the shape the painters already expect.
 *
 * GGMARKET (coin.js) hands back a raw DexScreener pair. Everything below was
 * written against the backend's normalised JSON, so one adapter keeps both
 * sources interchangeable instead of forking every painter.
 * ------------------------------------------------------------------------- */
var C = window.GGCOIN || {};

function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }

function fromStore(st) {
  var p = st.pair;
  var base = {
    symbol: C.symbol, chain: C.chainLabel || C.chainSlug, contract: C.ca,
    status: st.status, detail: st.detail, route: st.route, stale_seconds: 0
  };
  if (!p) return base;
  var ch = p.priceChange || {}, vol = p.volume || {}, tx = (p.txns || {}).h24 || {};
  return {
    symbol: (p.baseToken && p.baseToken.symbol) || C.symbol,
    chain: p.chainId || C.chainSlug,
    contract: C.ca,
    status: st.status,
    detail: st.detail,
    route: st.route,
    stale_seconds: st.status === 'dark' ? Math.round((Date.now() - st.at) / 1000) : 0,
    price_usd: num(p.priceUsd),
    liquidity_usd: num(p.liquidity && p.liquidity.usd),
    market_cap_usd: num(p.marketCap),
    fdv_usd: num(p.fdv),
    volume_24h_usd: num(vol.h24),
    volume_6h_usd: num(vol.h6),
    change_1h_pct: num(ch.h1),
    change_24h_pct: num(ch.h24),
    txns_24h: (tx.buys != null || tx.sells != null)
      ? { buys: +tx.buys || 0, sells: +tx.sells || 0 } : null,
    pair: { dex: p.dexId, url: p.url || C.pairPage },
    pools_seen: 1,
    base_token: p.baseToken || null,
    quote_token: p.quoteToken || null
  };
}

/* ---------------------------------------------------------------------------
 * The chart — candles straight from GeckoTerminal, keyed by the same pool the
 * price came from. No backend in the path.
 * ------------------------------------------------------------------------- */
var RANGES = {
  '1d':  { tf: 'hour', agg: 1, limit: 24,  label: '24 hours · hourly' },
  '7d':  { tf: 'hour', agg: 4, limit: 42,  label: '7 days · 4-hourly' },
  '30d': { tf: 'day',  agg: 1, limit: 30,  label: '30 days · daily' },
  '90d': { tf: 'day',  agg: 1, limit: 90,  label: '90 days · daily' }
};
var range = '7d';
/* Candles move far more slowly than a spot quote, and the upstream throttles
 * keyless callers — so history runs on its own slower schedule. */
var HISTORY_MS = 300000;
var lastHistory = null;

function paintHistory(h) {
  var host = $('priceChart');
  if (!host) return;
  lastHistory = h;
  var live = h && h.status === 'live';
  safe('priceChart', host, live ? h.candles : null, (h && h.range) || range,
       { detail: h && h.detail });
  setText('chartSrc', live
    ? (h.label + ' · ' + h.candles.length + ' candles · GeckoTerminal, from the ' +
       'same pool as the price above')
    : (h && h.detail) || 'No candle history available.');
}

function loadHistory() {
  if (!C.ohlcvApi) { paintHistory({ status: 'dark', detail: 'No pool configured.' }); return; }
  var r = RANGES[range] || RANGES['7d'];
  var url = C.ohlcvApi + r.tf + '?aggregate=' + r.agg + '&limit=' + r.limit + '&currency=usd';
  fetch(url, { cache: 'no-store' })
    .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
    .then(function (j) {
      var rows = (((j.data || {}).attributes) || {}).ohlcv_list || [];
      /* GeckoTerminal returns NEWEST FIRST. A chart drawn in that order runs
       * backwards through time and nobody notices until the trend reads
       * inverted — so sort explicitly rather than trusting the order. */
      var candles = rows.slice().sort(function (a, b) { return a[0] - b[0]; })
        .map(function (c) {
          return { t: +c[0], o: +c[1], h: +c[2], l: +c[3], c: +c[4], v: +c[5] };
        })
        .filter(function (c) { return isFinite(c.t) && isFinite(c.c); });
      if (candles.length < 2) {
        /* One point is not a line. Say the pool is new rather than drawing a
         * chart that implies a trend from a single dot. */
        paintHistory({ status: 'no_history', range: range,
                       detail: 'This pool has no candle history yet — too new to chart.' });
        return;
      }
      paintHistory({ status: 'live', range: range, label: r.label, candles: candles });
    })
    .catch(function (err) {
      paintHistory({ status: 'dark', range: range,
                     detail: 'Candle source unreachable (' +
                             ((err && err.message) || 'network error') + ').' });
    });
}

var rangeRow = $('rangeRow');
if (rangeRow) {
  rangeRow.addEventListener('click', function (e) {
    var b = e.target.closest('[data-range]');
    if (!b || b.dataset.range === range) return;
    range = b.dataset.range;
    Array.prototype.forEach.call(rangeRow.children, function (c) {
      c.classList.toggle('on', c === b);
    });
    loadHistory();
  });
}

/* ---------------------------------------------------------------------------
 * Diagnostics — names which of the several possible failures actually
 * happened, instead of showing the same "--" for all of them.
 * ------------------------------------------------------------------------- */
function paintDiag(tok) {
  var host = $('diagRows'), box = $('diag');
  if (!host) return;
  var b = window.GG_BUILD;
  var rows = [
    ['Frontend build', b ? b.commit + ' · ' + b.built : 'unstamped (build.sh did not run)'],
    ['Quote source', 'DexScreener, direct from this page'],
    ['Route', (tok && tok.route) || '--'],
    ['Quote status', (tok && tok.status) || '--'],
    ['Chain', (tok && tok.chain) || '--'],
    ['Pinned pool', C.pool || '--'],
    ['Priced asset', tok && tok.base_token && tok.base_token.symbol
      ? tok.base_token.symbol + ' / ' + ((tok.quote_token && tok.quote_token.symbol) || '?')
      : '--'],
    ['Reference feed', API ? API : 'no backend configured (optional)'],
    ['Detail', (tok && tok.detail) || '—']
  ];
  host.innerHTML = rows.map(function (r) {
    return '<div class="r"><span>' + r[0] + '</span><b>' +
      String(r[1]).replace(/[<>&]/g, '') + '</b></div>';
  }).join('');
  if (box) box.open = !(tok && tok.status === 'live');
}

/* ---------------------------------------------------------------------------
 * Wiring
 * ------------------------------------------------------------------------- */
function onMarket(st) {
  var tok = fromStore(st);
  paintToken(tok, { min_liquidity_usd: C.minLiquidityUsd });
  paintDiag(tok);
}

if (window.GGMARKET) {
  window.GGMARKET.onUpdate(onMarket);
  onMarket(window.GGMARKET.get());
} else {
  /* coin.js did not load. Say so on the page rather than sitting on the
   * initial placeholder text forever, which is exactly the failure this
   * whole file was rewritten to stop. */
  var dead = { status: 'dark', route: 'coin.js not loaded',
               detail: 'assets/js/coin.js did not load — the market store is missing.' };
  paintToken(dead, null);
  paintDiag(dead);
}

loadHistory();
setInterval(loadHistory, HISTORY_MS);

/* The reference majors are the ONLY thing still served by the backend, and
 * they are decoration: the token quote no longer depends on it at all. */
function loadMajors() {
  if (!API) { paintMajors(null); return; }
  fetch(API + '/api/state', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
    .then(function (s) { paintMajors(s.majors); })
    .catch(function () { paintMajors(null); });
}
loadMajors();
setInterval(loadMajors, POLL_MS);

/* Redrawn from the LAST PAYLOAD, never re-fetched: dragging a window edge
 * would otherwise fire a burst of requests at a throttled upstream. */
var resizeT = null;
addEventListener('resize', function () {
  clearTimeout(resizeT);
  resizeT = setTimeout(function () { if (lastHistory) paintHistory(lastHistory); }, 250);
}, { passive: true });
})();
