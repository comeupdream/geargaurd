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

`TOKEN_CONTRACT` ships set to the live contract. Blank is still a supported,
honest state: the API then answers `status="unset"` and the deck says
**CONTRACT NOT SET** rather than inventing a price.

### The contract address lives in two places, and they must match

`site/index.html` carries the address a visitor copies out of the hero.
`TOKEN_CONTRACT` carries the address the price is read from. They come from
different places — the page vs. the backend's environment — so they *can*
drift, and a page that hands out one address while quoting another is the
worst thing this deck could do to someone.

Two defences, and you want both:

- **Change them together, always.** Nothing syncs them for you.
- **The page checks itself.** On every poll `token.js` compares the address in
  the hero against the one the backend reports and, if they disagree, raises a
  red mismatch warning naming both. It fails loud rather than quietly showing
  two different strings in two parts of the same page.

The address is rendered **verbatim, mixed case and all** — that casing is the
EIP-55 checksum, and lower-casing it for tidiness throws away the one thing
that catches a mistyped or swapped address.

`TOKEN_CHAIN` is only a **display label and a fallback**. The upstream looks a
contract up across every chain it indexes, so it narrows nothing — and when a
live pool answers, the chain that pool actually trades on replaces the
configured string in the response. The measurement wins over the config.

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

## The token and the reward are two different things

- **`$GARY` is the token you hold.** It is not a stock and confers no claim on
  any equity.
- **Tokenized RIVN on Robinhood Chain is what holders receive.** RIVN is named
  on the page only to say what the reward is denominated in.

Keeping those names distinct is deliberate. "Hold $RIVN, receive RIVN" was
self-contradictory, and a ticker identical to the equity it pays out is exactly
the confusion the footer then has to spend three paragraphs undoing. The two
live in `TOKEN_SYMBOL` and `REWARD_ASSET` / `REWARD_NETWORK`.

## Charts and metrics

`GET /api/token/history?range=1d|7d|30d|90d` serves OHLCV candles from
GeckoTerminal, read from **the same pool that produced the headline price** —
the pool address is carried through from the quote rather than looked up
again, so the chart and the number above it can never describe two different
markets. An unknown `range` falls back to the default instead of erroring.

Its statuses extend the token's own: `no_history` (pool exists, too new for
candles) and `unsupported_chain` (no candle source mapped for that chain —
reported rather than guessed, because a wrong network slug returns *somebody
else's* candles, which is far worse than an empty chart).

The frontend (`site/assets/js/charts.js`) draws price, volume and buy/sell
flow as hand-rolled SVG. Rules that are load-bearing:

- **Data ink is not deck chrome.** The series palette is a separate,
  *validated* set (blue `#3987e5`, aqua `#199e70`, red `#e66767`) — checked
  against the card surface for lightness band, chroma, normal-vision
  separation and contrast. Deck yellow/green/blue are status and chrome; a
  line on a chart must never be mistaken for a status light.
- **The one WARN is mitigated, not ignored.** Aqua↔red sits in the CVD warn
  band, which is legal *only* with secondary encoding — so the flow meter
  always ships direct labels and a 2px gap. Those labels are not decoration.
- **Never a dual axis.** Price and volume are stacked charts on one shared
  x-axis. Two y-scales in one frame let the series be slid past each other
  until any story you like appears.
- **Pixel units, not a stretched viewBox.** `preserveAspectRatio="none"` is
  fine for paths and fatal for text — it smears glyphs horizontally by a
  different amount on every screen. The SVG is drawn at the container's
  measured width so one unit is one CSS pixel.
- **Every chart has a table twin.** A value that exists only inside a hover
  tooltip is one keyboard and screen-reader users do not have.
- **A declared scale on every meter.** The channel rows print their maximum
  ($250K, $5M …), because a bar with an invisible ceiling is decoration that
  looks like information. An unmeasured row shows an empty track, never a
  zero-width bar — those look identical and mean opposite things.

## Design lineage

Two sources, deliberately fused, and documented at the top of each file.

Three repos, fused. The rule that keeps the fusion from becoming soup: **each
lineage owns a different layer.** XAT owns the surface and the colour budget,
Mnemonic 2047 owns the frame around content, MangoMatrix owns the readouts
inside it. When two of them want the same element, the surface rule wins —
that is what stops a HUD from turning into a gamer dashboard.

**From Mnemonic 2047 (`comeupdream/HOFFMAN-TACTICAL`) — the chrome:**

- **Corner brackets** (`.bracketed`), scoped to a card rather than the
  viewport, drawn with two pseudo-elements so any box can wear them without
  extra markup.
- **A scanline film that flickers** (`.filmed`). A static scanline overlay
  reads as a texture; one that stutters on a slow irregular cycle reads as a
  live display. Three steps on a 7s loop — any faster is a strobe.
- **A status lamp that pulses in exactly one state.** A lamp that animates
  always is decoration; one that animates only when live is a signal you can
  read across the room.
- **A telemetry rail** under the header, carrying real readings or `--`. A
  rail of decorative numbers is the fastest way to teach a visitor that
  nothing on the page means anything.
- **Orbitron** as the display face, spent only on the wordmark and the hero.
  Used wider it turns every heading into signage and the page loses hierarchy.

**From MangoMatrix LIVE (`comeupdream/dragonfruit-drive`) — the instrument
panel:**

- **Channel rows** — compact label / value / meter / scale rows, ported from
  its layer rack. Magnitude visible without reading every number.
- **A glow on live values only** (`.lit`). Spend it on static copy and it
  stops meaning "this is moving".
- **The JP micro-subtitle.** Both this and XAT independently reached for it,
  which is why it earned a place; decorative only, `aria-hidden`, never
  carrying meaning a reader needs.

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
