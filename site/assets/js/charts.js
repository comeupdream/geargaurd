/* =============================================================================
 * charts.js — the price tape, the volume bars, and the flow meter.
 *
 * Hand-rolled SVG. No chart library: the site has a no-dependency convention,
 * and three charts do not earn a bundle.
 *
 * DATA INK IS NOT DECK CHROME. The deck's compass yellow, charge green and
 * alloy blue are *status and chrome* colours — they say "live", "go", "this
 * is a surface". Series ink is a separate, VALIDATED set (see VIZ below), so
 * a line on a chart never gets mistaken for a status light. This is the one
 * rule most likely to get broken by someone "matching the theme"; don't.
 *
 * The palette below was checked with the dataviz validator against this
 * page's card surface (#111714) in dark mode:
 *
 *   lightness band  PASS      chroma floor        PASS
 *   normal-vision   PASS 20.9 contrast vs surface PASS (all >= 3:1)
 *   CVD separation  WARN 6.5  aqua vs red (protan)
 *
 * That WARN is legal only with secondary encoding, so the buys/sells meter
 * ALWAYS ships direct labels and a 2px gap between the two segments — colour
 * is never the only thing separating them. If you restyle that meter, the
 * labels are not optional decoration.
 *
 * Every chart has a TABLE TWIN behind a disclosure. A value that only exists
 * inside a hover tooltip is a value keyboard and screen-reader users do not
 * have, and one nobody can copy.
 * ===========================================================================*/
(function () {
'use strict';

var GG = (window.GG = window.GG || {});

/* Validated series ink — see the header. */
var VIZ = {
  price: '#3987e5',   /* slot 1, blue  — the price line          */
  volume: '#199e70',  /* slot 3, aqua  — volume bars, and BUYS   */
  sell: '#e66767',    /* slot 8, red   — SELLS                   */
  grid: 'rgba(143,160,153,.16)',
  axis: '#8fa099',
  ink: '#e7ede9'
};
var SVGNS = 'http://www.w3.org/2000/svg';

function el(name, attrs, text) {
  var n = document.createElementNS(SVGNS, name);
  for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
  if (text !== undefined) n.textContent = text;
  return n;
}
function fmtUsd(v) {
  if (typeof v !== 'number' || !isFinite(v)) return '--';
  if (v >= 1000) return '$' + Math.round(v).toLocaleString();
  if (v >= 1) return '$' + v.toFixed(3);
  return '$' + v.toPrecision(4).replace(/0+$/, '').replace(/\.$/, '');
}
function fmtCompact(v) {
  if (typeof v !== 'number' || !isFinite(v)) return '--';
  var u = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (var i = 0; i < u.length; i++) if (Math.abs(v) >= u[i][0]) return '$' + (v / u[i][0]).toFixed(1) + u[i][1];
  return '$' + Math.round(v);
}
function fmtTime(sec, range) {
  var d = new Date(sec * 1000);
  var day = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (range === '30d' || range === '90d') return day;
  return day + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/* Rounded "nice" ticks, so the axis reads 0.004 / 0.006 / 0.008 rather than
 * 0.004182 / 0.005731 / 0.007280. An axis whose labels are as precise as the
 * data is an axis nobody can read at a glance. */
function niceTicks(min, max, count) {
  if (!(max > min)) return [min];
  var raw = (max - min) / count;
  var mag = Math.pow(10, Math.floor(Math.log10(raw)));
  var norm = raw / mag;
  var step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  var out = [], t = Math.ceil(min / step) * step;
  for (; t <= max + step * 0.001; t += step) out.push(t);
  return out.length >= 2 ? out : [min, max];
}

/* ---------------------------------------------------------------------------
 * The price tape + volume bars.
 *
 * Two charts stacked on ONE shared x-axis — never a dual-axis chart. Price in
 * dollars and volume in dollars-per-candle are different scales, and putting
 * them on two y-axes in one frame lets you slide the two series past each
 * other until any story you like appears. Stacked small multiples cost a
 * little height and cannot lie that way.
 * ------------------------------------------------------------------------- */
GG.priceChart = function (host, candles, range, opts) {
  opts = opts || {};
  host.textContent = '';

  if (!candles || candles.length < 2) {
    var empty = document.createElement('p');
    empty.className = 'chart-empty mono';
    empty.textContent = opts.detail || 'No candle history to chart yet.';
    host.appendChild(empty);
    return;
  }

  /* PIXEL units, measured from the container — NOT an abstract viewBox scaled
   * with preserveAspectRatio="none". That stretch is fine for paths and fatal
   * for text: it scales glyphs horizontally, so the axis labels come out
   * smeared to a different width on every screen. Measuring costs one layout
   * read per draw and makes every unit below mean exactly one CSS pixel. */
  var W = Math.max(320, Math.round(host.getBoundingClientRect().width || 720));
  var PRICE_H = 150, VOL_H = 46, GAP = 14, AX = 20;
  var H = PRICE_H + GAP + VOL_H + AX;
  var PAD_L = 58, PAD_R = 14;
  var plotW = W - PAD_L - PAD_R;

  var closes = candles.map(function (c) { return c.c; });
  var lo = Math.min.apply(null, candles.map(function (c) { return c.l; }));
  var hi = Math.max.apply(null, candles.map(function (c) { return c.h; }));
  if (lo === hi) { lo = lo * 0.98; hi = hi * 1.02; }          /* a flat series still needs a band */
  var pad = (hi - lo) * 0.12;
  lo -= pad; hi += pad;
  var volMax = Math.max.apply(null, candles.map(function (c) { return c.v || 0; })) || 1;

  var n = candles.length;
  var x = function (i) { return PAD_L + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW); };
  var yP = function (v) { return PRICE_H - ((v - lo) / (hi - lo)) * PRICE_H; };
  var yV = function (v) { return PRICE_H + GAP + VOL_H - (v / volMax) * VOL_H; };

  var svg = el('svg', {
    viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'chart-svg',
    role: 'img',
    'aria-label': 'Price and volume over the last ' + range + '. The table below has every value.'
  });

  /* --- grid + y axis (recessive: hairline, muted, behind everything) --- */
  var ticks = niceTicks(lo, hi, 4);
  ticks.forEach(function (t) {
    svg.appendChild(el('line', { x1: PAD_L, x2: W - PAD_R, y1: yP(t), y2: yP(t),
      stroke: VIZ.grid, 'stroke-width': 1 }));
    svg.appendChild(el('text', { x: PAD_L - 8, y: yP(t) + 3.5, 'text-anchor': 'end',
      class: 'chart-tick' }, fmtUsd(t)));
  });

  /* --- price: area under the line, then the line --- */
  var dLine = '', dArea = '';
  candles.forEach(function (c, i) {
    dLine += (i ? 'L' : 'M') + x(i).toFixed(2) + ' ' + yP(c.c).toFixed(2) + ' ';
  });
  dArea = dLine + 'L' + x(n - 1).toFixed(2) + ' ' + PRICE_H + ' L' + x(0).toFixed(2) + ' ' + PRICE_H + ' Z';

  var gradId = 'ggGrad' + Math.random().toString(36).slice(2, 8);
  var defs = el('defs');
  var grad = el('linearGradient', { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.appendChild(el('stop', { offset: '0%', 'stop-color': VIZ.price, 'stop-opacity': 0.30 }));
  grad.appendChild(el('stop', { offset: '100%', 'stop-color': VIZ.price, 'stop-opacity': 0 }));
  defs.appendChild(grad);
  svg.appendChild(defs);
  svg.appendChild(el('path', { d: dArea, fill: 'url(#' + gradId + ')' }));
  svg.appendChild(el('path', { d: dLine, fill: 'none', stroke: VIZ.price,
    'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

  /* --- volume bars, on their own baseline. A 2px surface gap between
   *     neighbours, and 4px rounded data-ends anchored to the baseline. --- */
  var slot = plotW / Math.max(1, n - 1);
  var barW = Math.max(1.5, Math.min(14, slot - 2));
  candles.forEach(function (c, i) {
    var top = yV(c.v || 0);
    var h = Math.max(1, (PRICE_H + GAP + VOL_H) - top);
    svg.appendChild(el('rect', {
      x: (x(i) - barW / 2).toFixed(1), y: top.toFixed(1),
      width: barW.toFixed(1), height: h.toFixed(1),
      fill: VIZ.volume, opacity: 0.75, rx: Math.min(4, barW / 2)
    }));
  });
  svg.appendChild(el('text', { x: PAD_L - 8, y: PRICE_H + GAP + VOL_H, 'text-anchor': 'end',
    class: 'chart-tick' }, 'VOL'));

  /* --- x axis: first, middle, last. Three labels never collide, at any
   *     width, with any range. --- */
  [[0, 'start'], [Math.floor((n - 1) / 2), 'middle'], [n - 1, 'end']].forEach(function (p) {
    svg.appendChild(el('text', { x: x(p[0]), y: H - 5, 'text-anchor': p[1], class: 'chart-tick' },
      fmtTime(candles[p[0]].t, range)));
  });

  /* --- crosshair layer --- */
  var cross = el('g', { class: 'chart-cross', opacity: 0 });
  cross.appendChild(el('line', { class: 'cx-v', y1: 0, y2: PRICE_H + GAP + VOL_H,
    stroke: VIZ.axis, 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
  var dot = el('circle', { r: 4.5, fill: VIZ.price, stroke: '#111714', 'stroke-width': 2 });
  cross.appendChild(dot);
  svg.appendChild(cross);
  host.appendChild(svg);

  var tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  host.appendChild(tip);

  function at(clientX) {
    var r = svg.getBoundingClientRect();
    /* r.width can differ from W between a resize and the redraw, so scale
     * through it rather than assuming they match. */
    var px = (clientX - r.left) * (W / (r.width || W));
    return Math.max(0, Math.min(n - 1, Math.round((px - PAD_L) / plotW * (n - 1))));
  }
  function move(ev) {
    var i = at(ev.clientX), c = candles[i];
    cross.setAttribute('opacity', 1);
    cross.querySelector('.cx-v').setAttribute('x1', x(i));
    cross.querySelector('.cx-v').setAttribute('x2', x(i));
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', yP(c.c));
    tip.hidden = false;
    tip.innerHTML = '<b>' + fmtUsd(c.c) + '</b>' +
      '<span>' + fmtTime(c.t, range) + '</span>' +
      '<span>H ' + fmtUsd(c.h) + ' · L ' + fmtUsd(c.l) + '</span>' +
      '<span>Vol ' + fmtCompact(c.v) + '</span>';
    /* Flip the tooltip to the left of the cursor near the right edge so it
     * never gets clipped by the card. */
    var r = host.getBoundingClientRect();
    var px = ev.clientX - r.left;
    tip.style.left = (px > r.width - 130 ? px - 122 : px + 14) + 'px';
  }
  function leave() { cross.setAttribute('opacity', 0); tip.hidden = true; }
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', leave);

  /* --- the table twin --- */
  host.appendChild(GG.tableTwin(
    ['Time', 'Open', 'High', 'Low', 'Close', 'Volume'],
    candles.slice().reverse().map(function (c) {
      return [fmtTime(c.t, range), fmtUsd(c.o), fmtUsd(c.h), fmtUsd(c.l), fmtUsd(c.c), fmtCompact(c.v)];
    })));
};

/* ---------------------------------------------------------------------------
 * Buy/sell flow — one split bar.
 *
 * Colour alone does NOT carry this: the two counts are printed beside their
 * own segments, and a 2px gap separates the fills. The validator puts this
 * aqua/red pair in the CVD warn band, and direct labels are the mitigation
 * that makes the pair legal.
 * ------------------------------------------------------------------------- */
GG.flowMeter = function (host, txns) {
  host.textContent = '';
  if (!txns || (!txns.buys && !txns.sells)) {
    var p = document.createElement('p');
    p.className = 'chart-empty mono';
    p.textContent = 'No transaction counts reported for this pool.';
    host.appendChild(p);
    return;
  }
  var total = txns.buys + txns.sells;
  var bpct = total ? (txns.buys / total) * 100 : 50;

  var bar = document.createElement('div');
  bar.className = 'flow-bar';
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', txns.buys + ' buys and ' + txns.sells + ' sells in 24 hours');
  var b = document.createElement('i'); b.style.width = bpct + '%'; b.style.background = VIZ.volume;
  var s = document.createElement('i'); s.style.width = (100 - bpct) + '%'; s.style.background = VIZ.sell;
  bar.appendChild(b); bar.appendChild(s);

  var legend = document.createElement('div');
  legend.className = 'flow-legend mono';
  legend.innerHTML =
    '<span><i style="background:' + VIZ.volume + '"></i>BUYS <b>' + txns.buys.toLocaleString() + '</b></span>' +
    '<span class="fl-total">' + total.toLocaleString() + ' txns · 24h</span>' +
    '<span><b>' + txns.sells.toLocaleString() + '</b> SELLS<i style="background:' + VIZ.sell + '"></i></span>';

  host.appendChild(bar);
  host.appendChild(legend);
};

/* A <details> table carrying every plotted value. Collapsed by default so it
 * does not compete with the chart, present always so no number is trapped
 * inside a hover. */
GG.tableTwin = function (headers, rows) {
  var d = document.createElement('details');
  d.className = 'chart-table';
  var sum = document.createElement('summary');
  sum.textContent = 'Show the numbers (' + rows.length + ' rows)';
  d.appendChild(sum);
  var wrap = document.createElement('div');
  wrap.className = 'chart-table-scroll';
  var t = document.createElement('table');
  var thead = document.createElement('thead');
  var htr = document.createElement('tr');
  headers.forEach(function (h) { var th = document.createElement('th'); th.textContent = h; htr.appendChild(th); });
  thead.appendChild(htr); t.appendChild(thead);
  var tb = document.createElement('tbody');
  rows.forEach(function (r) {
    var tr = document.createElement('tr');
    r.forEach(function (v) { var td = document.createElement('td'); td.textContent = v; tr.appendChild(td); });
    tb.appendChild(tr);
  });
  t.appendChild(tb); wrap.appendChild(t); d.appendChild(wrap);
  return d;
};

GG.VIZ = VIZ;
GG.fmtUsd = fmtUsd;
GG.fmtCompact = fmtCompact;
})();
