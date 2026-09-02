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
    window.GG.gauge($('gDepth'), null, '--', '#8fa099');
    window.GG.gauge($('gVol'), null, '--', '#8fa099');
    window.GG.gauge($('gMom'), null, '--', '#8fa099');
    return;
  }

  var ch = tok.change_24h_pct;
  setText('tokPrice', money(tok.price_usd), 'v');
  setText('tok24h', pct(ch), 'v ' + (typeof ch === 'number' && ch < 0 ? 'down' : 'up'));
  setText('tokStatus', stale
    ? 'Last quote is ' + Math.round(tok.stale_seconds) + 's old — upstream is not answering.'
    : 'Quoted from the deepest pool of ' + (tok.pools_seen || 1) + ' on ' +
      ((tok.pair && tok.pair.dex) || 'a DEX') + ', by contract address.');

  var link = $('tokPairLink');
  if (link && tok.pair && tok.pair.url) { link.href = tok.pair.url; link.hidden = false; }

  /* Gauge ceilings are DISPLAY scales, declared here and stated on the label.
   * A gauge whose maximum is invisible tells you nothing about the value. */
  var depthMax = 250000, volMax = 500000;
  window.GG.gauge($('gDepth'), (tok.liquidity_usd || 0) / depthMax, compact(tok.liquidity_usd), '#3fd98a');
  window.GG.gauge($('gVol'), (tok.volume_24h_usd || 0) / volMax, compact(tok.volume_24h_usd), '#6ea8d8');
  /* Momentum is bidirectional, so it is mapped from -25%..+25% onto the dial
   * with the centre as flat, and the arc takes the sign's colour. */
  var m = typeof ch === 'number' ? ch : 0;
  window.GG.gauge($('gMom'), (Math.max(-25, Math.min(25, m)) + 25) / 50, pct(ch),
                  m < 0 ? '#ff5a4d' : '#ffd400');

  var floorEl = $('tokFloor');
  if (floorEl && limits) floorEl.textContent = compact(limits.min_liquidity_usd);
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

function tick() {
  if (!API) {
    /* No backend configured is its own honest state — not an error, and not
     * an excuse to invent a price. The rest of the page still works. */
    paintLamp('idle', 'No backend');
    paintToken({ status: 'unset', detail: 'No backend configured for this deployment.' }, null);
    paintMajors(null);
    return;
  }
  fetch(API + '/api/state', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (s) {
      paintToken(s.token || {}, s.limits);
      paintMajors(s.majors);
    })
    .catch(function () {
      /* The backend itself being unreachable is reported as a dark feed, with
       * whatever the page last painted left in place. */
      paintLamp('dark', 'Backend unreachable');
      setText('tokStatus', 'The readout service is not answering. Nothing below is current.');
      paintMajors(null);
    });
}

tick();
setInterval(tick, POLL_MS);
/* Coming back to a backgrounded tab should not show a five-minute-old price
 * for thirty seconds. */
document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
})();
