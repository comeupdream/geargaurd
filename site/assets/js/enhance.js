/* =============================================================================
 * enhance.js — progressive enhancement for the GEAR GUARD GARY deck.
 *
 * Three jobs, all of them optional by design: with JavaScript off the page is
 * still a complete, readable document — the charge numbers render as static
 * outlines and the gauges render as empty dials with their labels intact.
 *
 *   1. The charge bar under the sticky nav (reading progress as state of charge)
 *   2. The bottom-up FILL on the big section numbers
 *   3. A procedural SVG gauge cluster, exposed as GG.gauge() for token.js
 *
 * Ported from XAT Racing's enhance.js, including the one non-obvious bit of
 * tuning worth keeping — see the fill curve below.
 * ===========================================================================*/
(function () {
'use strict';

var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
var GG = (window.GG = window.GG || {});

/* ---------- 1 + 2: charge bar and the filling numbers --------------------- */
var bar = document.createElement('div');
bar.className = 'charge-progress';
bar.setAttribute('aria-hidden', 'true');
bar.innerHTML = '<i></i>';
/* Inside the sticky nav, so `top: 100%` rides its REAL height. A hard-coded
 * pixel offset strands the bar mid-header the moment the nav wraps on a
 * narrow screen. */
(document.querySelector('.topnav') || document.body).appendChild(bar);
var barFill = bar.firstChild;
var liveries = Array.prototype.slice.call(document.querySelectorAll('.livery'));
var ticking = false;

function paintScroll() {
  ticking = false;
  var doc = document.documentElement;
  var max = doc.scrollHeight - window.innerHeight;
  var k = max > 0 ? Math.min(1, window.scrollY / max) : 0;
  barFill.style.transform = 'scaleX(' + k.toFixed(4) + ')';

  if (reduce) return;
  /* The fill must COMPLETE while the number is still front-and-centre. A
   * curve that only finishes as the glyph reaches the viewport TOP idles at
   * 70-85% at every normal reading position, and the tops of the digits never
   * charge — which reads as a rendering bug rather than a design. So: starts
   * as the number enters from below, done by the time its top reaches
   * mid-viewport. */
  liveries.forEach(function (el) {
    var r = el.getBoundingClientRect();
    var fill = (window.innerHeight - r.top - r.height * 0.2) / (window.innerHeight * 0.5);
    el.style.setProperty('--fill', Math.max(0, Math.min(1, fill)).toFixed(3));
  });
}
addEventListener('scroll', function () {
  if (!ticking) { ticking = true; requestAnimationFrame(paintScroll); }
}, { passive: true });
addEventListener('resize', paintScroll, { passive: true });
paintScroll();

/* ---------- 3: procedural gauges ------------------------------------------
 * A 240-degree sweep dial drawn as SVG arcs. No chart library — the page has
 * a no-dependency convention and one dial does not earn a bundle.
 *
 * Every gauge carries its VALUE AS TEXT under the needle. A dial you have to
 * eyeball against tick marks is decoration; a dial with the number on it is a
 * readout. The dial is the glance, the text is the answer. */
var SWEEP = 240, START = 240;
/* START is measured CLOCKWISE FROM 12 O'CLOCK. 240 puts the zero end at
 * 8 o'clock and the full end at 4 o'clock, leaving the 120-degree gap
 * centred on the BOTTOM where the value text sits. Starting at 150 (the
 * first attempt) puts the gap on the RIGHT and the dial reads as a stray
 * letter C rather than a gauge. */

function polar(cx, cy, r, deg) {
  var a = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function arcPath(cx, cy, r, from, to) {
  var a = polar(cx, cy, r, from), b = polar(cx, cy, r, to);
  var large = Math.abs(to - from) > 180 ? 1 : 0;
  return 'M' + a[0].toFixed(2) + ' ' + a[1].toFixed(2) +
         ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + b[0].toFixed(2) + ' ' + b[1].toFixed(2);
}

/**
 * Draw or update one gauge.
 * @param {Element} host   the .gauge container
 * @param {number|null} v  0..1, or null for "no reading" (NOT zero — a dark
 *                         feed and an empty pool are different facts)
 * @param {string} text    the value as text, e.g. "$41,200" or "--"
 * @param {string} tone    css color for the filled arc
 */
GG.gauge = function (host, v, text, tone) {
  if (!host) return;
  var S = 118, cx = S / 2, cy = S / 2, r = 44;
  var known = typeof v === 'number' && isFinite(v);
  var k = known ? Math.max(0, Math.min(1, v)) : 0;
  var end = START + SWEEP * k;
  var ticks = '';
  for (var i = 0; i <= 8; i++) {
    var d = START + SWEEP * (i / 8);
    var p1 = polar(cx, cy, r + 5, d), p2 = polar(cx, cy, r + (i % 2 ? 8 : 10), d);
    ticks += '<line x1="' + p1[0].toFixed(1) + '" y1="' + p1[1].toFixed(1) +
             '" x2="' + p2[0].toFixed(1) + '" y2="' + p2[1].toFixed(1) +
             '" stroke="rgba(143,160,153,.35)" stroke-width="1"/>';
  }
  var needle = polar(cx, cy, r - 7, end);
  host.querySelector('.dial').innerHTML =
    '<svg viewBox="0 0 ' + S + ' ' + S + '" width="' + S + '" height="' + S + '" role="img" aria-label="' + text + '">' +
    ticks +
    '<path d="' + arcPath(cx, cy, r, START, START + SWEEP) + '" fill="none" stroke="#232d28" stroke-width="7" stroke-linecap="round"/>' +
    (known && k > 0.001
      ? '<path d="' + arcPath(cx, cy, r, START, end) + '" fill="none" stroke="' + tone + '" stroke-width="7" stroke-linecap="round"/>'
      : '') +
    (known
      ? '<line x1="' + cx + '" y1="' + cy + '" x2="' + needle[0].toFixed(1) + '" y2="' + needle[1].toFixed(1) +
        '" stroke="' + tone + '" stroke-width="2" stroke-linecap="round"/>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="3" fill="' + tone + '"/>'
      : '') +
    /* Below the two arc ends (which land at cy+22), not between them. */
    '<text x="' + cx + '" y="' + (cy + 34) + '" text-anchor="middle" fill="#e7ede9" ' +
    'font-family="JetBrains Mono, ui-monospace, monospace" font-size="13" font-weight="700">' +
    text.replace(/[<>&]/g, '') + '</text>' +
    '</svg>';
};

/* Paint every gauge as "no reading" up front, so the cluster is honest before
 * the first fetch lands instead of showing a zero it has not measured. */
document.querySelectorAll('.gauge').forEach(function (g) { GG.gauge(g, null, '--', '#8fa099'); });

/* ---------- 4: copy the contract address -----------------------------------
 * Two paths on purpose. navigator.clipboard is the good one, but it only
 * exists in a SECURE CONTEXT — so it is missing over plain http, which is
 * exactly how someone previewing the built site on a LAN address will load
 * it, and a dead copy button on a token page is worse than no button. The
 * execCommand fallback works there.
 *
 * The address is read from the DOM rather than duplicated here: one copy of
 * the string in the page means the button can never hand out a different
 * address from the one on screen, which is the whole failure mode worth
 * engineering against. */
var caBtn = document.getElementById('caCopy');
var caText = document.getElementById('caText');
var caAct = document.getElementById('caAct');

function legacyCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  /* Off-screen but still focusable — display:none would not be selectable. */
  ta.style.cssText = 'position:fixed;top:-9999px;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  var ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  document.body.removeChild(ta);
  return ok;
}

if (caBtn && caText && caAct) {
  var caTimer = null;
  caBtn.addEventListener('click', function () {
    var text = caText.textContent.trim();
    var settle = function (ok) {
      caBtn.classList.toggle('done', ok);
      caBtn.classList.toggle('failed', !ok);
      /* On failure, say what to do instead — "Failed" alone leaves the visitor
       * with a 42-character string and no next step. */
      caAct.textContent = ok ? 'Copied' : 'Select it';
      clearTimeout(caTimer);
      caTimer = setTimeout(function () {
        caBtn.classList.remove('done', 'failed');
        caAct.textContent = 'Copy';
      }, 2200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { settle(true); },
                                              function () { settle(legacyCopy(text)); });
    } else {
      settle(legacyCopy(text));
    }
  });
}

/* ---------- year stamp ----------------------------------------------------- */
var yr = document.getElementById('yr');
if (yr) yr.textContent = new Date().getFullYear();
})();
