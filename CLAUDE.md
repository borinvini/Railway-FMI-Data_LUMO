# CLAUDE.md — Finnish Railway Delay & Weather Dashboard

## Purpose & audience

Interactive **event demo**: a map of Finland with train routes. Selecting a route shows its
delay behaviour and the weather conditions along it. It will be shown on a screen at an
event to a **mixed, mostly non-technical audience**, then hosted as a **static site on
Hostinger**.

Design rules that follow from that:

- **Minimalist, dark-mode design.** The UI is dark-themed only (no light mode, no theme
  toggle): near-black background, muted grey text, one restrained accent, and colour used
  almost exclusively to encode delay. Few elements on screen, generous spacing, thin
  typography, no gradients/shadows/decorative chrome, no clutter. The map is the hero; the
  side panel and legend are quiet, translucent dark surfaces that stay out of its way.
- Attractive first, dense second. A visitor should get value within ~5 seconds of touching it.
- **Plain language in all UI copy.** No unexplained jargon ("p90", "differenceInMinutes",
  "EMS"). Say "typically X min late", "on time (≤ 5 min)", "worst 10% of trips".
- Readable from a distance: large type, high contrast, generous click targets.
- Must be robust on event wifi: small payloads, no runtime calls to third-party APIs except
  basemap tiles, no server.
- No API keys, secrets or logins anywhere in the page.

## Stack

| Layer | Choice |
|---|---|
| Build | **Vite + React + TypeScript + Tailwind CSS**, `base: './'` so it works in any Hostinger subfolder |
| Basemap | **MapLibre GL JS** (v4) on **OpenFreeMap** vector tiles (free, keyless, OpenMapTiles schema), **restyled in code** to the Finnish-flag "Nordic night" palette (see *Map style*). Google Maps was considered and rejected: needs an API key + billing, and the key would sit in the page. |
| Data layers | **deck.gl** (v9) via `MapboxOverlay` (`interleaved: false`, `pickingRadius: 10`): `PathLayer` routes, `ScatterplotLayer` stations, optional `TripsLayer` attract-loop |
| Panel charts | Chart.js (framework-agnostic; call its API directly inside a `useEffect` — no React-charting library needed) |
| Data prep | Python 3, `fastparquet` + `pandas` (see gotchas) |
| Hosting | Static upload of `dist/` to Hostinger (File Manager / FTP) |

deck.gl is an overlay framework, not a basemap — that is why MapLibre is used underneath.
MapLibre and deck.gl are plain JS libraries; use them the same way inside React as in the
prototype — create the `maplibregl.Map` and `MapboxOverlay` instances in a `useEffect` on a
`div` ref inside `Map.tsx`, no React-specific map wrapper (e.g. `react-map-gl`) needed.

### Map style

**Approved by the user** (prototype in `prototype/`, served with
`python -m http.server 8765` from that folder). Reproduce it, do not redesign it.

Dark navy basemap with Finland highlighted so the delay colours read from across a room.
Routes: wide translucent glow under a bright core line. Stations: small white dots. Legend in
plain words ("on time" → "8+ min late"). Use the `dataviz` skill for colour and chart
decisions; keep colours colour-blind safe and check contrast on dark.

**Basemap palette — "Nordic night"** (derived from the Finnish flag: blue is Pantone 294 C =
`#002F6C`, white `#FFFFFF`, 18:11 proportions; replaced the earlier Snazzy charcoal/gold look by
request):

| Role | Value |
|---|---|
| Land (rest of world) | `#0d1b2e` |
| **Finland land** (highlight) | `#16304f` |
| Water | `#040b16` (labels `#3a5070`) |
| Ice accent: country labels, borders, Finland outline, motorways | `#9cc3e8` |
| City labels | `#c9d6e3` |
| Other labels / road / other boundaries | `#7f93a8` / `#2a3d55` / `#1f3048` |
| Label halo | `#02060d` (width 1.2) |
| Outside-Finland dim | `#02060d` overlay, opacity `0.5` (`outsideDim`; `1.0` hides neighbours) |
| UI surface | `rgba(6,16,31,.82)` + 1px `rgba(156,195,232,.14)` border, 10px radius, `backdrop-filter: blur(8px)` |
| UI text / muted | `#eaf1f8` / `#8597ab`, weight 300, `system-ui` |

A small SVG Finnish flag (`components/FinnishFlag.tsx`) sits in the title card.

**Delay ramp** (snow white → amber → crimson; lightness falls steadily so it survives
colour-blindness), linear interpolation over 0–8 min average delay: `#f1f6fb` → `#ffb340` →
`#e8344e`. Single source of truth: `DELAY_RAMP_HEX` in `lib/colors.ts` (the legend reads it too).
Chosen to fit the Finnish-flag "Nordic night" theme; replaces the earlier teal → amber → rose
(green/yellow/red) ramp. A dark navy outline ring around each pin keeps white pins distinct from
the ice-white route lines.

**Route line colour.** Connection lines use the same ice accent as the `Ice accent` row above
(country labels/borders/motorways/Finland outline): glow `#9cc3e8`, core `#eaf3fc`. (Earlier gold
`#e5c163`/`#fde4a8` and a light-magenta variant were tried and replaced.)

**Highlighting Finland.** The tiles have no per-country land shapes, so use a Finland outline
(Natural Earth via `datasets/geo-countries`, ISO `FIN`, 42 polygons incl. Åland, ~112 KB,
outer rings only) shipped as `finland.geojson` with three features: `land` (solid Finland),
`mask` (world rectangle with Finland as holes), `outline` (lines). Layer order: `land` fill
directly above `background` (below water so lakes stay dark) → `mask` fill (`#02060d`, 0.5) as the
**top** MapLibre layer so it also dims foreign labels → ice `outline` line (0.6 opacity, 1.1 px).

**Restyle recipe** (fetch `https://tiles.openfreemap.org/styles/dark`, mutate, `setStyle`):
- Drop nothing structural; **hide** (`visibility: none`) layers whose id starts with:
  `landcover`, `landuse`, `building`, `aeroway`, `road_`, `highway_path`, `highway_minor`,
  `highway_major_casing`, `highway_major_subtle`, `highway_motorway_casing`,
  `highway_motorway_subtle`, `highway_name`, `railway`, `place_other`, `place_suburb`,
  `place_village`. OSM rail lines are hidden so they never compete with our routes.
- Recolour: `background`, `water`, `waterway`, `water_name` (`#3a5070`),
  `highway_major_inner` (`#2a3d55`, opacity .35), `highway_motorway_inner` (ice, opacity .28),
  `boundary_country*` (ice, opacity .35), other `boundary*` (`#1f3048`),
  `place_country*` labels ice, remaining `place_*` labels `#c9d6e3` (`place_state` `#7f93a8`).
- **Ship a snapshot of the restyled style JSON in the repo** rather than fetching and mutating
  at runtime, so the page depends only on tile requests (event wifi).

**Camera — pitched 3D view, exact values locked by the user, do not recompute.** The map is
tilted (not flat top-down) and can be rotated by the visitor; these exact numbers are the
fixed default for first load **and** for the reset button, so both land pixel-identical
regardless of window size:

```js
const DEFAULT_VIEW = {
  center: [24.635713828561506, 63.3503682327765],
  zoom: 5.853516957291411, pitch: 61.37740676562255, bearing: -14.062336607182147,
};
```

Finland is drawn offset to the right (centre at ~68% of the width) to leave the left side free
for a statistics column: `map.setPadding({ left: LEFT_PANEL_FRACTION × width })` (0.36, in
`lib/mapStyle.ts`) right after construction and on `resize`. The `DEFAULT_VIEW` numbers are
unchanged — use padding, not a shifted `center`, so it stays window-size independent and Reset
view / station fly-tos honour it automatically.

Set directly on the `Map` constructor (`...DEFAULT_VIEW`) — do **not** derive the default via
`fitBounds`/padding; that was tried first and recomputes slightly per viewport, so it can't
reproduce an exact saved camera. `minZoom 3.5`, `maxZoom 9`, `maxPitch 70`. Do **not** use
`maxBounds` — it silently forced a too-high zoom on wide screens.

**Rotation stays enabled** (`dragRotate`/`touchZoomRotate` default on — this is deliberate, the
user asked for it) so visitors can explore the 3D view. To keep an unattended kiosk from
getting stuck at a confusing angle:
- `maplibregl.NavigationControl({ showZoom: false, visualizePitch: true })` top-right, restyled
  dark to match the UI (`.maplibregl-ctrl-group` background/border, no default box-shadow).
- A **"Reset view" button** (bottom-left, near the legend) that fades in only once the camera
  drifts from `DEFAULT_VIEW` (`>1°` pitch/bearing or `>0.3` zoom — listen on the map's `rotate`,
  `pitch` and `zoom` events) and calls `map.flyTo({ ...DEFAULT_VIEW, duration: 600 })`.
- A horizon fade (`#horizon`, CSS gradient over the top ~40% of the map, `pointer-events: none`)
  softens the edge where the tilted plane meets empty space above Finland.

**Route interaction.** Two `PathLayer`s (glow 9 px / selected 14 px, core 2.4 px / hover-selected
4 px, `widthUnits: 'pixels'`). Selected route stays full opacity, others dim to ~8% glow / ~55
core alpha. Hover tooltip: "A → B, X min late on average". Click opens the side panel; click
empty map, ✕ or Esc closes it. Lines are thin, so keep `pickingRadius` ≥ 10 for touch.

## Product decisions (defaults — change only if the user says so)

1. **A "route" = an origin→destination pair** (~145 lines, aggregated over the month). Click
   → side panel with headline delay numbers, per-leg delay build-up (where along the route it
   gets worse), daily delay, delay vs. weather, causes, and the worst individual runs.
2. **Pre-aggregated static JSON** — the browser never loads the parquet.
3. **Minimalist dark-mode design end to end** — dark basemap, dark UI panels and charts; map
   look fixed by the approved prototype (see *Map style*).
4. **Ships with January 2020 only, but the build is month-extensible** — it globs
   `data/raw/*.parquet` and keys output by month.

## Repo layout

```
Railway-FMI-Data_LUMO/
  CLAUDE.md
  data/raw/        matched_data_flat_2020_01.parquet   (34 MB, git-ignored)
                   metadata_closest_ems_to_train_stations.csv  station coords + closest EMS, committed
  data/derived/    stations.json                        (cached/derived station metadata, committed)
  scripts/build_data.py                                 parquet + CSV -> web/public/data/*.json
  prototype/       index.html data.json finland.geojson  approved map look — plain HTML/JS,
                                                          source of truth for palette/camera/
                                                          interaction; port into React below
  web/                                                  Vite + React + TS + Tailwind app (scaffolded)
    index.html
    src/
      main.tsx  App.tsx
      components/Map.tsx  components/RoutePanel.tsx  components/Legend.tsx
      lib/colors.ts  lib/mapStyle.ts  lib/types.ts
    public/data/routes.json  finland.geojson             copied from prototype/ for now —
                                                          scripts/build_data.py should
                                                          eventually regenerate these
    vite.config.ts  tsconfig*.json                        no tailwind.config.ts: Tailwind v4
                                                          is CSS-first config (@import
                                                          "tailwindcss" in src/index.css),
                                                          via the @tailwindcss/vite plugin
  dist/                                                 build output -> upload to Hostinger
```

Note: the parquet lives in `data/raw/` (git-ignored); the scripts look there first via
`routes_lib.find_parquets()`.

**Before deploying `dist/` to Hostinger, open it in an ordinary desktop browser** (not just
via automation tooling) and confirm the map renders — see the MapLibre worker gotcha below;
one dev session's automated browser could not get a conclusive read on the production build
specifically (masked/opaque Worker error, looked like a CORS/CSP artifact of that tool's own
environment) even though `npm run dev` was fully verified interactively and the build emits
the worker asset correctly.

## Data facts (matched_data_flat_2020_01.parquet)

| Fact | Value |
|---|---|
| Rows | 587,338 — one per train × station × event |
| `type` | `ARRIVAL` / `DEPARTURE`, 293,669 each |
| Period | 2020-01-01 → 2020-01-31 |
| Category | `Long-distance` only (IC 373k, S 120k, HDM, AE, PYO, HSM, PVV, MV, V) |
| Train runs | 7,710; run key = `departureDate` + `trainNumber` |
| Stations | 409 distinct `stationShortCode` |
| OD pairs | 145 (first→last stop of a run); top: HKI→TKU 364, HKI→OL 233, PRI→TPE 219 |
| Stops per run | median 31, max 120 |
| `differenceInMinutes` | mean +2.2, median +1, p75 +2, range −96…+201 |
| Delay causes | only 5,314 rows non-empty; `categoryCode` letters (L, M, T, J, K…) |
| Weather | ~120 columns: 12 instantaneous variables + 12h/24h/72h min/max/mean rollups, from the FMI station in `closest_ems` (`closest_ems_distance_km` gives distance) |

Useful columns: `trainNumber`, `departureDate`, `trainType`, `stationShortCode`,
`stationName`, `type`, `scheduledTime`, `actualTime`, `differenceInMinutes`, `cancelled`,
`causes`, `closest_ems`, `closest_ems_distance_km`, `Air temperature`, `Wind speed`,
`Gust speed`, `Snow depth`, `Precipitation intensity`, `Horizontal visibility`,
`Present weather (auto)`.

**Delay convention:** delay = `differenceInMinutes` on `ARRIVAL` rows. Negative = early.
"On time" = ≤ 5 min late (state the threshold in the UI); clamp early arrivals to 0 for
averages shown to visitors. Do not expose the `_offset` variants.

## Gotchas (all verified)

- **`pyarrow` is broken** in the user's conda env (`ModuleNotFoundError: pyarrow.lib`). Use
  `fastparquet`: `ParquetFile(path).to_pandas(columns=[...])`. Always read only needed
  columns — the file has ~150.
- **No coordinates in the parquet.** Get them from
  `data/raw/metadata_closest_ems_to_train_stations.csv` (columns: `train_lat`, `train_long`,
  `passengerTraffic`, `train_station_name`, `train_station_short_code`, `closest_ems_station`,
  `ems_latitude`, `ems_longitude`, `distance_km`) — this also already carries each station's
  closest FMI EMS station and its distance, so it replaces the `closest_ems` /
  `closest_ems_distance_km` join too. No network fetch needed. Cache/derive the result into
  `data/derived/stations.json`; never fetch at page-load time.
- **Double-encoded UTF-8 in the parquet** (station codes like `KÄP` print as `K�P`). Normalise
  with `s.encode('latin-1').decode('utf-8')` (guard with try/except) before joining on
  `stationShortCode`. Without it 30 of 409 stations silently drop off the map; with it, 408
  match.
- **`HMK` has no coordinates in the CSV either** — add a manual override in the build script.
- `causes` is a **stringified list of dicts**, not JSON; parse with `ast.literal_eval`.
- **MapLibre worker loading (critical, breaks the map silently in every mode).** MapLibre spawns
  a Web Worker to decode vector tiles, resolved at runtime as a **sibling file next to its own
  module's URL** (`new URL('./maplibre-gl-worker.mjs', import.meta.url)`). That only works when
  maplibre-gl's own file is served unbundled — Vite's build inlines it into the app bundle, so
  the runtime request ends up looking for a worker file beside the bundled chunk that was never
  emitted (Vite can't statically see that dynamic construction to know to copy it). Symptom: the
  worker's network request sits **"pending" forever**, no console error, the style/attribution
  loads (so it looks like it *should* work) but no tiles ever render — a flat grey/gradient
  basemap with no land/water/labels. Fix, required for `npm run dev` **and** `npm run build`:
  ```ts
  import maplibregl from 'maplibre-gl'
  import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
  maplibregl.setWorkerUrl(maplibreWorkerUrl)   // before any `new maplibregl.Map(...)`
  ```
  The `?url` import makes Vite emit the worker as a real hashed asset and gives its correct
  built (base-path-aware) URL. Verify the fix actually worked by checking dev tools' Network
  tab for the worker request resolving (not staying pending), not just by checking it returns
  a JSON style or that `getStyle()` is truthy — both looked fine while the map was still broken.
  Additionally, `npm run dev` alone still needed `optimizeDeps: { exclude: ['maplibre-gl'] }` in
  `vite.config.ts` — Vite's dev-time dependency pre-bundler failed on maplibre-gl's worker entry
  with a logged warning ("file does not exist ... in the optimize deps directory ... Try adding
  it to `optimizeDeps.exclude`") even with `setWorkerUrl` in place; keep both fixes together.
- **MapLibre style loading (`maplibre-gl` v6 via npm, differs from the v4-via-CDN prototype):**
  constructing the map with an empty skeleton style and calling `map.setStyle(realStyle)`
  afterward silently never completes (`getStyle()` stays `undefined`, `isStyleLoaded()` stays
  `false`, no error event) — confirmed by isolated testing outside React too, so it's a MapLibre
  v6 behaviour change, not a React bug. The v4 prototype used skeleton-then-`setStyle` and it
  worked there. **Fix for v6: fetch the basemap style first, then construct the map directly
  with the final restyled object as its `style` option** — never call `setStyle()` right after
  construction. (`prototype/index.html`'s `restyle(style, finland)` + `map.setStyle(...)`
  pattern predates this finding; the React `Map.tsx` is the one to follow.)
- **Blank first frames:** the map shows flat grey until tiles arrive (several seconds on a slow
  link, and automated-browser screenshots often catch this). Wait/re-screenshot before
  concluding the basemap is broken; add a loading state to the real app.
- **Overlapping directions:** A→B and B→A share geometry, so clicks hit whichever draws on top.
  The real build should merge both directions into one line with a direction switch.
- **Tile-source names:** OpenFreeMap layer ids are the `openmaptiles` set (`water`,
  `place_city`, `boundary_country_z5-`, …); the `ne2_shaded` raster source is unused after
  restyling.
- Chrome MCP console/network tracking only starts at the first read, so load-time errors are
  missed; reload after the first call. Expose `window.map` / `window.overlay` while debugging
  (`overlay._deck.pickObject({x, y, radius})` tests picking).
- `commuterLineID` is all NaN here (long-distance only); ignore it.
- On Windows, set `PYTHONIOENCODING=utf-8` when printing station names. Shell is
  PowerShell/Git Bash; project path contains spaces — quote it.
- **Always use a project-local venv for Python, never the base/conda `python` on PATH.**
  The system Python (miniconda3 base env) has a broken `pyarrow` install (see above) and is
  shared across unrelated projects — installing packages into it is how that kind of breakage
  happens. Create it once at the project root (`data/raw/`, `scripts/`, `.venv/` all sit next
  to `CLAUDE.md`) and activate it before running any `python`/`pip` command:
  ```bash
  python -m venv .venv
  source .venv/Scripts/activate        # Git Bash on Windows; `.venv\Scripts\activate` in PowerShell
  pip install fastparquet pandas
  ```
  Add `.venv/` to `.gitignore`. If a shell in this project runs `python scripts/build_data.py`
  without the venv active, stop and activate it first rather than falling back to the system
  interpreter.

## Data contract (build output → `web/public/data/`)

- `stations.json` — code → `{name, lat, lon, passengerTraffic}`. This shape
  (plus delay stats, if useful later) is already produced by
  `routes_lib.station_summary()` — reuse rather than re-deriving.
- `routes.geojson` — one `LineString` per OD pair through its typical station sequence;
  properties: `id`, `from`, `to`, `runs`, `avgDelay`, `onTimePct`, `worstDay`, `trainTypes`.
  "Typical station sequence" (most-common ordered sequence of runs, restricted to
  `passengerTraffic == True` stops) is already implemented as
  `routes_lib.typical_passenger_stops()` — reuse it here rather than re-deriving.
- `route_detail/<OD>.json` — per-leg delay build-up, daily delay series, delay-vs-weather
  buckets (temperature, snow depth, wind), cause-category breakdown, worst runs.
  Per-station delay along a route (runs/avgDelay/medianDelay/onTimePct scoped to
  that route's own runs) is already implemented as `routes_lib.station_level_stats()`
  + `routes_lib.aggregate(..., station_meta=..., events=...)`'s `stops` JSON column
  (see `data/derived/routes_index.README.md`) — reuse rather than re-deriving.
- `summary.json` — month-level headline numbers for the landing state

Keep total payload to a few hundred KB; lazy-load `route_detail` on click.

## Conventions

- `scripts/routes_lib.py` is the **only** module that reads the parquet (fastparquet,
  mojibake fix, run/route derivation). `scripts/build_data.py`,
  `scripts/list_routes.py` (read-only CLI to browse all routes — run
  `python scripts/list_routes.py --help`; writes `data/derived/routes_index.csv`,
  documented in `data/derived/routes_index.README.md`) and
  `scripts/list_stations.py` (same, but per-station stats independent of
  route — `python scripts/list_stations.py --help`; writes
  `data/derived/station_index.csv`, documented in
  `data/derived/station_index.README.md`) all go through it; the web app reads
  generated JSON only. Generated JSON is never hand-edited — rerun the script.
- Idempotent build: same inputs → identical outputs; log row/station/route counts and warn
  on any station without coordinates.
- Keep the app dependency-light; prefer few small files over a framework. Run
  `npm run build` and open `dist/` via a static server before calling anything done.
- Test the built site under a subpath (Hostinger may serve from a folder).
- All visitor-facing text in English, plain language; station names shown with proper
  Finnish characters.

## Commands

```bash
source .venv/Scripts/activate     # always first — see "Always use a project-local venv" above
python scripts/build_data.py      # parquet + station metadata -> web/public/data/*.json
cd web && npm install
npm run dev                       # local dev server
npm run build                     # -> dist/ (upload contents to Hostinger)
npx vite preview                  # sanity-check the production build
```

## Roadmap

1. Scaffold Vite; write `build_data.py` (stations, routes, summary).
2. Map with routes coloured by average delay, hover tooltip, click to select.
3. Side panel: headline numbers, per-leg delay, delay vs. weather, causes, worst runs.
4. Polish for the room: legend, intro overlay, attract-loop animation, reset button,
   large-screen and touch tuning.
5. Build, test under a subpath, hand over `dist/` for Hostinger.
