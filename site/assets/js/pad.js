/* =============================================================================
 * pad.js — THE PAD: an in-dash display with a pixel Gary living on it.
 *
 * Every pixel is computed here. No sprite sheet, no image file, no library —
 * the same rule the wireframe rig follows, for the same reason: an asset you
 * generate can be re-tuned by changing a number, and one you paste can only
 * be redrawn.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS RASTERISED RATHER THAN DRAWN AS VECTORS
 *
 * A pixel character is not "a small vector drawing". It is a grid, and it
 * reads as one only if every edge lands on an integer boundary. So the sprite
 * is rasterised into a W x H byte grid of palette indices and then blitted as
 * S x S blocks. Nothing is ever drawn at a fractional coordinate, which is
 * what keeps the silhouette crisp at any scale instead of going soft the
 * moment the device pixel ratio is not 1.
 *
 * ---------------------------------------------------------------------------
 * THE THREE THINGS THAT MAKE HIM READ AS ALIVE
 *
 *   1. THE BOIL. Hand-drawn animation redraws its own outline every frame, so
 *      the line never sits perfectly still. Here the fur edge is re-jittered
 *      from a seeded PRNG on a 3-frame cycle — the same trick, and the single
 *      highest-value thing in this file. Without it he is a sticker; with it
 *      he is a character. It costs about ten lines.
 *   2. OVERLAPPING CYCLES. Breathing, blinking and waving all run on
 *      different, deliberately non-harmonic periods. Sync them and the loop
 *      becomes obvious within seconds; leave them coprime and the eye never
 *      catches the repeat.
 *   3. ANTICIPATION. The wave dips before it lifts. Two frames of the
 *      opposite direction before a move is the oldest trick in animation and
 *      it is what separates "the arm changed position" from "he waved".
 *
 * Frame rate is deliberately 10fps, not 60. Pixel art animated smoothly stops
 * looking like pixel art — the steps ARE the medium.
 * ===========================================================================*/
(function () {
'use strict';

var cv = document.getElementById('padGary');
if (!cv) return;
var ctx = cv.getContext('2d', { alpha: true });
var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---- grid ---------------------------------------------------------------- */
var W = 46, H = 48, S = 4;              /* cells across, down, and pixel size */
cv.width = W * S;
cv.height = H * S;

/* Palette. Index 0 is transparent; everything else is a flat colour, because
 * a pixel palette with gradients in it is just a small photograph. */
var PAL = [
  null,        /* 0 transparent            */
  '#17140c',   /* 1 outline                */
  '#f5a623',   /* 2 fur base               */
  '#ffc457',   /* 3 fur highlight          */
  '#d6870d',   /* 4 fur shade              */
  '#2e9e8f',   /* 5 band / shorts teal     */
  '#f2f2f0',   /* 6 white                  */
  '#e8552e',   /* 7 vest                   */
  '#c7401f',   /* 8 vest shade             */
  '#ffffff',   /* 9 teeth / eye glint      */
  '#1f1b12'    /* 10 soft shadow           */
];
var T = 0, INK = 1, FUR = 2, LIT = 3, SHD = 4, TEAL = 5, WHT = 6,
    VEST = 7, VESTD = 8, TEETH = 9, SOFT = 10;

var grid = new Uint8Array(W * H);

/* ---- raster helpers ------------------------------------------------------
 * Deliberately tiny and integer-only. Every shape in the character is built
 * from these four, which is what keeps the whole sprite editable by changing
 * numbers rather than by redrawing. */
function px(x, y, c) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  if (c) grid[y * W + x] = c;
}
function hline(x0, x1, y, c) { for (var x = x0; x <= x1; x++) px(x, y, c); }
function rect(x0, y0, x1, y1, c) { for (var y = y0; y <= y1; y++) hline(x0, x1, y, c); }
function disc(cx, cy, r, c) {
  for (var y = -r; y <= r; y++) {
    var w = Math.floor(Math.sqrt(r * r - y * y));
    hline(cx - w, cx + w, cy + y, c);
  }
}

/* Deterministic PRNG. The boil must be reproducible per frame — random jitter
 * that is genuinely random flickers instead of cycling, and reads as noise
 * rather than as a drawn line. */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ---- the character -------------------------------------------------------
 * Built bottom-up so later parts overpaint earlier ones, exactly like cel
 * layers: legs, body, vest, arms, head, face. */

/* A shaggy blob: an ellipse whose every row is nudged out by 0-2 cells, with
 * the outline drawn on the jittered edge. `seed` is the boil. */
function furBlob(cx, cy, rx, ry, seed, fill) {
  var rnd = mulberry32(seed);
  for (var y = -ry; y <= ry; y++) {
    var k = Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)));
    var w = Math.round(rx * k);
    if (w <= 0) continue;
    var jl = Math.floor(rnd() * 2.6);
    var jr = Math.floor(rnd() * 2.6);
    var x0 = cx - w - jl, x1 = cx + w + jr;
    hline(x0, x1, cy + y, fill);
    px(x0, cy + y, INK);
    px(x1, cy + y, INK);
  }
  /* Cap the top and bottom so the silhouette closes. */
  var topJ = Math.floor(mulberry32(seed + 91)() * 2);
  hline(cx - Math.round(rx * 0.55), cx + Math.round(rx * 0.55), cy - ry - 1 + topJ, INK);
  hline(cx - Math.round(rx * 0.6), cx + Math.round(rx * 0.6), cy + ry + 1, INK);
}

/* An arm: discs walked along a path, so it stays chunky and readable instead
 * of thinning to a line at the elbow. */
function arm(pts, r, seed) {
  for (var i = 0; i < pts.length; i++) {
    disc(pts[i][0], pts[i][1], r, FUR);
  }
  /* Outline pass: anything FUR with a transparent neighbour becomes INK. */
  outlineRegion(pts, r + 2);
  /* The mitt at the end. */
  var last = pts[pts.length - 1];
  disc(last[0], last[1], r + 1, FUR);
  var rnd = mulberry32(seed);
  for (var a = 0; a < 10; a++) {
    var th = a / 10 * Math.PI * 2;
    if (rnd() > 0.45) {
      px(last[0] + Math.round(Math.cos(th) * (r + 2)),
         last[1] + Math.round(Math.sin(th) * (r + 2)), INK);
    }
  }
}
/* Outline only the neighbourhood the arm touched — outlining the whole grid
 * every frame would also re-outline the body and thicken it each pass. */
function outlineRegion(pts, pad) {
  var minx = W, maxx = 0, miny = H, maxy = 0, i;
  for (i = 0; i < pts.length; i++) {
    minx = Math.min(minx, pts[i][0] - pad); maxx = Math.max(maxx, pts[i][0] + pad);
    miny = Math.min(miny, pts[i][1] - pad); maxy = Math.max(maxy, pts[i][1] + pad);
  }
  var edge = [];
  for (var y = Math.max(1, miny); y <= Math.min(H - 2, maxy); y++) {
    for (var x = Math.max(1, minx); x <= Math.min(W - 2, maxx); x++) {
      if (grid[y * W + x] !== FUR) continue;
      if (!grid[(y - 1) * W + x] || !grid[(y + 1) * W + x] ||
          !grid[y * W + x - 1] || !grid[y * W + x + 1]) edge.push(y * W + x);
    }
  }
  for (i = 0; i < edge.length; i++) grid[edge[i]] = INK;
}

/* Wave keyframes. Note the first entry is BELOW the rest position: that is
 * the anticipation dip, and removing it makes the wave read as a jump cut. */
var WAVE = [
  [[35, 30], [38, 28], [40, 27]],                    /* dip (anticipation)   */
  [[35, 29], [39, 24], [41, 20]],                    /* lift                 */
  [[35, 28], [40, 21], [43, 14]],                    /* up                   */
  [[35, 28], [39, 20], [41, 12]],                    /* over                 */
  [[35, 28], [40, 21], [43, 14]],                    /* back                 */
  [[35, 29], [39, 24], [41, 20]]                     /* down                 */
];
var REST_R = [[35, 30], [38, 32], [39, 35]];
var REST_L = [[13, 30], [10, 32], [9, 35]];

function drawGary(f, st) {
  grid.fill(0);
  var boil = f % 3;                       /* the 3-frame outline cycle       */
  var breathe = st.breathe;               /* -1 | 0 | +1                      */

  /* ---- shadow on the screen floor ---- */
  rect(12, 46, 34, 46, SOFT);
  rect(14, 47, 32, 47, SOFT);

  /* ---- legs + boots ---- */
  furBlob(19, 40, 4, 5, 700 + boil, FUR);
  furBlob(28, 40, 4, 5, 730 + boil, FUR);
  rect(15, 43, 22, 45, TEAL); px(15, 43, INK); px(22, 43, INK);
  rect(25, 43, 32, 45, TEAL); px(25, 43, INK); px(32, 43, INK);

  /* ---- shorts ---- */
  rect(13, 34, 33, 42, TEAL);
  hline(13, 33, 33, INK); hline(13, 33, 43, INK);
  for (var y = 34; y <= 42; y++) { px(12, y, INK); px(34, y, INK); }
  rect(26, 36, 31, 40, TEAL); px(26, 36, INK); px(31, 36, INK);   /* pocket   */
  hline(26, 31, 36, INK); hline(26, 31, 40, INK);

  /* ---- torso (boiling fur silhouette) ---- */
  furBlob(23, 27 + breathe, 11, 9 + (breathe > 0 ? 1 : 0), 100 + boil, FUR);

  /* ---- vest over the torso ---- */
  var vy = 21 + breathe;
  rect(13, vy, 20, vy + 12, VEST);
  rect(26, vy, 33, vy + 12, VEST);
  rect(21, vy, 25, vy + 12, VESTD);            /* the open zip channel        */
  for (var q = 0; q < 5; q++) {                /* quilting                    */
    hline(13, 20, vy + 2 + q * 2, VESTD);
    hline(26, 33, vy + 2 + q * 2, VESTD);
  }
  hline(13, 33, vy - 1, INK);
  hline(13, 33, vy + 13, INK);
  for (y = vy; y <= vy + 12; y++) { px(12, y, INK); px(34, y, INK); px(21, y, INK); px(25, y, INK); }

  /* ---- arms ---- */
  arm(REST_L, 3, 400 + boil);
  arm(st.wave >= 0 ? WAVE[st.wave] : REST_R, 3, 420 + boil);

  /* ---- head ---- */
  var hy = 13 + breathe;
  furBlob(23, hy, 12, 10, 200 + boil, FUR);
  /* a few highlight tufts, so the fur is not one flat mass */
  var rnd = mulberry32(300 + boil);
  for (var i = 0; i < 26; i++) {
    var ax = 12 + Math.floor(rnd() * 22), ay = hy - 8 + Math.floor(rnd() * 6);
    if (grid[ay * W + ax] === FUR) px(ax, ay, LIT);
  }

  /* ---- headband ---- */
  rect(11, hy - 5, 35, hy - 1, TEAL);
  hline(11, 35, hy - 3, WHT);
  hline(11, 35, hy - 6, INK);
  hline(11, 35, hy, INK);
  for (y = hy - 5; y <= hy - 1; y++) { px(10, y, INK); px(36, y, INK); }

  /* ---- face ----
   * The face is most of what makes a mascot read, so it is the part that
   * was redrawn after the first render. Two rules came out of that:
   *   - eyes are plain 2x3 dots with NO glint. A glint inside a dark block
   *     reads as a pupil in a narrowed eye, i.e. a squint. Solid dots read
   *     as open and friendly.
   *   - the grin is WIDE and open, flat on top with the tooth row under
   *     the lip and a curved bottom — a "D" on its side. A small dark box
   *     with two teeth in it read as fangs. */
  if (st.blink) {
    hline(17, 18, hy + 3, INK);
    hline(28, 29, hy + 3, INK);
  } else {
    rect(17, hy + 1, 18, hy + 3, INK);
    rect(28, hy + 1, 29, hy + 3, INK);
  }
  hline(16, 30, hy + 6, INK);                          /* upper lip           */
  hline(16, 30, hy + 7, TEETH);                        /* the tooth row       */
  px(19, hy + 7, INK); px(23, hy + 7, INK); px(27, hy + 7, INK);   /* gaps  */
  px(16, hy + 7, INK); px(30, hy + 7, INK);
  hline(16, 30, hy + 8, INK);                          /* open mouth, curving */
  hline(17, 29, hy + 9, INK);
  hline(18, 28, hy + 10, INK);
  hline(20, 26, hy + 11, INK);
  hline(22, 24, hy + 12, INK);
}

/* ---- blit ---------------------------------------------------------------- */
function blit() {
  ctx.clearRect(0, 0, cv.width, cv.height);
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var c = grid[y * W + x];
      if (!c) continue;
      ctx.fillStyle = PAL[c];
      ctx.globalAlpha = c === SOFT ? 0.16 : 1;
      ctx.fillRect(x * S, y * S, S, S);
    }
  }
  ctx.globalAlpha = 1;
}

/* ---- the loop -----------------------------------------------------------
 * Cycle lengths are coprime on purpose (37 / 61 / 97 frames). Harmonic
 * periods make the loop legible in about five seconds; these never line up
 * inside the time anyone looks at it. */
var frame = 0;
var st = { breathe: 0, blink: false, wave: -1 };

function step() {
  frame++;
  st.breathe = [0, 1, 1, 0, -1, -1][Math.floor(frame / 5) % 6];
  var b = frame % 61;
  st.blink = (b === 0 || b === 1 || b === 34);        /* a double-blink       */
  var w = frame % 97;
  st.wave = (w < WAVE.length) ? w : -1;
  drawGary(frame, st);
  blit();
}

if (reduce) {
  /* Still a character, just not a moving one. */
  drawGary(0, { breathe: 0, blink: false, wave: 2 });
  blit();
} else {
  step();
  setInterval(function () { if (!document.hidden) step(); }, 100);
}

/* ---- live bindings -------------------------------------------------------
 * The pad shows real numbers or nothing. A dash display with a decorative
 * readout on it teaches the visitor that none of the page's numbers mean
 * anything, which is the opposite of what this deck is for. */
function fmtPct(n) {
  return (typeof n === 'number' && isFinite(n)) ? (n >= 0 ? '+' : '') + n.toFixed(1) + '%' : '--';
}
function paint(store) {
  var stat = document.getElementById('padStat');
  var statK = document.getElementById('padStatK');
  var foot = document.getElementById('padFoot');
  var live = store && store.status === 'live' && store.pair;
  if (stat) {
    stat.textContent = live ? fmtPct(parseFloat(store.pair.priceChange &&
                                                store.pair.priceChange.h24)) : '--';
    stat.className = live && parseFloat((store.pair.priceChange || {}).h24) < 0 ? 'down' : '';
  }
  if (statK) statK.textContent = live ? '24h · $GARY' : 'awaiting feed';
  if (foot) {
    foot.textContent = live ? 'Gear Guard · armed' : 'Gear Guard · standing by';
  }
}
if (window.GGMARKET) { window.GGMARKET.onUpdate(paint); paint(window.GGMARKET.get()); }
else paint(null);
})();
