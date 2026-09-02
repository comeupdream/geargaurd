/* =============================================================================
 * pad.js — THE PAD: an in-dash display with a pixel Gary living on it.
 *
 * The rasteriser lives in pixel.js; this file is only the character and the
 * screen bindings. No sprite sheet, no image file — every pixel is computed,
 * so he can be re-tuned by changing a number rather than redrawn.
 *
 * ---------------------------------------------------------------------------
 * THE SILHOUETTE, third pass — read off the full-body reference.
 *
 * He is ONE tapered shaggy mass. Narrow at the crown where the headband sits,
 * widening continuously through the face into the shoulders, with no neck and
 * no separate head. The first two passes drew a head ellipse on a torso
 * ellipse, which is a snowman, and the widest point of the face landed at eye
 * level — that is what made the head "read way off". Now the whole figure is
 * a single mound() and the vest is painted onto its lower half.
 *
 * THE MOUTH is a contained oval, well inside the face, with a tooth row
 * along its top edge. It does NOT run wall to wall: a slit across the whole
 * face splits the head into a flapping top and bottom, which is a South Park
 * Canadian and not this character.
 *
 * ---------------------------------------------------------------------------
 * THE THREE THINGS THAT MAKE HIM READ AS ALIVE
 *   1. The boil — the fur edge re-jitters from a seeded PRNG on a 3-frame
 *      cycle, the hand-drawn "boiling line". Without it he is a sticker.
 *   2. Coprime cycles — breathing (30), double-blink (61), wave (97) never
 *      line up while anyone is looking.
 *   3. Anticipation — the wave dips one frame before it lifts.
 * 10fps on purpose: pixel art animated smoothly stops looking like pixel art.
 * ===========================================================================*/
(function () {
'use strict';

var cv = document.getElementById('padGary');
if (!cv || !window.GGPX) return;
var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---- surface ------------------------------------------------------------- */
var W = 46, H = 48, S = 4;
var PAL = [
  null,        /* 0 transparent      */
  '#17140c',   /* 1 outline          */
  '#f5a623',   /* 2 fur base         */
  '#ffc457',   /* 3 fur highlight    */
  '#d6870d',   /* 4 fur shade        */
  '#2e9e8f',   /* 5 band / shorts    */
  '#f2f2f0',   /* 6 white            */
  '#e8552e',   /* 7 vest             */
  '#c7401f',   /* 8 vest shade       */
  '#ffffff'    /* 9 teeth            */
];
var INK = 1, FUR = 2, LIT = 3, SHD = 4, TEAL = 5, WHT = 6, VEST = 7, VESTD = 8, TEETH = 9;
var g = window.GGPX.make(cv, W, H, S, PAL);
var rng = window.GGPX.rng;

/* ---- layout, in one place ------------------------------------------------
 * Every band is stacked with room between it and the next. These numbers are
 * the only place the layout lives; change them here, not in the drawing.
 *   crown        2
 *   headband     6..10   (wraps the mound at its narrowest)
 *   eyes        14..17
 *   mouth       21..25   (contained oval, tooth row at 22)
 *   chest fur   26..27   (visible: the jacket is OPEN)
 *   vest        28..40
 *   shoulders  ~31       (arms grow out of the jacket, not the head)
 *   shorts      41..47   (below the pad's crop line)
 */
var CX = 23, CROWN = 2, BAND = 6, EYE = 14, MOUTH = 21, VEST_Y = 28, SHOULDER = 31;

/* Wave keyframes, from the shoulder. The first entry is BELOW rest: the
 * anticipation dip. Remove it and the wave reads as a jump cut. */
var WAVE = [
  [[37, SHOULDER + 2], [40, SHOULDER + 1], [42, SHOULDER]],
  [[37, SHOULDER + 1], [41, SHOULDER - 5], [43, SHOULDER - 10]],
  [[37, SHOULDER],     [42, SHOULDER - 9], [44, SHOULDER - 17]],
  [[37, SHOULDER],     [41, SHOULDER - 10], [42, SHOULDER - 19]],
  [[37, SHOULDER],     [42, SHOULDER - 9], [44, SHOULDER - 17]],
  [[37, SHOULDER + 1], [41, SHOULDER - 5], [43, SHOULDER - 10]]
];
var REST_R = [[37, SHOULDER + 1], [40, SHOULDER + 5], [41, SHOULDER + 9]];
var REST_L = [[9, SHOULDER + 1],  [6, SHOULDER + 5],  [5, SHOULDER + 9]];

function drawGary(f, st) {
  g.clear();
  var boil = f % 3;
  var b = st.breathe;                     /* -1 | 0 | +1                      */

  /* ---- shorts: below the crop, but they give the hem something to sit on */
  g.rect(CX - 15, VEST_Y + 13 + b, CX + 15, H - 1, TEAL);

  /* ---- THE MOUND: crown to hem, one silhouette ---- */
  g.mound(CX, CROWN + b, VEST_Y + 12 + b, 9, 17, 100 + boil, FUR);

  /* Fur shading: a darker band low on each flank so the mass has volume,
   * and highlight tufts across the crown. Both are painted only where fur
   * already is, so they never leak past the boiling edge. */
  var rnd = rng(300 + boil);
  for (var i = 0; i < 40; i++) {
    var sx = CX - 18 + Math.floor(rnd() * 37), sy = VEST_Y - 2 + Math.floor(rnd() * 12);
    if ((sx < CX - 11 || sx > CX + 11) && g.get(sx, sy) === FUR) g.px(sx, sy, SHD);
  }
  for (i = 0; i < 18; i++) {
    var hx = CX - 7 + Math.floor(rnd() * 15), hy2 = CROWN + 1 + Math.floor(rnd() * 3) + b;
    if (g.get(hx, hy2) === FUR) g.px(hx, hy2, LIT);
  }

  /* ---- vest, two halves, OPEN. Nothing is painted between them, so the
   *      chest fur shows through. Zip teeth mark the inner edges. ---- */
  var vy = VEST_Y + b;
  g.rect(CX - 15, vy, CX - 3, vy + 12, VEST);
  g.rect(CX + 3, vy, CX + 15, vy + 12, VEST);
  for (var q = 0; q < 6; q++) {
    g.hline(CX - 15, CX - 3, vy + 2 + q * 2, VESTD);
    g.hline(CX + 3, CX + 15, vy + 2 + q * 2, VESTD);
  }
  g.hline(CX - 15, CX - 3, vy - 1, INK); g.hline(CX + 3, CX + 15, vy - 1, INK);  /* collar */
  g.hline(CX - 15, CX + 15, vy + 13, INK);                                        /* hem    */
  for (var y = vy; y <= vy + 12; y++) {
    g.px(CX - 16, y, INK); g.px(CX + 16, y, INK);
    g.px(CX - 3, y, INK);  g.px(CX + 3, y, INK);
  }
  for (y = vy + 1; y <= vy + 11; y += 2) { g.px(CX - 2, y, WHT); g.px(CX + 2, y, WHT); }

  /* ---- arms, from the jacket's shoulders ---- */
  g.limb(REST_L, 3, FUR, 400 + boil);
  g.limb(st.wave >= 0 ? WAVE[st.wave] : REST_R, 3, FUR, 420 + boil);

  /* ---- headband, wrapping the mound where it is narrow ---- */
  var by = BAND + b;
  g.rect(CX - 12, by, CX + 12, by + 4, TEAL);
  g.hline(CX - 12, CX + 12, by + 2, WHT);
  g.hline(CX - 12, CX + 12, by - 1, INK);
  g.hline(CX - 12, CX + 12, by + 5, INK);
  for (y = by; y <= by + 4; y++) { g.px(CX - 13, y, INK); g.px(CX + 13, y, INK); }

  /* ---- face ----
   * Eyes: small vertical ovals, no glint. Mouth: a CONTAINED oval with the
   * tooth row along its top edge — it stays inside the face. */
  var ey = EYE + b;
  if (st.blink) {
    g.hline(CX - 7, CX - 5, ey + 2, INK);
    g.hline(CX + 5, CX + 7, ey + 2, INK);
  } else {
    g.rect(CX - 7, ey, CX - 6, ey + 3, INK);
    g.rect(CX + 6, ey, CX + 7, ey + 3, INK);
  }
  var my = MOUTH + b;
  g.oval(CX, my + 2, 5, 2, INK);                      /* the open mouth       */
  g.hline(CX - 4, CX + 4, my + 1, TEETH);             /* tooth row, inside    */
  g.px(CX - 2, my + 1, INK); g.px(CX + 1, my + 1, INK);
  g.px(CX - 5, my + 1, INK); g.px(CX + 5, my + 1, INK);
}

/* ---- the loop: coprime cycles ---- */
var frame = 0;
var st = { breathe: 0, blink: false, wave: -1 };
function step() {
  frame++;
  st.breathe = [0, 1, 1, 0, -1, -1][Math.floor(frame / 5) % 6];
  var bl = frame % 61;
  st.blink = (bl === 0 || bl === 1 || bl === 34);
  var w = frame % 97;
  st.wave = (w < WAVE.length) ? w : -1;
  drawGary(frame, st);
  g.blit();
}
if (reduce) { drawGary(0, { breathe: 0, blink: false, wave: 2 }); g.blit(); }
else { step(); setInterval(function () { if (!document.hidden) step(); }, 100); }

/* ---- live bindings: real numbers or nothing ---- */
function fmtPct(n) {
  return (typeof n === 'number' && isFinite(n)) ? (n >= 0 ? '+' : '') + n.toFixed(1) + '%' : '--';
}
function paint(store) {
  var stat = document.getElementById('padStat');
  var statK = document.getElementById('padStatK');
  var foot = document.getElementById('padFoot');
  var live = store && store.status === 'live' && store.pair;
  var ch = live ? parseFloat((store.pair.priceChange || {}).h24) : NaN;
  if (stat) { stat.textContent = live ? fmtPct(ch) : '--'; stat.className = (live && ch < 0) ? 'down' : ''; }
  if (statK) statK.textContent = live ? '24h · $GARY' : 'awaiting feed';
  if (foot) foot.textContent = live ? 'Gear Guard · armed' : 'Gear Guard · standing by';
}
if (window.GGMARKET) { window.GGMARKET.onUpdate(paint); paint(window.GGMARKET.get()); }
else paint(null);
})();
