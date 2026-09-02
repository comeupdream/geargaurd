# GEAR GUARD GARY — `$RIVN`

A blueprint-ready deck for a gear-themed community token: a read-only FastAPI
readout service, a zero-dependency static site, and one `render.yaml` that
brings both up with nothing typed into a dashboard.

> **Not affiliated with Rivian Automotive, Inc.** This is an independent,
> unofficial community project. It is not endorsed by, sponsored by, or
> connected to Rivian Automotive or any vehicle manufacturer, and it uses no
> manufacturer's trademarks, logos or vehicle designs — the rig on the page is
> an original wireframe drawing of a generic three-row electric SUV.
> **`$RIVN` here is a token ticker, not a stock**, and confers no claim on the
> RIVN equity listed on NASDAQ. That collision is the single most confusable
> thing about this project, which is why the disclaimer is in the page footer
> as well as here.

---

## What is in the box

```
gearguard/
  render.yaml          the blueprint — two services, no dashboard fields required
  backend/             read-only FastAPI readout service
    app/config.py      settings; every one has a working default, none is a secret
    app/feeds.py       DexScreener (token, by contract) + Pyth Hermes (majors)
    app/main.py        the API — GET only, and a test that keeps it that way
    tests/test_api.py  the posture guard plus the honest-empty-state tests
  site/                the deck — hand-written HTML/CSS/JS, no build step
    index.html         five sections: Guard / Rig / Drivetrain / Charge / Trail
    build.sh           stamps API_URL into config.js; that is the entire "build"
    assets/js/gary.js  THE RIG — the procedural wireframe SUV
    assets/js/enhance.js  the charging section numbers + the gauge cluster
    assets/js/token.js    the live readout, and its five honest empty states
    assets/css/gg.css     the theme, and why each colour is where it is
```

## Deploy

**One click.** New → Blueprint → pick the repo → Apply. Nothing else is
required for a working deploy: there are no credentials anywhere in this
project, because every upstream it reads is keyless and it never writes.

Two things to know before you apply:

1. **`render.yaml` sits at this repository's root, which is where it belongs** —
   Render only auto-detects a blueprint there, so this repo deploys as written
   with no path edits. If you ever vendor this project *inside* a larger repo
   (it started life as a `gearguard/` directory in one), the blueprint needs
   two changes: move it to that repo's root and prefix both `rootDir` values
   with the directory name.

2. **`API_URL` on the static site must be the backend's PUBLIC url.** Do not
   wire it with `fromService … property: host` — that resolves to the internal
   service name (`gearguard-api`, no domain), reachable only inside the host's
   private network. A browser cannot resolve it and the deck loads straight to
   "backend unreachable" with nothing in the logs to explain why. Copy the URL
   from the backend's own service page, and redeploy the site after any rename
   or custom domain.

Set `TOKEN_CONTRACT` in the dashboard when the mint exists. Until then the API
answers `status="unset"` and the deck says **CONTRACT NOT SET** — no redeploy
of the site is needed to go live, only that one variable.

## Run it locally

```bash
# backend  ->  http://localhost:8000  (/health, /api/state, /docs)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
pytest -q                     # 6 tests

# site  ->  http://localhost:8777
cd site && python -m http.server 8777
```

`site/config.js` ships pointing at `http://localhost:8000`, so the two halves
find each other with no configuration. Running `./build.sh` overwrites that
file (which is exactly what the deploy does); `git checkout site/config.js`
restores the dev default.

---

## The posture, and why it is load-bearing

Every wing of this project reads. **None of it writes.**

- **No write path, and none planned.** The API serves `GET` only, and
  `tests/test_api.py::test_no_write_path` fails the build the moment any other
  method appears on any route. The day it does, custody or authority has
  silently moved onto a box sitting at a public URL — a decision worth making
  deliberately rather than discovering in a diff.
- **No key, no wallet, no signing.** Buying happens in the visitor's own wallet
  on a DEX they choose. Nothing here can spend on anyone's behalf.
- **Priced by contract, never by symbol.** A copycat mint using the same ticker
  cannot inherit this token's quote, because the ticker is never what is looked
  up.
- **A shallow pool is not a price.** Anything under `MIN_LIQUIDITY_USD` is
  reported as too thin to quote. A fifty-dollar puddle moves 40% on one buy,
  and a market cap built on it is fiction.
- **A dark feed is not a zero.** When an upstream stops answering, the last good
  reading stays, visibly aged, and the lamp turns. It is never replaced by
  `$0.00` — "we cannot see it" and "it is worthless" are different facts, and
  the readout exists to keep them apart.
- **No contract means no price.** With `TOKEN_CONTRACT` blank the page says so
  rather than rendering a placeholder chart.

The five statuses (`unset` / `no_pool` / `thin` / `dark` / `live`) each get
their own rendering in `token.js`. Coercing them all into one number would be
the most dishonest thing this page could do, so none of them is allowed to
become a zero.

---

## Design lineage

Two sources, deliberately fused, and documented at the top of each file.

**From XAT Racing (`comeupdream/XATRACING`) — the discipline:**

- **The filling number.** XAT's ghost livery numbers behind section heads fill
  bottom-up as the section scrolls through, using `background-clip: text` with
  an animated `background-size`. Ported whole — including the `line-height:
  1.3` fix (at `1` the glyph ink overflows the box top and the cap tops never
  fill) and the separate `::before` outline layer (a stroke on the filled
  element straddles the glyph edge and reads as an unfilled rim). **Retuned as
  a state of charge:** the fill runs charge green → compass yellow, because an
  EV's number that fills is a battery, not a fuel tank.
- **The wireframe car.** XAT's "Glass Garage" canvas-CAD engine — drag to
  rotate, scroll to field-strip, isolate, tap a part for its dossier. The
  engine is ported faithfully; the subject is new (see below).
- **One go colour, spent sparingly.** XAT's chartreuse redline becomes
  `--gg-compass`. Live status, the primary CTA, a charged battery — and
  nothing else. Scarcity is the point.
- **Near-black surfaces, accents as light not paint; the horizon streak; mono
  for anything that smells like a spec sheet.**
- **Slats became gear teeth.** Same idea — one procedural band pattern as the
  brand's texture — different tooling, on a project named for a gear.

**The rig — what changed from the coupe:**

XAT's model is a long-hood fastback coupe. This one is a three-row electric
SUV, at real proportions (5.1 m long, 2.0 m tall, 0.81 m tyres — height:length
lands at 0.39, which is what makes it read as an SUV and not a tall wagon).
The parts changed with it: a skateboard battery pack instead of an iron six,
four drive units instead of a gearbox and driveshaft, air springs instead of
coil-overs, and the vertical-stadium lamps with a full-width bar between them
that are the entire face.

Two departures worth knowing about, both marked in the code:

- **The type is upright, not italic.** XAT's shear echoes a logo built on a
  −14° skew. Nothing here is skewed, so an italic livery number would be
  borrowed attitude.
- **The camera backs off as the model comes apart.** The coupe zoomed *in*
  while exploding, which works when parts travel sideways. An SUV's parts
  travel upward (roof rack, glass roof) and walked off the top of the canvas,
  so the strip now zooms out as it progresses.

**The gears are real geometry.** `cogZ()` emits an actual toothed profile —
root and tip radii alternating around the circumference — plus a hub and
spokes, and the reduction gearsets spin with the wheels. On a project called
GEAR GUARD, the gear is the one asset that cannot be faked.

---

## Conventions

- **No new dependencies on the frontend.** No bundler, no chart library, no
  3D library. The gauges are hand-rolled SVG and the rig is hand-rolled canvas
  because one dial and one model do not earn a bundle. Keep it that way.
- **The backend's dependency list is short on purpose** — no database, no
  wallet library, no signing stack, because it never writes anything anywhere.
- Before committing a non-trivial change: run `pytest -q` in `backend/`, and
  load the site with the backend down to confirm every live figure still reads
  `--` with a stated reason rather than a zero.
