/* =============================================================================
 * corner.js — MIND-BLOWN GARY, fixed in the lower-right corner.
 *
 * The reference: the head alone, wide-eyed, mouth a small "O", with a cream
 * cloud erupting off the crown and yellow shards flying out of it. Built on
 * the same engine and the same mound silhouette as the pad Gary, so the two
 * are visibly the same character.
 *
 * EVERYTHING HERE IS PROCEDURAL ANIMATION, not frames:
 *   - the shards are a particle system — each has an angle, a speed and an
 *     age, and is placed by arithmetic every frame. They fade the pixel-art
 *     way, by being drawn on alternate frames once old, not by alpha.
 *   - the cloud puffs by growing its disc radii for the burst frames.
 *   - speed lines radiate for the first six frames of a burst and then stop.
 *   - the eyes widen and the "O" grows at the moment of the burst.
 *
 * IT REACTS TO THE MARKET. A burst fires on its own timer, and ALSO the
 * instant the live store reports a new quote — so when the price moves, he
 * loses his mind about it. The bubble beside him carries the real 24h
 * change, or nothing. Never a decorative number.
 * ===========================================================================*/
(function () {
'use strict';

var cv = document.getElementById('cornerGary');
if (!cv || !window.GGPX) return;
var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 52x56, not 44x44: the top 16 rows and the outer 4 columns each side are
 * SKY, and the sky is where the shards live. In a canvas that was exactly
 * the character's own size, anything flying upward left the grid in two
 * frames and was clipped by the bounds check — a burst of nine shards
 * rendered as one. A particle system needs room to be a particle system. */
var W = 52, H = 56, S = 4;
var PAL = [
  null,
  '#17140c',   /* 1 outline        */
  '#f5a623',   /* 2 fur            */
  '#ffc457',   /* 3 fur highlight  */
  '#d6870d',   /* 4 fur shade      */
  '#2e9e8f',   /* 5 band           */
  '#f2f2f0',   /* 6 white          */
  '#fbe9b3',   /* 7 cloud cream    */
  '#f3d68a',   /* 8 cloud shade    */
  '#f7c21a'    /* 9 shard yellow   */
];
var INK = 1, FUR = 2, LIT = 3, SHD = 4, TEAL = 5, WHT = 6, CLOUD = 7, CLOUDD = 8, SHARD = 9;
var g = window.GGPX.make(cv, W, H, S, PAL);
var rng = window.GGPX.rng;

var CX = 26, CROWN = 26, BAND = 29, EYE = 37, MOUTH = 46;
/* The cloud floats ABOVE the crown with a stalk of fur between them. Sat
 * flush on the headband it read as a chef's hat; the gap is what makes it an
 * eruption. 16 rows of sky above it, so the shards have somewhere to go. */
var CLOUD_Y = 16;

/* Outline the cloud against EVERYTHING that is not cloud — including the fur
 * of the stalk and crown it overlaps. The engine's outlineBox only treats
 * transparent as "outside", so a cloud resting on fur got no bottom line and
 * merged into the head. */
function outlineCloud(x0, y0, x1, y1) {
  var isCloud = function (c) { return c === CLOUD || c === CLOUDD || c === INK; };
  var edge = [];
  for (var y = Math.max(1, y0); y <= Math.min(H - 2, y1); y++) {
    for (var x = Math.max(1, x0); x <= Math.min(W - 2, x1); x++) {
      var c = g.get(x, y);
      if (c !== CLOUD && c !== CLOUDD) continue;
      if (!isCloud(g.get(x, y - 1)) || !isCloud(g.get(x, y + 1)) ||
          !isCloud(g.get(x - 1, y)) || !isCloud(g.get(x + 1, y))) edge.push([x, y]);
    }
  }
  for (var i = 0; i < edge.length; i++) g.px(edge[i][0], edge[i][1], INK);
}

/* ---- particles ------------------------------------------------------------
 * Nine shards, re-seeded on every burst so no two bursts are identical, but
 * seeded (not Math.random) so a given burst is reproducible frame to frame. */
var shards = [];
var burstAt = -999;                      /* frame the current burst started   */
var BURST_LEN = 16;
function burst(f, seed) {
  burstAt = f;
  shards = [];
  var rnd = rng(seed);
  for (var i = 0; i < 9; i++) {
    /* A fan a little wider than a half-circle, so some shards go OUT rather
     * than only UP — the ones that go straight up are the ones that leave
     * the grid first. Speed is capped so the fastest is still in frame at
     * frame 9, when the fade begins. */
    var a = -Math.PI * 1.06 + rnd() * Math.PI * 1.12;
    shards.push({
      a: a,
      v: 0.7 + rnd() * 1.0,
      big: rnd() > 0.55,
      spin: rnd() > 0.5
    });
  }
}

function drawGary(f, st) {
  g.clear();
  var boil = f % 3;
  var age = f - burstAt;
  var bursting = age >= 0 && age < BURST_LEN;
  var puff = bursting && age < 6 ? 1 : 0;

  /* ---- the mound: crown to the bottom edge, one silhouette ---- */
  g.mound(CX, CROWN, H - 2, 8, 18, 100 + boil, FUR);
  var rnd = rng(300 + boil);
  for (var i = 0; i < 30; i++) {
    var sx = CX - 19 + Math.floor(rnd() * 39), sy = H - 12 + Math.floor(rnd() * 10);
    if ((sx < CX - 10 || sx > CX + 10) && g.get(sx, sy) === FUR) g.px(sx, sy, SHD);
  }
  for (i = 0; i < 12; i++) {
    var hx = CX - 6 + Math.floor(rnd() * 13), hy = CROWN + 1 + Math.floor(rnd() * 3);
    if (g.get(hx, hy) === FUR) g.px(hx, hy, LIT);
  }

  /* ---- headband ---- */
  g.rect(CX - 11, BAND, CX + 11, BAND + 4, TEAL);
  g.hline(CX - 11, CX + 11, BAND + 2, WHT);
  g.hline(CX - 11, CX + 11, BAND - 1, INK);
  g.hline(CX - 11, CX + 11, BAND + 5, INK);
  for (var y = BAND; y <= BAND + 4; y++) { g.px(CX - 12, y, INK); g.px(CX + 12, y, INK); }

  /* ---- face: wide vertical eyes, small "O" mouth ---- */
  var eh = bursting ? 5 : 4;
  if (st.blink && !bursting) {
    g.hline(CX - 7, CX - 5, EYE + 2, INK);
    g.hline(CX + 5, CX + 7, EYE + 2, INK);
  } else {
    g.oval(CX - 6, EYE + 2, 1, Math.floor(eh / 2), INK);
    g.oval(CX + 6, EYE + 2, 1, Math.floor(eh / 2), INK);
  }
  g.oval(CX, MOUTH, 2, bursting ? 4 : 3, INK);

  /* ---- the stalk: a column of fur erupting up out of the crown ---- */
  g.rect(CX - 3, CLOUD_Y + 4, CX + 3, CROWN + 1, FUR);
  for (var yy = CLOUD_Y + 4; yy <= CROWN; yy++) { g.px(CX - 4, yy, INK); g.px(CX + 4, yy, INK); }

  /* ---- the cloud, floating above the crown ---- */
  var cy = CLOUD_Y - puff;
  g.disc(CX,     cy,     5 + puff, CLOUD);
  g.disc(CX - 6, cy + 2, 4 + puff, CLOUD);
  g.disc(CX + 6, cy + 2, 4 + puff, CLOUD);
  g.disc(CX - 3, cy - 2, 3 + puff, CLOUD);
  g.disc(CX + 3, cy - 2, 3 + puff, CLOUD);
  g.disc(CX,     cy + 3, 4,        CLOUD);
  /* underside shade so it has a belly, then a HEAVY outline all the way
   * round — against the sky and against the fur it sits over */
  g.hline(CX - 7, CX + 7, cy + 4, CLOUDD);
  g.hline(CX - 5, CX + 5, cy + 5, CLOUDD);
  outlineCloud(CX - 12, cy - 7, CX + 12, cy + 7);

  /* ---- speed lines: first six frames only ---- */
  if (bursting && age < 6) {
    for (i = 0; i < 5; i++) {
      var la = -Math.PI * 0.9 + i * (Math.PI * 0.8 / 4);
      var r0 = 8 + age, r1 = r0 + 3;
      for (var r = r0; r <= r1; r++) {
        g.px(CX + Math.round(Math.cos(la) * r), cy + Math.round(Math.sin(la) * r), SHARD);
      }
    }
  }

  /* ---- shards: placed by arithmetic, faded by alternate-frame draw ---- */
  if (bursting) {
    for (i = 0; i < shards.length; i++) {
      var s = shards[i];
      if (age > 10 && (age + i) % 2) continue;         /* the pixel-art fade  */
      var d = s.v * age;
      var px = CX + Math.round(Math.cos(s.a) * d);
      var py = cy + Math.round(Math.sin(s.a) * d) + Math.round(age * age * 0.03); /* a touch of drop */
      if (s.big) {
        g.rect(px, py, px + 2, py + 2, SHARD);
        g.px(s.spin ? px : px + 2, py, INK);
        g.px(px + 1, py + 3, INK);
      } else {
        g.rect(px, py, px + 1, py + 1, SHARD);
        g.px(px + (s.spin ? 2 : -1), py, INK);
      }
    }
  }
}

/* ---- loop ---- */
var frame = 0;
var st = { blink: false };
function step() {
  frame++;
  var bl = frame % 53;
  st.blink = (bl === 0 || bl === 1);
  /* An idle burst on its own timer, so he is never still for long. */
  if (frame % 47 === 0) burst(frame, frame);
  drawGary(frame, st);
  g.blit();
}
if (reduce) { burst(0, 7); drawGary(3, st); g.blit(); }
else { burst(1, 1); step(); setInterval(function () { if (!document.hidden) step(); }, 100); }

/* ---- live bindings: a real 24h move, or no bubble at all ---- */
var lastSeenPrice = null;
function paint(store) {
  var bubble = document.getElementById('cornerBubble');
  var live = store && store.status === 'live' && store.pair;
  if (!live) { if (bubble) bubble.hidden = true; return; }
  var ch = parseFloat((store.pair.priceChange || {}).h24);
  if (bubble && isFinite(ch)) {
    bubble.textContent = (ch >= 0 ? '+' : '') + ch.toFixed(1) + '%';
    bubble.className = 'corner-bubble' + (ch < 0 ? ' down' : '');
    bubble.hidden = false;
  }
  /* A NEW quote is what he reacts to — not every poll. */
  var p = store.pair.priceUsd;
  if (p !== lastSeenPrice) {
    lastSeenPrice = p;
    if (!reduce) burst(frame, Date.now() & 0xffff);
  }
}
if (window.GGMARKET) { window.GGMARKET.onUpdate(paint); paint(window.GGMARKET.get()); }
else paint(null);
})();
