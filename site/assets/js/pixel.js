/* =============================================================================
 * pixel.js — the shared pixel-art engine.
 *
 * pad.js (Gary on the dash screen) and corner.js (mind-blown Gary in the
 * corner) both draw the same character, so they share one rasteriser. It is
 * deliberately tiny: a byte grid of palette indices, four integer-only shape
 * helpers, a seeded PRNG for the boil, and a blit. Everything a sprite is
 * built from lives here; everything about a PARTICULAR sprite lives in its
 * own file.
 *
 * THE MOUND. The single most important helper is mound(): the character's
 * head is not a circle. Look at the reference and it is a tapered shaggy
 * mass, narrow at the top where the headband sits and widening continuously
 * into the shoulders — head and body are ONE silhouette. The first pass drew
 * an ellipse for the head and an ellipse for the torso, and the result read
 * as a snowman. mound() draws a trapezoid with a rounded top and a shaggy,
 * boiling edge, and both Garys are built on it.
 * ===========================================================================*/
(function () {
'use strict';

/* Deterministic PRNG. The boil must be reproducible per frame — jitter that
 * is genuinely random flickers instead of cycling, and reads as noise rather
 * than as a drawn line. */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Make a pixel surface bound to a canvas.
 * @param {HTMLCanvasElement} cv
 * @param {number} W  cells across
 * @param {number} H  cells down
 * @param {number} S  device pixels per cell
 * @param {Array<string|null>} PAL  palette; index 0 must be null (transparent)
 * @param {Object} [alpha]  optional { paletteIndex: alpha } for translucent inks
 */
function make(cv, W, H, S, PAL, alpha) {
  var ctx = cv.getContext('2d', { alpha: true });
  cv.width = W * S;
  cv.height = H * S;
  var grid = new Uint8Array(W * H);
  var INK = 1;
  alpha = alpha || {};

  function px(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    if (c) grid[y * W + x] = c;
  }
  function get(x, y) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return 0;
    return grid[y * W + x];
  }
  function hline(x0, x1, y, c) { for (var x = x0; x <= x1; x++) px(x, y, c); }
  function rect(x0, y0, x1, y1, c) { for (var y = y0; y <= y1; y++) hline(x0, x1, y, c); }
  function disc(cx, cy, r, c) {
    for (var y = -r; y <= r; y++) {
      var w = Math.floor(Math.sqrt(r * r - y * y));
      hline(cx - w, cx + w, cy + y, c);
    }
  }
  /* A small filled oval — the contained mouth, the eyes. */
  function oval(cx, cy, rx, ry, c) {
    for (var y = -ry; y <= ry; y++) {
      var k = Math.sqrt(Math.max(0, 1 - (y * y) / ((ry + 0.5) * (ry + 0.5))));
      var w = Math.round(rx * k);
      hline(cx - w, cx + w, cy + y, c);
    }
  }

  /**
   * The mound: a tapered shaggy mass with a rounded top.
   * Half-width runs from wTop at yTop to wBot at yBot on an eased curve, each
   * row nudged outward by 0-2 cells (the boil), outline on the jittered edge.
   * The top is capped with discs so it is a soft dome, not a flat cut.
   */
  function mound(cx, yTop, yBot, wTop, wBot, seed, fill) {
    var rnd = mulberry32(seed);
    var n = yBot - yTop;
    for (var y = yTop; y <= yBot; y++) {
      var t = (y - yTop) / Math.max(1, n);
      var e = t * t * (3 - 2 * t);                       /* smoothstep        */
      var w = Math.round(wTop + (wBot - wTop) * e);
      var jl = Math.floor(rnd() * 2.7), jr = Math.floor(rnd() * 2.7);
      var x0 = cx - w - jl, x1 = cx + w + jr;
      hline(x0, x1, y, fill);
      px(x0, y, INK); px(x1, y, INK);
      /* Shaggy tufts: every few rows a 1-2 cell spike past the edge, so the
       * silhouette has hair rather than just a wobbly line. */
      if (rnd() > 0.62) { px(x0 - 1, y, INK); px(x0 - 1, y - 1, fill); }
      if (rnd() > 0.62) { px(x1 + 1, y, INK); px(x1 + 1, y - 1, fill); }
    }
    /* Dome the top with three overlapping discs, then re-ink their crown. */
    var r = Math.max(2, Math.round(wTop * 0.9));
    disc(cx, yTop + r - 1, r, fill);
    disc(cx - Math.round(wTop * 0.55), yTop + r, r - 1, fill);
    disc(cx + Math.round(wTop * 0.55), yTop + r, r - 1, fill);
    var top = yTop - 1;
    for (var x = cx - wTop - 1; x <= cx + wTop + 1; x++) {
      for (var yy = top; yy <= yTop + r; yy++) {
        if (get(x, yy) === fill && !get(x, yy - 1)) { px(x, yy - 1, INK); break; }
      }
    }
    hline(cx - Math.round(wBot * 0.7), cx + Math.round(wBot * 0.7), yBot + 1, INK);
  }

  /* Outline every `fill` cell in a box that has a transparent 4-neighbour.
   * Scoped to a box rather than the whole grid, because a full-grid pass
   * would re-outline the body each frame and thicken it every time. */
  function outlineBox(x0, y0, x1, y1, fill) {
    var edge = [];
    for (var y = Math.max(1, y0); y <= Math.min(H - 2, y1); y++) {
      for (var x = Math.max(1, x0); x <= Math.min(W - 2, x1); x++) {
        if (grid[y * W + x] !== fill) continue;
        if (!grid[(y - 1) * W + x] || !grid[(y + 1) * W + x] ||
            !grid[y * W + x - 1] || !grid[y * W + x + 1]) edge.push(y * W + x);
      }
    }
    for (var i = 0; i < edge.length; i++) grid[edge[i]] = INK;
  }

  /* A limb: discs walked along a path so it stays chunky at the elbow, then
   * an outline pass over just the box it touched, then a mitt. */
  function limb(pts, r, fill, seed) {
    var minx = W, maxx = 0, miny = H, maxy = 0, i;
    for (i = 0; i < pts.length; i++) {
      disc(pts[i][0], pts[i][1], r, fill);
      minx = Math.min(minx, pts[i][0] - r - 2); maxx = Math.max(maxx, pts[i][0] + r + 2);
      miny = Math.min(miny, pts[i][1] - r - 2); maxy = Math.max(maxy, pts[i][1] + r + 2);
    }
    outlineBox(minx, miny, maxx, maxy, fill);
    var last = pts[pts.length - 1];
    disc(last[0], last[1], r + 1, fill);
    var rnd = mulberry32(seed);
    for (var a = 0; a < 10; a++) {
      var th = a / 10 * Math.PI * 2;
      if (rnd() > 0.45) {
        px(last[0] + Math.round(Math.cos(th) * (r + 2)),
           last[1] + Math.round(Math.sin(th) * (r + 2)), INK);
      }
    }
  }

  function clear() { grid.fill(0); }

  function blit() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var c = grid[y * W + x];
        if (!c) continue;
        ctx.fillStyle = PAL[c];
        ctx.globalAlpha = alpha[c] !== undefined ? alpha[c] : 1;
        ctx.fillRect(x * S, y * S, S, S);
      }
    }
    ctx.globalAlpha = 1;
  }

  return {
    W: W, H: H, S: S, grid: grid, ctx: ctx,
    px: px, get: get, hline: hline, rect: rect, disc: disc, oval: oval,
    mound: mound, limb: limb, outlineBox: outlineBox, clear: clear, blit: blit
  };
}

window.GGPX = { make: make, rng: mulberry32 };
})();
