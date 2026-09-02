/* =============================================================================
 * gary.js — THE RIG: a wireframe adventure SUV drawn in pure math.
 *
 * Lineage: XAT Racing's "Glass Garage" canvas-CAD engine — a procedural
 * wireframe car with drag-to-rotate, scroll-to-field-strip, isolate, and a
 * tap-a-part dossier. The ENGINE is ported faithfully (projection, depth
 * fade, hit-testing, explode, the axis gizmo); the SUBJECT is new: where the
 * original drew a long-hood fastback coupe, this draws a three-row electric
 * SUV, and its parts are an EV skateboard rather than an iron straight-six.
 *
 * No images. No libraries. Every vertex below is a number in this file.
 *
 * PROPORTIONS (the thing that makes it read as an SUV and not a tall coupe):
 *   1 unit ~ 1000 mm. Half-length 2.55 (5.1 m), half-width 1.00 (2.0 m),
 *   roof at y=2.00 (2.0 m tall), ground at y=0, wheel centres at y=0.40 on
 *   0.40-radius all-terrains (~810 mm / 32"). Height:length lands at 0.39 —
 *   an SUV. The first pass used the coupe's own ride height and the result
 *   read as a wagon, which is exactly the trap this comment exists to mark.
 *
 * THE FACE IS THE BRAND. Two vertical stadium lamps with a full-width bar
 * between them is the single silhouette cue that says "electric adventure
 * SUV" from three blocks away — the equivalent of the coupe's GT wing. If
 * any part gets cut for performance, it is not those three.
 *
 * THE GEARS ARE REAL GEOMETRY. cogZ() emits an actual toothed profile
 * (root/tip radii alternating around the circumference), not a circle with a
 * texture. The reduction gearsets spin. On a project called GEAR GUARD, a
 * fake gear would be the one asset that cannot be faked.
 * ===========================================================================*/
(function () {
'use strict';

var cv = document.getElementById('rig-wire');
if (!cv) return;
var ctx = cv.getContext('2d');
var stage = document.getElementById('rigStage');
var esc = function (s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
};
var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
var TAU = Math.PI * 2;

/* ---- geometry kit -------------------------------------------------------- */
var centroid = function (v) {
  return v.reduce(function (s, p) { return [s[0] + p[0], s[1] + p[1], s[2] + p[2]]; }, [0, 0, 0])
    .map(function (c) { return c / v.length; });
};
/* A profile in XY, swept along Z. conn = draw every Nth spanwise rail. */
var extrude = function (prof, zh, conn) {
  conn = conn || 1;
  var n = prof.length, v = [], e = [], f = [], i, j;
  for (i = 0; i < n; i++) v.push([prof[i][0], prof[i][1], zh]);
  for (i = 0; i < n; i++) v.push([prof[i][0], prof[i][1], -zh]);
  for (i = 0; i < n; i++) { j = (i + 1) % n; e.push([i, j], [n + i, n + j]); }
  for (i = 0; i < n; i += conn) e.push([i, n + i]);
  for (i = 0; i < n; i++) { j = (i + 1) % n; f.push([i, j, n + j, n + i]); }
  var top = [], bot = [];
  for (i = 0; i < n; i++) { top.push(i); bot.push(n + i); }
  f.push(top); f.push(bot);
  return { v: v, e: e, f: f };
};
var axisCyl = function (axis, a0, a1, r, seg, c1, c2) {
  var v = [], e = [], i, a, s, co;
  for (i = 0; i < seg; i++) {
    a = i / seg * TAU; s = Math.sin(a) * r; co = Math.cos(a) * r;
    if (axis === 'x') v.push([a0, c1 + s, c2 + co], [a1, c1 + s, c2 + co]);
    else if (axis === 'y') v.push([c1 + co, a0, c2 + s], [c1 + co, a1, c2 + s]);
    else v.push([c1 + co, c2 + s, a0], [c1 + co, c2 + s, a1]);
  }
  for (i = 0; i < seg; i++) {
    var p = i * 2, q = p + 1, np = ((i + 1) % seg) * 2;
    e.push([p, np], [q, np + 1], [p, q]);
  }
  return { v: v, e: e, f: [] };
};
var xcyl = function (x0, x1, r, seg, cy, cz) { return axisCyl('x', x0, x1, r, seg, cy || 0, cz || 0); };
var vcyl = function (y0, y1, r, seg, cx, cz) { return axisCyl('y', y0, y1, r, seg, cx || 0, cz || 0); };
var zcyl = function (z0, z1, r, seg, cx, cy) { return axisCyl('z', z0, z1, r, seg, cx || 0, cy || 0); };
var ringZ = function (z, r, seg, cx, cy) {
  var v = [], e = [], k, a;
  for (k = 0; k < seg; k++) { a = k / seg * TAU; v.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]); e.push([k, (k + 1) % seg]); }
  return { v: v, e: e, f: [] };
};
var trans = function (g, dx, dy, dz) {
  return {
    v: g.v.map(function (p) { return [p[0] + dx, p[1] + dy, p[2] + dz]; }),
    e: g.e, f: g.f || []
  };
};
var merge = function () {
  var v = [], e = [], f = [], off = 0;
  for (var i = 0; i < arguments.length; i++) {
    var g = arguments[i];
    if (!g) continue;
    g.v.forEach(function (p) { v.push(p); });
    g.e.forEach(function (pr) { e.push([pr[0] + off, pr[1] + off]); });
    (g.f || []).forEach(function (fc) { f.push(fc.map(function (ix) { return ix + off; })); });
    off += g.v.length;
  }
  return { v: v, e: e, f: f };
};
var V3sub = function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; };
var V3norm = function (a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
var V3cross = function (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; };
/* A swept tube through a point list — hoses, rails, harness runs. */
var pipe = function (pts, r, seg) {
  seg = seg || 6;
  var v = [], e = [], k, q;
  for (k = 0; k < pts.length; k++) {
    var d = V3norm(V3sub(pts[Math.min(k + 1, pts.length - 1)], pts[Math.max(k - 1, 0)]));
    var up = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    var s = V3norm(V3cross(d, up)), u = V3cross(s, d);
    for (q = 0; q < seg; q++) {
      var a = q / seg * TAU, co = Math.cos(a) * r, si = Math.sin(a) * r;
      v.push([pts[k][0] + s[0] * co + u[0] * si,
              pts[k][1] + s[1] * co + u[1] * si,
              pts[k][2] + s[2] * co + u[2] * si]);
    }
    var b0 = k * seg;
    for (q = 0; q < seg; q++) { e.push([b0 + q, b0 + (q + 1) % seg]); if (k) e.push([b0 + q - seg, b0 + q]); }
  }
  return { v: v, e: e, f: [] };
};
var wire = function (pts) {
  var e = [];
  for (var k = 1; k < pts.length; k++) e.push([k - 1, k]);
  return { v: pts.slice(), e: e, f: [] };
};

/* A REAL gear: root and tip radii alternating around the circumference, plus
 * a hub ring and spokes. Faces the Z axis, so it shares the wheels' rotation
 * axis and can be spun by the renderer. */
var cogZ = function (z, rRoot, rTip, teeth, cx, cy) {
  var pts = [], k;
  for (k = 0; k < teeth; k++) {
    var b = k / teeth * TAU, s = TAU / teeth;
    pts.push([b + s * 0.06, rRoot], [b + s * 0.20, rTip],
             [b + s * 0.55, rTip], [b + s * 0.69, rRoot], [b + s * 0.94, rRoot]);
  }
  var v = pts.map(function (p) { return [cx + Math.cos(p[0]) * p[1], cy + Math.sin(p[0]) * p[1], z]; });
  var e = v.map(function (_, i) { return [i, (i + 1) % v.length]; });
  var hub = ringZ(z, rRoot * 0.32, 10, cx, cy);
  var spokes = [];
  for (k = 0; k < 5; k++) {
    var a = k / 5 * TAU + 0.25;
    spokes.push(wire([[cx + Math.cos(a) * rRoot * 0.32, cy + Math.sin(a) * rRoot * 0.32, z],
                      [cx + Math.cos(a) * rRoot * 0.88, cy + Math.sin(a) * rRoot * 0.88, z]]));
  }
  return merge({ v: v, e: e, f: [] }, hub, merge.apply(null, spokes));
};

var mk = function (g, fam, ex, group, label, spec, learn, spin, thin) {
  return { v: g.v, e: g.e, f: g.f || [], fam: fam, ex: ex, group: group, label: label,
           spec: spec, learn: learn, spin: spin || null, thin: !!thin, c: centroid(g.v) };
};
var L = function (t, b, links) { return { t: t, b: b, links: links || [] }; };

/* ---- THE RIG — three-row electric SUV, front = +X ------------------------ */
var AXF = 1.53, AXR = -1.53, WCY = 0.40, TR = 0.40, HW = 1.00;

/* Body outline. Read it as a walk: up the tailgate, forward along the roof,
 * down the screen onto the short hood, over the upright nose, then back along
 * the underside with an arch cut at each axle. */
var SHELL_P = [
  [-2.50, 0.55], [-2.55, 0.95], [-2.55, 1.62], [-2.46, 1.88],      /* near-vertical tailgate + spoiler lip */
  [-2.24, 1.97], [-1.50, 2.00], [-0.30, 2.00], [0.80, 1.97],       /* long flat three-row roof */
  [1.06, 1.92], [1.50, 1.44], [1.70, 1.30],                        /* A-pillar + raked screen */
  [1.92, 1.28], [2.30, 1.26], [2.46, 1.21],                        /* cowl -> short flat hood */
  [2.55, 1.02], [2.56, 0.74], [2.52, 0.52], [2.42, 0.40],          /* upright nose -> lower fascia */
  [2.06, 0.38],                                                     /* front bumper underside */
  [1.98, 0.55], [1.86, 0.88], [1.53, 0.95], [1.20, 0.88], [1.08, 0.55],  /* front arch */
  [1.04, 0.40], [-1.04, 0.40],                                      /* rocker */
  [-1.08, 0.55], [-1.20, 0.88], [-1.53, 0.95], [-1.86, 0.88], [-1.98, 0.55], /* rear arch */
  [-2.06, 0.38], [-2.42, 0.40]
];
/* Daylight opening — the side glass band. */
var GLASS_P = [[-2.42, 1.36], [-2.40, 1.86], [1.00, 1.90], [1.58, 1.36]];

var wheelAt = function (cx, zs) {
  var tire = zcyl(zs * 0.70, zs * 1.00, TR, 16, cx, WCY);
  var lip = ringZ(zs * 0.98, TR * 0.72, 14, cx, WCY);
  var barrel = zcyl(zs * 0.76, zs * 0.96, TR * 0.62, 12, cx, WCY);
  var hub = { v: [[cx, WCY, zs * 0.94]], e: [], f: [] };
  for (var k = 0; k < 6; k++) {
    var a = k / 6 * TAU + 0.26;
    hub.v.push([cx + Math.cos(a) * TR * 0.58, WCY + Math.sin(a) * TR * 0.58, zs * 0.94],
               [cx + Math.cos(a + 0.30) * TR * 0.58, WCY + Math.sin(a + 0.30) * TR * 0.58, zs * 0.94]);
    hub.e.push([0, k * 2 + 1], [0, k * 2 + 2], [k * 2 + 1, k * 2 + 2]);
  }
  return merge(tire, lip, barrel, hub);
};
/* Drive unit: a motor can inboard of the hub, with its reduction gearset on
 * the axle line. Quad-motor means this exists four times, one per corner. */
var driveAt = function (cx, zs) {
  var can = zcyl(zs * 0.26, zs * 0.56, 0.17, 12, cx, WCY);
  var endA = ringZ(zs * 0.26, 0.17, 12, cx, WCY);
  var endB = ringZ(zs * 0.56, 0.17, 12, cx, WCY);
  var shaft = zcyl(zs * 0.56, zs * 0.70, 0.035, 6, cx, WCY);
  return merge(can, endA, endB, shaft);
};
var gearsetAt = function (cx, zs) {
  return merge(cogZ(zs * 0.60, 0.115, 0.150, 14, cx, WCY),
               cogZ(zs * 0.60, 0.058, 0.082, 9, cx + 0.20, WCY + 0.14));
};
/* Air spring: a bellows (stacked rings) on a strut, not a coil-over. The
 * suspension is height-adjustable, which is the whole point of the part. */
var airSpringAt = function (cx, zs) {
  var g = [pipe([[cx, WCY - 0.06, zs * 0.62], [cx - 0.02, 1.02, zs * 0.50]], 0.035, 6)];
  for (var k = 0; k < 4; k++) {
    var t = k / 3;
    g.push(ringZ(zs * (0.62 - t * 0.12), 0.10 + (k % 2) * 0.03, 10,
                 cx - t * 0.02, WCY + 0.16 + t * 0.30));
  }
  return merge.apply(null, g);
};
var controlArmsAt = function (cx, zs) {
  return merge(
    wire([[cx, WCY - 0.02, zs * 0.66], [cx + 0.36, WCY - 0.04, zs * 0.26]]),
    wire([[cx, WCY - 0.02, zs * 0.66], [cx - 0.36, WCY - 0.04, zs * 0.26]]),
    wire([[cx, WCY + 0.26, zs * 0.60], [cx + 0.28, WCY + 0.30, zs * 0.24]]),
    wire([[cx, WCY + 0.26, zs * 0.60], [cx - 0.28, WCY + 0.30, zs * 0.24]]));
};
/* Gear Guard sentry: a corner camera pod with its lens ring. */
var sentryAt = function (cx, cy, cz) {
  return merge(trans(extrude([[cx - 0.07, cy - 0.05], [cx + 0.07, cy - 0.05],
                              [cx + 0.07, cy + 0.05], [cx - 0.07, cy + 0.05]], 0.05, 1), 0, 0, cz),
               ringZ(cz, 0.035, 8, cx, cy));
};

var SEC = function (id) { return '#' + id; };

var PARTS = [
  /* ---- SHELL ---- */
  mk(extrude(SHELL_P, HW, 2), 'bd', [0, 1.3, 0], 'SHELL', 'BODY SHELL',
    'THREE ROW · FLAT ROOF · SHORT OVERHANGS',
    L('Body shell', 'Upright, boxy, short overhangs at both ends — the shape you get when the floor is a battery and the cabin is the whole car. Drawn from 34 profile points and nothing else.',
      [['What Gear Guard is', SEC('guard')]])),
  mk(extrude(GLASS_P, HW * 0.94, 1), 'gl', [0, 1.8, 0], 'SHELL', 'GREENHOUSE',
    'DLO · THIRD-ROW QUARTER GLASS',
    L('Greenhouse', 'The daylight opening, carried flat to the tailgate so the third row gets a real window instead of a letterbox.',
      [['What Gear Guard is', SEC('guard')]])),
  mk(merge(
      trans(extrude([[-2.22, 1.985], [0.86, 1.985], [0.86, 2.005], [-2.22, 2.005]], 0.80, 2), 0, 0, 0),
      wire([[-0.70, 2.005, -0.80], [-0.70, 2.005, 0.80]])),
    'gl', [0, 2.2, 0], 'SHELL', 'PANORAMIC ROOF',
    'FIXED GLASS · FULL LENGTH',
    L('Panoramic roof', 'One fixed pane from windscreen header to the rear header. No crossbeam in the middle — the structure is in the sides and the floor.',
      [['What Gear Guard is', SEC('guard')]])),
  mk(merge(
      wire([[2.30, 1.24, 0.99], [1.00, 1.90, 0.99], [-2.30, 1.94, 0.99]]),
      wire([[2.30, 1.24, -0.99], [1.00, 1.90, -0.99], [-2.30, 1.94, -0.99]]),
      wire([[2.20, 1.26, 0.99], [2.24, 0.62, 0.99]]),
      wire([[0.30, 1.42, 0.99], [0.32, 0.44, 0.99]]),
      wire([[-1.00, 1.44, 0.99], [-1.02, 0.44, 0.99]]),
      wire([[2.20, 1.26, -0.99], [2.24, 0.62, -0.99]]),
      wire([[0.30, 1.42, -0.99], [0.32, 0.44, -0.99]]),
      wire([[-1.00, 1.44, -0.99], [-1.02, 0.44, -0.99]]),
      wire([[-2.20, 1.44, -0.96], [-2.20, 1.44, 0.96]])),
    'st', [0, 1.2, 0], 'SHELL', 'PANEL LINES', 'SHUTLINES · BELTLINE',
    L('Panel lines', 'Door shuts, the tailgate gap, and the beltline running nose to tail. Gap consistency is half of what makes a body feel finished.',
      [['What Gear Guard is', SEC('guard')]]), null, true),
  mk(merge(
      pipe([[1.30, 2.03, 0.78], [-2.10, 2.03, 0.78]], 0.028, 6),
      pipe([[1.30, 2.03, -0.78], [-2.10, 2.03, -0.78]], 0.028, 6),
      pipe([[0.90, 2.07, -0.80], [0.90, 2.07, 0.80]], 0.026, 6),
      pipe([[-1.30, 2.07, -0.80], [-1.30, 2.07, 0.80]], 0.026, 6)),
    'st', [0, 2.6, 0], 'SHELL', 'ROOF RACK', 'CROSSBARS · GEAR ON TOP',
    L('Roof rack', 'Rails and two crossbars. The reason a vehicle like this exists is that the gear goes with you.',
      [['The trail', SEC('trail')]])),

  /* ---- THE FACE ---- */
  mk(merge(vcyl(1.00, 1.44, 0.085, 10, 2.44, 0.74), ringZ(0.74, 0.085, 10, 2.44, 1.00),
           ringZ(0.74, 0.085, 10, 2.44, 1.44)),
    'bd', [1.5, 0.6, 0.7], 'LIGHTING', 'HEADLAMP — RIGHT', 'VERTICAL STADIUM',
    L('Headlamp', 'A vertical stadium lamp at each corner of the nose. Two of these plus the bar between them is the entire face — the silhouette cue that reads from three blocks away.',
      [['What Gear Guard is', SEC('guard')]])),
  mk(merge(vcyl(1.00, 1.44, 0.085, 10, 2.44, -0.74), ringZ(-0.74, 0.085, 10, 2.44, 1.00),
           ringZ(-0.74, 0.085, 10, 2.44, 1.44)),
    'bd', [1.5, 0.6, -0.7], 'LIGHTING', 'HEADLAMP — LEFT', 'VERTICAL STADIUM',
    L('Headlamp', 'The left half of the face. Symmetry is the point: the bar reads as one continuous line only if both ends land.',
      [['What Gear Guard is', SEC('guard')]])),
  mk(merge(zcyl(-0.72, 0.72, 0.045, 8, 2.49, 1.21), ringZ(0.72, 0.045, 8, 2.49, 1.21),
           ringZ(-0.72, 0.045, 8, 2.49, 1.21)),
    'pw', [1.8, 0.4, 0], 'LIGHTING', 'FRONT LIGHT BAR', 'FULL WIDTH · THE SIGNATURE',
    L('Front light bar', 'One unbroken bar linking the two lamps. It is the brand mark, and on this page it is the only place the go-colour is spent on the model.',
      [['Live readout', SEC('charge')]])),
  mk(merge(zcyl(-0.92, 0.92, 0.05, 8, -2.53, 1.30), ringZ(0.92, 0.05, 8, -2.53, 1.30),
           ringZ(-0.92, 0.05, 8, -2.53, 1.30)),
    'sg', [-1.8, 0.4, 0], 'LIGHTING', 'REAR LIGHT BAR', 'FULL WIDTH',
    L('Rear light bar', 'The same line, answered at the back. What everyone behind you actually sees.',
      [['The trail', SEC('trail')]])),

  /* ---- PACK ---- */
  mk(merge(extrude([[-1.74, 0.15], [1.74, 0.15], [1.74, 0.37], [-1.74, 0.37]], 0.84, 2),
           wire([[-1.40, 0.37, 0], [1.40, 0.37, 0]])),
    'pw', [0, -1.6, 0], 'PACK', 'BATTERY PACK', 'SKATEBOARD · STRUCTURAL FLOOR',
    L('Battery pack', 'The flat slab the whole vehicle is built around: it is the floor, the structure and the centre of gravity at once. In this project it is the treasury — everything else is bolted to it.',
      [['Drivetrain & allocation', SEC('drivetrain')]])),
  mk(merge(extrude([[-1.66, 0.20], [-1.66, 0.32], [1.66, 0.32], [1.66, 0.20]], 0.10, 1),
           pipe([[1.60, 0.26, 0.08], [1.58, 0.62, 0.30], [1.52, 0.66, 0.44]], 0.022, 5),
           pipe([[-1.60, 0.26, -0.08], [-1.58, 0.62, -0.30], [-1.52, 0.66, -0.44]], 0.022, 5)),
    'pw', [0, -1.2, 0], 'PACK', 'HV BUSBAR', 'PACK -> DRIVE UNITS',
    L('High-voltage busbar', 'The spine that carries the pack out to all four corners. Nothing moves until this is connected.',
      [['Drivetrain & allocation', SEC('drivetrain')]]), null, true),
  mk(merge(trans(extrude([[1.86, 0.86], [2.04, 0.86], [2.04, 1.02], [1.86, 1.02]], 0.04, 1), 0, 0, 0.98),
           ringZ(1.02, 0.05, 8, 1.95, 0.94)),
    'pw', [1.0, 0.9, 1.5], 'PACK', 'CHARGE PORT', 'FRONT FENDER · DC FAST',
    L('Charge port', 'Front-left fender, where you can reach it nose-in at a stall. The state-of-charge readout on this page fills bottom-up for the same reason a pack does.',
      [['Live readout', SEC('charge')]])),

  /* ---- DRIVE ---- */
  mk(driveAt(AXF, 1), 'dr', [0.6, 0.2, 1.3], 'DRIVE', 'DRIVE UNIT — FR', 'ONE MOTOR PER WHEEL',
    L('Drive unit', 'A motor per corner: torque is decided in software, wheel by wheel, instead of being shared out by a differential.',
      [['Drivetrain & allocation', SEC('drivetrain')]])),
  mk(driveAt(AXF, -1), 'dr', [0.6, 0.2, -1.3], 'DRIVE', 'DRIVE UNIT — FL', 'ONE MOTOR PER WHEEL',
    L('Drive unit', 'Front-left. Four of these is the whole quad-motor argument.',
      [['Drivetrain & allocation', SEC('drivetrain')]])),
  mk(driveAt(AXR, 1), 'dr', [-0.6, 0.2, 1.3], 'DRIVE', 'DRIVE UNIT — RR', 'ONE MOTOR PER WHEEL',
    L('Drive unit', 'Rear-right. The pair that does most of the work when the road is dry.',
      [['Drivetrain & allocation', SEC('drivetrain')]])),
  mk(driveAt(AXR, -1), 'dr', [-0.6, 0.2, -1.3], 'DRIVE', 'DRIVE UNIT — RL', 'ONE MOTOR PER WHEEL',
    L('Drive unit', 'Rear-left. Four independent motors means four independent failure modes, all of them survivable.',
      [['Drivetrain & allocation', SEC('drivetrain')]])),
  mk(gearsetAt(AXF, 1), 'dr', [0.3, 1.0, 1.7], 'DRIVE', 'REDUCTION GEARSET — FR', 'SINGLE SPEED · REAL TEETH',
    L('Reduction gearset', 'A single-speed reduction between motor and hub. These are drawn as actual toothed profiles — root and tip radii around the circumference — because on a project called GEAR GUARD, the gear is the one thing that must not be faked.',
      [['Drivetrain & allocation', SEC('drivetrain')]]), [AXF, WCY]),
  mk(gearsetAt(AXR, -1), 'dr', [-0.3, 1.0, -1.7], 'DRIVE', 'REDUCTION GEARSET — RL', 'SINGLE SPEED · REAL TEETH',
    L('Reduction gearset', 'The rear pinion and its ring. Same geometry, mirrored — and it turns with the wheels when the model is assembled.',
      [['Drivetrain & allocation', SEC('drivetrain')]]), [AXR, WCY]),
  mk(merge(zcyl(0.20, 0.68, 0.026, 6, AXF, WCY), zcyl(-0.68, -0.20, 0.026, 6, AXF, WCY),
           zcyl(0.20, 0.68, 0.026, 6, AXR, WCY), zcyl(-0.68, -0.20, 0.026, 6, AXR, WCY)),
    'dr', [0, -0.6, 0], 'DRIVE', 'HALF-SHAFTS ×4', 'UNSPRUNG · CONSTANT VELOCITY',
    L('Half-shafts', 'Motor to hub at each corner. Short, because the motor is already at the wheel.',
      [['Drivetrain & allocation', SEC('drivetrain')]]), null, true),

  /* ---- CHASSIS ---- */
  mk(airSpringAt(AXF, 1), 'st', [0.2, 1.1, 0.9], 'CHASSIS', 'AIR SPRING — FR', 'RIDE HEIGHT ADJUSTABLE',
    L('Air spring', 'Bellows on a damper, not a coil. The ride height is a setting, which is what lets one vehicle be a highway car and a trail rig.',
      [['The trail', SEC('trail')]])),
  mk(airSpringAt(AXF, -1), 'st', [0.2, 1.1, -0.9], 'CHASSIS', 'AIR SPRING — FL', 'RIDE HEIGHT ADJUSTABLE',
    L('Air spring', 'Front-left. Corner-by-corner levelling starts here.', [['The trail', SEC('trail')]])),
  mk(airSpringAt(AXR, 1), 'st', [-0.2, 1.1, 0.9], 'CHASSIS', 'AIR SPRING — RR', 'RIDE HEIGHT ADJUSTABLE',
    L('Air spring', 'Rear-right, carrying the third row and whatever is behind it.', [['The trail', SEC('trail')]])),
  mk(airSpringAt(AXR, -1), 'st', [-0.2, 1.1, -0.9], 'CHASSIS', 'AIR SPRING — RL', 'RIDE HEIGHT ADJUSTABLE',
    L('Air spring', 'Rear-left. Four springs, one levelling algorithm.', [['The trail', SEC('trail')]])),
  mk(merge(controlArmsAt(AXF, 1), controlArmsAt(AXF, -1), controlArmsAt(AXR, 1), controlArmsAt(AXR, -1)),
    'st', [0, -0.8, 0], 'CHASSIS', 'CONTROL ARMS ×8', 'DOUBLE WISHBONE',
    L('Control arms', 'Wishbones at every corner. Geometry is what decides whether the ride-height range is usable or theoretical.',
      [['The trail', SEC('trail')]]), null, true),
  mk(merge(extrude([[1.20, 0.10], [2.00, 0.10], [2.00, 0.16], [1.20, 0.16]], 0.70, 1),
           extrude([[-2.00, 0.10], [-1.20, 0.10], [-1.20, 0.16], [-2.00, 0.16]], 0.70, 1)),
    'st', [0, -2.0, 0], 'CHASSIS', 'SKID PLATES', 'PACK PROTECTION',
    L('Skid plates', 'Plate under both ends of the pack. The battery is the floor, so the floor is what gets armoured.',
      [['What Gear Guard is', SEC('guard')]])),
  mk(wheelAt(AXF, 1), 'st', [0, 0, 1.9], 'WHEELS', 'WHEEL — FR', 'ALL-TERRAIN · 810 MM',
    L('Wheel & tyre', 'Tall all-terrain sidewall over a big hub. Nothing about this vehicle works if the contact patch is wrong.',
      [['The trail', SEC('trail')]]), [AXF, WCY]),
  mk(wheelAt(AXF, -1), 'st', [0, 0, -1.9], 'WHEELS', 'WHEEL — FL', 'ALL-TERRAIN · 810 MM',
    L('Wheel & tyre', 'Front-left.', [['The trail', SEC('trail')]]), [AXF, WCY]),
  mk(wheelAt(AXR, 1), 'st', [0, 0, 1.9], 'WHEELS', 'WHEEL — RR', 'ALL-TERRAIN · 810 MM',
    L('Wheel & tyre', 'Rear-right.', [['The trail', SEC('trail')]]), [AXR, WCY]),
  mk(wheelAt(AXR, -1), 'st', [0, 0, -1.9], 'WHEELS', 'WHEEL — RL', 'ALL-TERRAIN · 810 MM',
    L('Wheel & tyre', 'Rear-left.', [['The trail', SEC('trail')]]), [AXR, WCY]),

  /* ---- GEAR GUARD — the namesake ---- */
  mk(merge(sentryAt(2.30, 1.22, 0.92), sentryAt(2.30, 1.22, -0.92),
           sentryAt(-2.30, 1.40, 0.92), sentryAt(-2.30, 1.40, -0.92)),
    'gg', [0, 1.7, 0], 'GEAR GUARD', 'SENTRY PODS ×4', 'ALWAYS WATCHING · NEVER DRIVING',
    L('Sentry pods', 'Four cameras that watch the vehicle while it is parked. They record; they do not steer. That distinction is the entire posture of this project — see the note at the foot of this page.',
      [['What Gear Guard is', SEC('guard')]])),
  mk(merge(extrude([[-2.28, 0.42], [-1.80, 0.42], [-1.80, 0.76], [-2.28, 0.76]], 0.72, 1),
           wire([[-2.04, 0.76, -0.70], [-2.04, 0.76, 0.70]])),
    'gg', [-1.2, -1.4, 0], 'GEAR GUARD', 'GEAR LOCKER', 'UNDER-FLOOR · LOCKED',
    L('Gear locker', 'Sealed storage under the load floor. The thing being guarded is not the vehicle — it is what you put in it.',
      [['Drivetrain & allocation', SEC('drivetrain')]])),
  mk(merge(pipe([[2.36, 0.46, 0.42], [2.52, 0.46, 0.42]], 0.045, 6),
           pipe([[2.36, 0.46, -0.42], [2.52, 0.46, -0.42]], 0.045, 6),
           ringZ(0.42, 0.05, 8, 2.52, 0.46), ringZ(-0.42, 0.05, 8, 2.52, 0.46)),
    'gg', [1.6, -0.6, 0], 'GEAR GUARD', 'RECOVERY POINTS', 'RATED · BOTH ENDS',
    L('Recovery points', 'Rated hooks, bolted to structure. Every serious rig admits in advance that it might need pulling out.',
      [['The trail', SEC('trail')]]))
];

var GROUPS = [];
PARTS.forEach(function (p) { if (GROUPS.indexOf(p.group) < 0) GROUPS.push(p.group); });
var enabled = {};
GROUPS.forEach(function (g) { enabled[g] = true; });

var allV = [];
PARTS.forEach(function (p) { p.v.forEach(function (v) { allV.push(v); }); });
var BB = {
  min: [0, 1, 2].map(function (i) { return Math.min.apply(null, allV.map(function (v) { return v[i]; })); }),
  max: [0, 1, 2].map(function (i) { return Math.max.apply(null, allV.map(function (v) { return v[i]; })); })
};

var rotYv = function (p, c, s) { return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };
var rotXv = function (p, c, s) { return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; };

/* ---- ink: the deck's own palette. Compass yellow is spent on ONE family
 * (the pack and the light bar) so the model has a single hot line, the same
 * way the page has a single CTA. ---- */
var FAM = { pw: '#ffd400', dr: '#3fd98a', bd: '#6ea8d8', gl: '#a9c6d8', gg: '#ff7a45', sg: '#ff5a4d', st: '#8fa099' };
var dimCol = 'rgba(110,168,216,.42)';
var inkCol = '#e7ede9';
var dispFont = 'Archivo', monoFont = 'JetBrains Mono';

/* ---- state ---- */
var W = 0, H = 0, dpr = 1;
var dragX = 0, dragY = 0, vx = 0, dragging = false, lx = 0, ly = 0, moved = 0, mx = -1, my = -1;
var autoRot = !reduce, shaded = false, isolate = false, zoom = 1, stripT = 0, spinA = 0, sel = -1, cyc = 0;
var pinch = { d: 0, on: false, pts: new Map() };

function resize() {
  var r = cv.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = r.width; H = r.height;
  cv.width = Math.max(1, W * dpr); cv.height = Math.max(1, H * dpr);
}
new ResizeObserver(resize).observe(cv);

/* ---- interaction ---- */
var lastBoxes = [], lastCents = [], lastIdx = [];
function hitAt(px, py) {
  if (px < 0 || !lastBoxes.length) return -1;
  var pad = 8 * dpr, best = -1, bd = 1e9;
  lastBoxes.forEach(function (b, i) {
    if (px >= b[0] - pad && px <= b[2] + pad && py >= b[1] - pad && py <= b[3] + pad) {
      var d = Math.hypot(lastCents[i][0] - px, lastCents[i][1] - py);
      if (d < bd) { bd = d; best = i; }
    }
  });
  return best;
}
cv.addEventListener('pointerdown', function (e) {
  dragging = true; moved = 0; vx = 0; lx = e.clientX; ly = e.clientY;
  var r = cv.getBoundingClientRect();
  mx = (e.clientX - r.left) * dpr; my = (e.clientY - r.top) * dpr;
  pinch.pts.set(e.pointerId, [e.clientX, e.clientY]);
  if (pinch.pts.size === 2) {
    var p = Array.from(pinch.pts.values());
    pinch.d = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]); pinch.on = true;
  }
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', function (e) {
  var r = cv.getBoundingClientRect();
  mx = (e.clientX - r.left) * dpr; my = (e.clientY - r.top) * dpr;
  if (pinch.pts.has(e.pointerId)) pinch.pts.set(e.pointerId, [e.clientX, e.clientY]);
  if (pinch.on && pinch.pts.size === 2) {
    var p = Array.from(pinch.pts.values());
    var d = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
    if (pinch.d) setZoom(zoom * (d / pinch.d));
    pinch.d = d; return;
  }
  if (!dragging) return;
  moved += Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly);
  var dx = (e.clientX - lx) * 0.008;
  vx = dx; dragX += dx;
  dragY = Math.max(-1, Math.min(1, dragY + (e.clientY - ly) * 0.006));
  lx = e.clientX; ly = e.clientY;
});
var up = function (e) {
  pinch.pts.delete(e.pointerId);
  if (pinch.pts.size < 2) pinch.on = false;
  /* A drag that barely moved is a tap, not a rotation. */
  if (dragging && moved < 12) {
    var best = hitAt(mx, my);
    if (best >= 0) { sel = lastIdx[best]; showDossier(PARTS[sel]); }
  }
  dragging = false;
};
cv.addEventListener('pointerup', up);
cv.addEventListener('pointercancel', up);
cv.addEventListener('pointerleave', function () { mx = my = -1; });
function setZoom(z) { zoom = Math.max(0.5, Math.min(3.2, z)); }
cv.addEventListener('wheel', function (e) {
  /* Only zoom on a deliberate modifier — a bare wheel must still scroll the
   * page, or the section becomes a scroll trap on a laptop. */
  if (e.shiftKey || e.ctrlKey) { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.1 : 0.9)); }
}, { passive: false });

var $ = function (id) { return document.getElementById(id); };
var bindBtn = function (id, fn, get) {
  var b = $(id); if (!b) return;
  b.addEventListener('click', function () { fn(); b.classList.toggle('on', get()); });
  b.classList.toggle('on', get());
};
bindBtn('rigRot', function () { autoRot = !autoRot; }, function () { return autoRot; });
bindBtn('rigShade', function () { shaded = !shaded; }, function () { return shaded; });
bindBtn('rigIso', function () { isolate = !isolate; }, function () { return isolate; });
var zi = $('rigZi'), zo = $('rigZo');
if (zi) zi.addEventListener('click', function () { setZoom(zoom * 1.2); });
if (zo) zo.addEventListener('click', function () { setZoom(zoom * 0.83); });

var stripEl = $('rigStrip');
var stripPinned = false;
if (stripEl) stripEl.addEventListener('input', function () { stripT = +stripEl.value / 100; stripPinned = true; });
var unpin = function () { stripPinned = false; };
addEventListener('wheel', unpin, { passive: true });
addEventListener('touchmove', unpin, { passive: true });
function onScroll() {
  /* Scroll drives the field-strip — until the visitor grabs the slider, at
   * which point their choice wins until they scroll again. */
  if (stripPinned || !stage) return;
  var r = stage.getBoundingClientRect(), range = r.height - window.innerHeight;
  if (range > 0) {
    var p = Math.max(0, Math.min(1, -r.top / range));
    stripT = p;
    if (stripEl) stripEl.value = Math.round(p * 100);
  }
}
addEventListener('scroll', onScroll, { passive: true });

/* ---- panel ---- */
var buildEl = $('rigGroups');
if (buildEl) {
  buildEl.innerHTML = GROUPS.map(function (g) {
    return '<button type="button" class="gchip on" data-g="' + esc(g) + '">' + esc(g) + '</button>';
  }).join('');
  buildEl.addEventListener('click', function (e) {
    var c = e.target.closest('[data-g]');
    if (!c) return;
    var g = c.dataset.g;
    enabled[g] = !enabled[g];
    c.classList.toggle('on', enabled[g]);
    updateHud();
  });
}
function activeParts() {
  return PARTS.filter(function (p) { return enabled[p.group]; });
}
function updateHud() {
  var act = activeParts();
  var v = act.reduce(function (s, p) { return s + p.v.length; }, 0);
  var ed = act.reduce(function (s, p) { return s + p.e.length; }, 0);
  var el = $('rigInfo');
  if (!el) return;
  el.innerHTML = [
    ['FILE', 'GG_RIG_ASSY.step'], ['FORMAT', 'WIREFRAME · B-REP'],
    ['PARTS', act.length + ' / ' + PARTS.length], ['VERTICES', v], ['EDGES', ed],
    ['WHEELBASE', '3,060 mm'], ['DRIVE', 'QUAD MOTOR'], ['STATUS', 'REPRESENTATIVE']
  ].map(function (kv) {
    return '<div class="ci"><span>' + kv[0] + '</span><b>' + kv[1] + '</b></div>';
  }).join('');
}
updateHud();

function showDossier(p) {
  var el = $('rigDossier');
  if (!el) return;
  el.innerHTML = '<h5>' + esc(p.learn.t) + '</h5><div class="spec">' + esc(p.spec) + '</div>' +
    '<p>' + esc(p.learn.b) + '</p><div class="go">' +
    p.learn.links.map(function (l) { return '<a href="' + esc(l[1]) + '">' + esc(l[0]) + ' →</a>'; }).join('') +
    '</div>';
}

setInterval(function () { cyc = (cyc + 1) % Math.max(1, PARTS.length); }, 2800);

/* ---- render -------------------------------------------------------------- */
function frame(t) {
  requestAnimationFrame(frame);
  if (document.hidden || !W) return;
  ctx.clearRect(0, 0, cv.width, cv.height);

  /* Drag has inertia; the model keeps turning briefly after release. */
  if (!dragging && Math.abs(vx) > 0.0002) { dragX += vx; vx *= 0.95; }
  /* Spinning parts stop as the assembly comes apart — a gearset turning in
   * mid-air while its housing floats away looks like a bug, not a feature. */
  if (!reduce) spinA += (1 - stripT) * 0.05;

  var yaw = (autoRot && !reduce ? t * 0.00030 : 0) + dragX + 0.62;
  var pitch = -0.20 + dragY + (autoRot && !reduce ? Math.sin(t * 0.0005) * 0.035 : 0);
  var cyv = Math.cos(yaw), syv = Math.sin(yaw), cxv = Math.cos(pitch), sxv = Math.sin(pitch);
  var wide = W > 900;
  var cx0 = cv.width * (wide ? 0.40 : 0.5), cy0 = cv.height * 0.56;
  var fit = Math.min(W, H * 1.5) * dpr;
  /* The intact rig should fill the frame, and the field-stripped one must
   * still FIT it. The original coupe zoomed IN as it exploded, which worked
   * for a low car whose parts travel sideways; an SUV's parts travel upward
   * (roof rack, glass roof) and the top of the assembly walked off the canvas.
   * So: start bigger, then back the camera off as the strip progresses. */
  var scale = fit * (wide ? 0.40 : 0.36) * (1 - stripT * 0.22) * zoom * (isolate ? 1.4 : 1);
  var exF = isolate ? 0 : Math.pow(stripT, 1.35) * 0.72, DIST = 4.4;
  var focus = (isolate && sel >= 0) ? PARTS[sel].c : [0, 1.05, 0];

  var proj = function (p) {
    var q = [p[0] - focus[0], p[1] - focus[1], p[2] - focus[2]];
    q = rotYv(q, cyv, syv); q = rotXv(q, cxv, sxv);
    var z = q[2] + DIST, f = scale / z;
    return [cx0 + q[0] * f, cy0 - q[1] * f, z];
  };
  var depthA = function (z) { return Math.max(0.26, Math.min(1, 1.5 - (z - DIST) * 0.5)); };

  /* Dimension box — dashed, and it steps out of the way once the model is
   * mostly field-stripped (the parts have travelled outside it by then). */
  if (!isolate && stripT < 0.85) {
    var cn = [[BB.min[0], BB.min[1], BB.min[2]], [BB.max[0], BB.min[1], BB.min[2]],
              [BB.max[0], BB.max[1], BB.min[2]], [BB.min[0], BB.max[1], BB.min[2]],
              [BB.min[0], BB.min[1], BB.max[2]], [BB.max[0], BB.min[1], BB.max[2]],
              [BB.max[0], BB.max[1], BB.max[2]], [BB.min[0], BB.max[1], BB.max[2]]].map(proj);
    ctx.strokeStyle = 'rgba(110,168,216,.15)'; ctx.lineWidth = dpr;
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]
      .forEach(function (pr) {
        ctx.beginPath(); ctx.moveTo(cn[pr[0]][0], cn[pr[0]][1]); ctx.lineTo(cn[pr[1]][0], cn[pr[1]][1]); ctx.stroke();
      });
    ctx.setLineDash([]);
    ctx.fillStyle = dimCol; ctx.font = 10 * dpr + 'px "' + monoFont + '",monospace';
    ctx.textAlign = 'center';
    ctx.fillText('◄ 5,100 mm ►', (cn[0][0] + cn[1][0]) / 2, Math.max(cn[0][1], cn[1][1]) + 18 * dpr);
  }

  var act = (isolate && sel >= 0)
    ? PARTS.filter(function (p) { return p.group === PARTS[sel].group; })
    : activeParts();
  var hovBest = mx >= 0 ? hitAt(mx, my) : -1;
  var hovI = hovBest >= 0 ? lastIdx[hovBest] : -1;
  lastBoxes = []; lastCents = []; lastIdx = [];
  /* With no pointer and nothing selected the model narrates itself, cycling
   * one callout at a time — an idle canvas should still be telling you what
   * you are looking at. */
  var hotIdx = sel >= 0 ? sel : (mx >= 0 ? -2 : PARTS.indexOf(act[cyc % Math.max(1, act.length)] || act[0]));

  act.forEach(function (part) {
    var i = PARTS.indexOf(part);
    var off = [part.ex[0] * exF, part.ex[1] * exF, part.ex[2] * exF];
    var ca = part.spin ? Math.cos(spinA) : 1, sa = part.spin ? Math.sin(spinA) : 0;
    var world = function (p) {
      var x = p[0], y = p[1];
      if (part.spin) {
        var dx = p[0] - part.spin[0], dy = p[1] - part.spin[1];
        x = part.spin[0] + dx * ca - dy * sa;
        y = part.spin[1] + dx * sa + dy * ca;
      }
      return [x + off[0], y + off[1], p[2] + off[2]];
    };
    var pts = part.v.map(function (p) { return proj(world(p)); });
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    pts.forEach(function (p) {
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    });
    lastBoxes.push([x0, y0, x1, y1]); lastIdx.push(i);
    var cc = proj(world(part.c)); lastCents.push(cc);

    var hot = i === sel || i === hovI || (sel < 0 && mx < 0 && i === hotIdx);
    var col = FAM[part.fam] || '#888';

    if (shaded && part.f && part.f.length) {
      part.f.map(function (fc) {
        return { idx: fc, z: fc.reduce(function (s, vi) { return s + pts[vi][2]; }, 0) / fc.length };
      }).sort(function (a, b) { return b.z - a.z; }).forEach(function (fc) {
        ctx.beginPath();
        fc.idx.forEach(function (vi, k) { k ? ctx.lineTo(pts[vi][0], pts[vi][1]) : ctx.moveTo(pts[vi][0], pts[vi][1]); });
        ctx.closePath();
        ctx.fillStyle = col; ctx.globalAlpha = 0.11; ctx.fill(); ctx.globalAlpha = 1;
      });
    }

    ctx.strokeStyle = col;
    ctx.lineWidth = (hot ? 1.8 : 1) * (part.thin ? 0.55 : 1) * dpr;
    ctx.shadowColor = col;
    ctx.shadowBlur = (part.thin ? 0 : (hot ? 11 : 4)) * dpr;
    part.e.forEach(function (pr) {
      ctx.globalAlpha = (hot ? 1 : 0.78) * depthA((pts[pr[0]][2] + pts[pr[1]][2]) / 2);
      ctx.beginPath();
      ctx.moveTo(pts[pr[0]][0], pts[pr[0]][1]);
      ctx.lineTo(pts[pr[1]][0], pts[pr[1]][1]);
      ctx.stroke();
    });
    ctx.shadowBlur = 0; ctx.globalAlpha = 0.4; ctx.fillStyle = col;
    pts.forEach(function (p) { ctx.fillRect(p[0] - dpr, p[1] - dpr, 2 * dpr, 2 * dpr); });
    ctx.globalAlpha = 1;

    if (hot) {
      /* The callout sits beside the model on a wide canvas. On a narrow one
       * the model is centred rather than pushed left, so a mid-height
       * callout lands ON TOP of it — put it above instead. */
      var lx2 = 16 * dpr, ly2 = cv.height * (wide ? 0.62 : 0.22);
      ctx.globalAlpha = 0.9; ctx.strokeStyle = col; ctx.lineWidth = dpr;
      ctx.beginPath(); ctx.moveTo(cc[0], cc[1]); ctx.lineTo(lx2 + 4 * dpr, ly2 - 19 * dpr); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cc[0], cc[1], 3 * dpr, 0, 7); ctx.fill();
      ctx.textAlign = 'left';
      ctx.font = '700 ' + 13 * dpr + 'px "' + dispFont + '",sans-serif';
      ctx.fillText(part.label, lx2, ly2);
      ctx.font = 9 * dpr + 'px "' + monoFont + '",monospace';
      ctx.fillStyle = inkCol;
      ctx.fillText(part.spec, lx2, ly2 + 13 * dpr);
      ctx.globalAlpha = 1;
    }
  });

  /* axis gizmo */
  var ax = 40 * dpr, ay = cv.height - 40 * dpr, al = 20 * dpr;
  var AX = function (x, y, z) {
    var q = rotYv([x, y, z], cyv, syv); q = rotXv(q, cxv, sxv);
    return [ax + q[0] * al, ay - q[1] * al];
  };
  [[FAM.pw, 1, 0, 0, 'X'], [FAM.dr, 0, 1, 0, 'Y'], [FAM.bd, 0, 0, 1, 'Z']].forEach(function (a) {
    var p = AX(a[1], a[2], a[3]);
    ctx.strokeStyle = a[0]; ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(p[0], p[1]); ctx.stroke();
    ctx.fillStyle = a[0]; ctx.textAlign = 'left';
    ctx.font = 9 * dpr + 'px "' + monoFont + '",monospace';
    ctx.fillText(a[4], p[0] + 3 * dpr, p[1]);
  });

  var lab = $('rigLabel');
  if (lab) {
    lab.textContent = isolate
      ? '// ISOLATED — ' + (sel >= 0 ? PARTS[sel].group : '—')
      : stripT < 0.04 ? '// ASSEMBLY — INTACT'
      : stripT > 0.96 ? '// FIELD-STRIP — COMPLETE'
      : '// FIELD-STRIP — ' + Math.round(stripT * 100) + '%';
  }
}

resize(); onScroll(); requestAnimationFrame(frame);
})();
