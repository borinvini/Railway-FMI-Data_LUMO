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
| UI text / muted | `#eaf1f8` / `#8597ab`, Barlow 400 (weight 300 dropped: too faint from a distance) |
| Light cards (search, route finder, station panel, route pop-up) | `.card` in `index.css`: `--card #bed0e4`, ink `--card-ink #002f6c` / `-2 #243f5e` / `-3 #3f5873`, line `--card-line`. One surface class, so radius/padding/shadow stay in step. Title card in the left column is a light card too. |
| Type | **Barlow** (body/UI) + **Barlow Condensed** 500/600 (`font-board`: big numbers, titles, tabular figures), self-hosted via `@fontsource`, bundled by Vite. Body ≥ 15 px, tap targets ≥ 44 px. |

**Left column** (`components/SideColumn.tsx`, `clamp(300px, 26vw, 400px)`, inside the 36% padding zone):
`PeriodSummary` (title, **year picker**, headline numbers, delay sparkline; all from
`summary.json`) → `RouteFinder` → `StationSelect`.
Legend and "Reset view" share one bottom-left row in `App.tsx`. App owns reset: it clears the
selection/route and bumps `resetSignal`, which `Map.tsx` answers with `flyTo(DEFAULT_VIEW)`.
**Kiosk behaviour:** a "Loading the map…" veil until the first `idle` (10 s fallback), and after
90 s without input the page resets itself (`IDLE_RESET_MS` in `App.tsx`).

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

**Overlapping highlighted routes.** Routes often share track, and deck.gl's plain pick only reports
the one drawn on top, so a click there could never reach the others. `routeClick` in `Map.tsx` uses
`pickMultipleObjects` to collect every route under the pointer and cycles through them (each click
opens the next route after the one opened last; the pop-up's tabs also reach any route directly).

**Route-mode station badges.** While the route finder highlights route(s), the 3D pins are replaced
(only the highlighted routes' stations get a marker) by flat round badges with the typical delay at
that stop written inside: `IconLayer` ring + fill (`ROUTE_BADGE_ICON`) and a `TextLayer`, with
`depthCompare: 'always'` so they never z-fight with the route lines. Value = the stop's own average
delay on the highlighted route(s) from `route_stats.json` (via `routeStationValues`; a station on
several routes gets the trains-weighted mean). The saved per-stop figures only cover each
service's *usual* stops, so a less common variation of a route (e.g. Oulu → Helsinki via Kajaani)
can have stops with no figure for its own trains; those fall back to the station's usual delay
across all trains (`own: false`) and get a grey ring + legend entry ("Grey ring: station's usual
delay"); only a station with no data anywhere shows "–". Three-step colour scheme (`ROUTE_BADGE_STEPS` in `lib/colors.ts`): under 2 min `#4aa3ff`,
2–5 min `#ffb340`, over 5 min `#e8344e`, no figure `#8597ab`. Start/end are larger with a white
ring and always shown; other badges are thinned by screen distance (≥ 38 px apart, most important
stations first, recomputed on every camera move), so zooming in reveals more. The legend switches to
these ranges while a route is shown. A selected off-route station keeps its pin.

## Product decisions (defaults — change only if the user says so)

1. **A "route" = an origin→destination pair** (~1,000 train services over 2018-2025, aggregated over
   the picked period). Click → pop-up with headline delay numbers, delay at each stop, delay by month
   and through the year, delay vs. weather, and a table of services.
2. **Pre-aggregated static JSON** — the browser never loads the parquet.
3. **Minimalist dark-mode design end to end** — dark basemap, dark UI panels and charts; map
   look fixed by the approved prototype (see *Map style*).
4. **Covers every month in `data/raw/` (Jan 2018 - Dec 2025), with a year picker.** The default view
   pools all years; "All years / 2018 ... 2025" chips in the title card switch every number and
   colour on the page. Each period is computed in the build and lazy-loaded when picked
   (`data/scope/<all|YYYY>/`). Adding a month = drop the parquet in `data/raw/` and rebuild.

## Repo layout

```
Railway-FMI-Data_LUMO/
  CLAUDE.md
  data/raw/        matched_data_flat_YYYY_MM.parquet   (96 files, 2018-01..2025-12, ~2.7 GB, git-ignored)
                   metadata_closest_ems_to_train_stations.csv  station coords + closest EMS, committed
  data/derived/    routes_index.csv station_index.csv   (CLI listings, committed)
                   cache/                               compact per-month cache of the parquets (git-ignored)
  scripts/build_data.py                                 parquet + CSV -> web/public/data/*.json
  prototype/       index.html data.json finland.geojson  approved map look — plain HTML/JS,
                                                          source of truth for palette/camera/
                                                          interaction; port into React below
  web/                                                  Vite + React + TS + Tailwind app (scaffolded)
    index.html
    src/
      main.tsx  App.tsx
      components/Map.tsx  PeriodSummary.tsx  RouteDetails.tsx  DelayTrends.tsx  ...
      lib/colors.ts  lib/mapStyle.ts  lib/types.ts  lib/period.ts  lib/trends.ts
    public/data/     generated by scripts/build_data.py (see Data contract); finland.geojson is static
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

## Data facts (matched_data_flat_2018_01 ... 2025_12.parquet)

| Fact | Value |
|---|---|
| Rows | 47,956,194 across 96 monthly files (~0.4-0.59 M each; May 2020 is the low, 343,736). Same 126-column schema in every file |
| Files | Split by **departure date**, so a run never spans two files (night trains keep their departure day) |
| `type` | `ARRIVAL` / `DEPARTURE`, half each |
| Period | 2018-01-01 → 2025-12-31 |
| Category | `Long-distance` only. Train types seen: IC, S, IC2, PYO, HDM, AE, HSM, PVV, MV, V, H, MUS, P (types come and go over the years) |
| Train runs | 612,614; run key = `departureDate` + `trainNumber` (an int in the code, see gotchas) |
| Stations | 553 distinct `stationShortCode`, 209 passenger stations (190 in Jan 2020 alone) |
| Services | 1,071 (origin → destination × train type) over all years, 266-340 in a single year |
| Arrivals with a delay | 23,716,591; 16.5% more than 5 min late, 83.5% on time (2020 was best, 2024 worst) |
| `differenceInMinutes` | per arrival, early = negative; clamped to 0 for every average shown |
| Delay causes | only a few rows non-empty; `categoryCode` letters (L, M, T, J, K…). Not used |
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

- **Memory and the cache (48 M rows).** `routes_lib.load_events()` caches each month under
  `data/derived/cache/` (small dtypes, text repaired, a `dayNum` int; keyed on source size, mtime and
  the column list) and returns one frame of ~2.8 GB (categoricals for text). The first load takes
  ~3 min, later ones ~40 s; a full `build_data.py` takes ~10 min. Text columns are pandas
  categoricals in the event frame, so `min`/`max` on them fail; `derive_routes` turns the run table's
  text into plain strings. The run key is an **int** (`run_key()`: day number × 100,000 + train
  number), not the old "date_number" string.
- `.shift()`-style tricks on categoricals are slow; use `.cat.codes`. pandas is 3.x (groupby is
  `observed=True` by default).
- The Chrome automation tab can freeze (screenshots time out) at large window sizes because the 3D
  map renders in software; `resize_window` to ~1280x720 and verify with DOM reads.

## Data contract (build output → `web/public/data/`)

Everything is produced by `scripts/build_data.py` (never hand-edited; the build is byte-for-byte
idempotent). It computes every figure for the whole period (`all`) and for each year, so the year
picker only switches files. **Start-up files (about 335 KB, budget 600 KB):**

- `stations.json` (~96 KB) — passenger stations: identity, `ems` (weather station + its detail file
  name), and the all-years stats `{avgDelay, onTimePct, runs, appearances, distinctRoutes,
  cancelledPct, weather: {avgTemp, avgSnow, conditions}}` (`routes_lib.station_summary()`).
- `connections.json` — the track network, only edges used by a kept pattern (see below).
- `route_patterns.json` (~175 KB) — one entry per distinct full stop sequence a train ran with at
  least `--min-pattern-runs` (10) runs: `{stops, runsByType: {IC: [n per year], ...}}`, the counts
  aligned with `summary.years`. Powers the **route finder** (`lib/routeFinder.ts`): a route is a
  *direct train* that stops at the start station and later at the end station; every distinct path
  is highlighted and the card lists trains per type for the picked year. No transfers. "Random
  route" picks a real train (weighted by runs that year) and two passenger stops >= 100 km apart.
- `summary.json` (~7 KB) — `years`, `months`, `conditions` (the weather rules, so the UI never
  hard-codes them), `scopes.{all,2018..}` headlines (trains, on time %, weather conditions),
  `yearsAbove` (in how many years each condition ran later than usual), `trend` (delay per month,
  96 points).

**Lazy files:**

- `scope/<all|YYYY>/route_stats.json` (661 KB for all years, ~200 KB per year) — per train service
  (`<from>-<to>-<type>`, the same rows as `data/derived/routes_index.csv`, from
  `routes_lib.aggregate`; services under 3 trains in the scope are left out): headline delay stats,
  per-stop rows `[code, trains, avgDelay, onTimePct, temp, snow, n]`, and `w` (weather conditions).
  Loaded the first time a route is highlighted in that period. Clicking a highlighted route opens
  `RouteDetails`: stats weighted across the services on that route, a bar chart of delay at each
  stop, an on-time split, **"Over the years"** (month by month and through the year), "Delay and
  weather" and a table of services. Per-stop rows exist only for each service's *usual* stops.
  The saved `avgDelay` is the mean over a train's stops, not the delay at its destination; UI
  copy says "typically late at stops".
- `scope/<YYYY>/stations_stats.json` — the same per-station stats as in `stations.json`, for one
  year (`App.tsx` swaps them in; a station with no trains that year is dropped).
- `route_trends.json` (~247 KB) — per service (>= 20 trains in total) delay per month in tenths of a
  minute plus trains per month; loaded when the route pop-up opens.
- `ems/<slug>.json` (128 files, <= 7 KB) — one weather station: tiles per scope and a monthly series.
- `predictor.json` (~196 KB) — the AI model's chance per month/day/time for the 7 modeled stations,
  from `scripts/build_predictor.py` (not `build_data.py`), see *Delay predictor*.

Keep the start-up payload to a few hundred KB; everything else is lazy.

## Weather (like for like)

Weather is attached per event from the FMI station nearest the train station (median 11 km, 99%
within 42 km). Over 2018-2025 the raw gap between cold and mild weather is mostly **place and
season** (the north is colder and runs different trains; winters are busier), so every figure on
the site is measured **like for like**: an arrival's baseline is the late rate ("late" = more than
5 min) of all arrivals at the *same station, in the same actual month (e.g. January 2019) and the
same part of the day*. The site shows the **extra late trains per 100** against that baseline
(`routes_lib.prepare_arrivals`, column `ex`; the baseline is taken over all trains, so a route's own
figure is not its own baseline). `scripts/analyse_weather.py` is the read-only analysis behind it
(run it again if the data changes). What it found on all 23.7 M arrivals (same station, month and
part of day, extra late per 100): hard frost (-15°C or colder) +8, frost (-5°C or colder) +4,
heat (> 25°C) +4, precipitation falling +3, gusts over 16 m/s +3, deep snow (25 cm or more) +1.
All positive in every year tested. **Snow depth is no longer a headline** (the old "24% vs 13%"
gap was place and season), and **wind speed is flat** (only strong gusts matter), so wind is shown
only as gusts. Precipitation *intensity* (`> 0`) is now usable; `Precipitation amount` is 86% empty:
never use it. Snow depth is whole cm; `-1` and `0` both mean no snow.

- Rules: `routes_lib.CONDITIONS` (shipped in `summary.json.conditions`). They overlap on purpose
  (hard frost is also frost). A condition with fewer than `MIN_CONDITION_ARRIVALS` (200) arrivals is
  never shown as a number: the figure is a small difference of two shares.
- **Wording is descriptive, never causal.** Bad weather comes with winter nights, and the baseline
  cannot see track works inside a month. Footnotes say "what happened, not exactly why".
- Where it shows: the "How delays changed" pop-up (every condition, with "more than usual in 8 of 8 years"; kept off the title card to keep the home page quiet), station
  panel, route pop-up "Delay and weather" (`ConditionList`). Data: `summary.scopes[..].conditions`,
  `stations[..].weather.conditions`, `route_stats[id].w`; each cell is `[arrivals, % late, extra]`.
- The mean temperature and snow on pins / charts is an 8-year or one-year **average over all seasons**
  (it used to be one January), so it reads as a climate figure, not a day's weather.

### Weather stations (FMI "EMS") on the map

Selecting a train station also shows its closest weather station (pin marker, link line,
name; click or "See the weather here" in the station panel opens `WeatherStationDetails`). UI
copy says "weather station", never "EMS".

- **The matched parquet was built from `metadata_top5_closest_ems.csv`, not the single-closest
  CSV.** Per variable the join takes the first of the 5 closest stations that has a value;
  `closest_ems` carries rank 1. It equals top-5 rank 1 for 173 of 190 passenger stations but the
  `data/raw/metadata_closest_ems_to_train_stations.csv` closest for only 144 (a different
  version). **Marker rule: top-5 rank 1**; if that name has no parquet rows (13 stations) the
  parquet's own label is shown and the pop-up says a closer station has no readings.
- Fallback is large (snow depth comes from rank 1 at 139 of 190 stations, wind at 126), so copy
  must never say "this station measured it". The parquet does not record which rank supplied a
  value.
- **Numbers are readings taken when trains were nearby**, not a continuous record, so min and max
  are "at train times" and the pop-up says so. One reading per station per 10-minute slot
  (79% of rows are duplicates). Days are departure dates. Under 100 readings in the picked period,
  no numbers shown.
- **Weather pins carry numbers** (teardrop, tip on the real location, head split in two: **navy
  upper half = temperature in white, ice-blue lower half = snow depth in navy**, Barlow
  Condensed; split height `WS_SPLIT_Y` in `markerIcon.ts`): neutral on purpose, because colour on this map
  means delay only. **Route mode** shows one pin per distinct weather station serving the route's
  passenger stops, with the temperature and snow depth *when this route's own trains were at those
  stops* (mean over arrivals and departures: weather ignores which, and a start station has no
  arrivals; pooled by reading count). Grey outline = the route's trains had no figure, the
  average at the nearby train stations is shown. A selected station shows its own average at train
  times. The pop-up adds a line tying a route pin's number to its period tiles.
- **Route legend shows samples of the real markers** (`Legend.tsx`): a badge in each of the three
  colours with an example number (1.4 / 3.2 / 7.6), "No figure", and one weather pin sample. The
  grey ring on delay badges and the grey outline on weather pins are deliberately not explained in
  the legend.
- **Link lines** (thin lemon yellow, `EMS_LINK` in `Map.tsx`; greener than the delay amber so they
  are not read as delay; under pins and badges) join each pin to the train stations matched to
  it: in route mode the route's stations it serves; for a selected station every station sharing
  that weather station (the selected one stronger). They follow the hide switch.
- Crowding: ~6 distinct weather stations per route (max 24), 8-20 px apart at the route zoom, so
  pins are thinned by screen distance (>= 50 px from other pin heads, >= 40 px from delay badges;
  route ends always kept). Other pins are drawn **under** the badges; the two **route-end pins are
  drawn above** theirs (an end's weather station is a few km away, so the head would otherwise be
  half hidden behind the big end badge), and any neighbouring badge under an end pin's head is
  dropped rather than left half covered (zooming in brings it back). A "Hide weather stations" switch sits in the
  bottom row. Stop figures: `route_stats.json` stop rows are
  `[code, trains, avgDelay, onTimePct, temp, snow, n]`.
- Coordinates: top-5 file, then the `data/raw` CSV, then `EMS_COORD_OVERRIDES` in `routes_lib.py`
  (`Liperi Tuiskavanluoto`, from FMI's open station list).
- Data: `stations.json[].ems`, and a lazy per-station file `ems/<slug>.json` (loaded when its pop-up
  opens): tiles for all years and each year, plus one value per month. The pop-up shows one chart at
  a time, one bar per month (96 over all years, 12 for a picked year; Temperature / Snow / Wind tabs;
  a tab with no readings is left out).
- The raw FMI observations (`Railway-FMI-Data-CSV-Files-v2/weather_data_parquet`, every 10 min,
  198 stations) exist and would give true monthly extremes, but the owner chose train-time
  readings only.

### "Live" (experimental, branch `live-train`)

After choosing a route, **Play the journey** (button in the route finder card; "Live" was dropped
because it reads as real time) sends a train along the busiest
variant (`routeResult.paths[0]`): the camera flies to the start, follows the train, and at the last
station fits the whole route again. While it plays the map shows **no delay badges and no weather pins**:
only the route (with its lit trail), the train and the name of the station being passed. The figures
live in two coloured charts instead (`LiveDelayChart`, `LiveChart`), and a now-playing card
(`LiveCard`) shows the current stop's figures. Esc, Stop, Reset view or
another route ends it; map pan/zoom is locked while it runs, and the 90 s idle reset is suspended.

- It is a **time-lapse of a typical trip built from averages** (of the picked period), not real time and not the
  timetable; the card says so. Do not present it as live data.
- `lib/liveTrain.ts` is pure (geometry, timeline, `sample`); `Map.tsx` runs the `requestAnimationFrame`
  loop (effect on `live`). All tunables are in `LIVE` (cruise speed, dwell, zoom, easing, snap).
- **Station names:** the name of the station being passed rides beside the train in a navy tag
  (`live-station-name` layer): fades in as the train arrives, lingers ~0.7 s after it pulls out, then
  fades (the last station's stays until the run ends). Only passenger stations have names; waypoints
  are passed silently. Timings in `LIVE.name*`.
- **Left cards are hidden while it plays** (title and totals, route finder, station search); the
  run's now-playing card (with the only Stop button) and the weather chart take the left edge, and
  the legend row moves to the left edge too. They come back when the run ends.
- **Delay chart** (`LiveDelayChart`): a line chart like the weather one, growing with the train: the
  average delay at each passenger stop (the figure the badges showed), linear between stops.
  Colour keeps meaning delay: each line segment takes the colour of its level (blue under 2 min,
  amber 2-5, crimson over 5, the old badge colours), and the area under it is banded at 2 and 5 min
  in the same colours so the thresholds are visible; the head dot takes the current level's colour.
  The y range is at least 0-8 min. A dashed cursor (`lib/liveCursor.ts`) marks the train's distance
  on both charts. While it plays the legend and the "Hide weather stations" button are also hidden.
- **Weather chart** (`LiveChart`, under the delay chart; temperature is a mint-teal line, snow an
  ice-blue area, both kept clear of the delay colours): temperature and snow depth along the
  route, drawn as the train runs. x = distance from the start (fixed 0 to total), left axis °C
  (white line, 0°C emphasised), right axis cm (ice-blue area). Values are the route's own trains'
  means at each passenger stop (same as the pins, the station's own average where there is none),
  linear between stops. Axis ranges come from the whole route with a minimum span (4°C, 10 cm) and
  round tick steps, so a flat route reads flat. The train's distance reaches the chart through
  `lib/liveStore.ts` (a module pub-sub, not React state, so nothing re-renders per frame);
  `lib/liveProfile.ts` is pure. Averages, not readings.
- **Layering:** the route line and its lit trail are always *behind* every station badge and weather
  pin (trail layers sit right above the base route line in `buildLayers`); only the train and its
  pulsing ring draw above them.
- Duration is about 40-70 s (moving 12-45 s plus ~0.9 s at every passenger station, shortened to
  stay under 70 s).
- To discard: `git switch station-network-map && git branch -D live-train`.

## Delay predictor ("Ask the AI model")

The 7 stations modeled in the paper (HKI, PSL, TPE, SK, YV, OL, ROI) get an **Ask the AI model**
button in the station panel. It opens `components/DelayPredictor.tsx`: the visitor picks a month,
a day of the week and a time (30-minute steps), and sees the chance that a train there is
**disrupted = late by 1 min or more, or cancelled** (the paper's label, not the site's 5-minute
rule; the copy says so), plus how far that is from the station's usual share, and a bar strip of
the chance through the day.

- **Weather inputs** (WEATHER row: temperature + snow sliders; none at Pasila, whose S1 model has no
  weather; snow hidden in months without snow). Untouched = each train's real weather (sliders rest,
  greyed, at the month's median). Moving one sets both. The build puts the picked values on up to
  300 real trains of that month (instant temperature set, its 72 h min/max/mean and the dew point
  shifted by the same amount; snow depth and its 72 h figures set) and stores
  `weather[month].d[temp][snow]` = logit(mean chance picked) − logit(mean chance real), in
  hundredths; the browser adds it to the cell's logit (`lib/predictor.ts` `weatherShift`, `shifted`).
  Ranges = the month's 2nd-98th percentile at the station, steps 2 °C / 5 cm. Effects are modest
  (January about −11 to +17 points, summer heat up to +14), in line with the paper.

- **What a number is.** For a month/day/slot where at least 10 real trains stopped (2018-2024), the
  model's mean answer for *those* trains, with the weather they had (~98% of events sit in such
  cells; 85% at Rovaniemi). Other cells (`few` = 1: drawn faint, number dimmed, "rough guess") ask the
  model about made-up trains: the slot's real minutes, 60 real weather situations from that month
  within 90 min of the slot. Do not go back to one "median weather" row or exact clock times: time of
  day effectively identifies single trains, and those answers were up to 30 points from the real
  late rates. The build log prints the gap through the day (now 0.5-2.3 points mean, 3.8 at ROI).

- **Precomputed, no model in the browser.** `scripts/build_predictor.py` loads each station's best
  LightGBM `.pkl` (paper table "best": S5 at HKI/OL, S1 at PSL, S11 elsewhere) from
  `../Railway-FMI-Data-CSV-Files-v2/AI Results/<n - CODE>/results/<scenario>/` and predicts every
  month × day × slot (4,032 per station) into `web/public/data/predictor.json` (~170 KB, lazy: loaded
  when the pop-up first opens). Chance in per mille, `p[month][day Mon=0..Sun=6][slot]`, plus `few`.
  A full run takes ~10 min.
- Inputs as in training: `hour/month/day_week` sin/cos (Finnish local time; training day code
  Sunday = 1 .. Saturday = 7), then log1p on the skewed weather columns and the RobustScaler from
  `weather_scaler.joblib` (centre/scale applied directly).
- Checked in a real browser with Playwright (installed in the session scratchpad, not the repo):
  fits 1280x720 without scrolling, months in one row, works at 390 px wide.
- The models were trained with `scale_pos_weight = neg/pos`, so the raw output is corrected with
  `logit − ln(spw)`. The script checks itself and stops on failure: scaling reproduces the training's
  scaled test file, test AUC equals the paper's, corrected mean is within 3 points of the real share
  (it is within 0.5-2.7). Low chances are somewhat too high at some stations (reliability table in the
  log), so the copy calls it a guess.
- It needs lightgbm + scikit-learn, which the project `.venv` lacks (and that `.venv` was made on
  another machine): run it with the training conda env,
  `C:/Users/<you>/AppData/Local/miniconda3/envs/venv_rail_fmi_training/python.exe scripts/build_predictor.py`
  (`--step-minutes`, `--ai-results`). Idempotent. Rerun only if the models change.

## Presentation mode (for an unattended screen)

A **Presentation mode** button (bottom row, next to Reset view) starts a looping helicopter flight over
Finland: the bearing swings left and right (about -25° to +150°, always facing land: a camera turned
out over the Baltic leaves the screen empty), the tour opens on a view that fills the area right of the
cards (not the default view, which leaves a gap), the camera dives in over Helsinki,
Tampere, the eastern lakes, Oulu and Lapland, and the tilt rises and falls. The cards, legend and
buttons stay on screen; only Reset view is hidden while it plays.

- `lib/presentation.ts` is pure: `TOUR` (8 keyframes, one `PRESENT.segmentSeconds` = 13 s apart, ~104 s
  per loop), `cameraAt(t)` (periodic Catmull-Rom, no jumps, also at the loop point) and `blendIn`
  (eases from the camera's current position over 2.5 s, so it can start from any view). Edit `TOUR` to
  change the route; keep pitch <= 70 and zoom within the map's limits. `Map.tsx` runs the
  `requestAnimationFrame` loop with `map.jumpTo` (effect on `presenting`), the same way Play the
  journey does; the left map padding is untouched, so the framing is right on any screen size.
- **The cycle (repeats until stopped):** one aerial tour (`TOUR_SECONDS`, ~104 s) → a random route picked
  exactly like the "Random route" button (`pickRandomPair` in `App.tsx`, never the same pair as the one
  on show, in the picked year) and held 3.5 s with its badges → **Play the journey** on it → the arrived
  route held 3.5 s → cleared, next tour. `App.tsx` runs it as a phase state (`'aerial' | 'route' |
  'journey' | 'arrived'`, `presentCycle` restarts the flight); `Map.tsx` calls `onPresentLoop` when a tour
  is flown. `presenting` stays true through every phase, so a touch stops the whole show in any phase
  (and ends the journey, leaving the route for the visitor), and the idle timer stays paused. Hold times
  are `PRESENT.routeHoldSeconds` / `arrivedHoldSeconds`. The Stop button is also shown during the journey.
- **Starting** clears the selection, route, pop-ups and any journey (the picked year stays).
- **Stopping:** any touch, wheel or key ends the flight (App listens on `window`; the interaction
  handlers stay enabled, so the touch also starts a normal drag). The Stop button and Esc end it for
  good. After a touch the page behaves as before: the 90 s idle timer resets it (back to all years)
  **and starts the flight again**, as long as it was not stopped with the button or Esc (`armedRef`).
  The idle reset is paused while it flies.
- **Station names while it flies:** up to 3 names at a time fade in, stay about 3.4 s and fade out, in
  exactly the navy tag of Play the journey (`present-station-name` layer, same `TextLayer` style).
  The Map loop picks stations from the 24 most important (`rankRef`) that are on screen right of the
  cards and at least 180 px from a name already showing, longest-unseen first, so the names rotate.
  Timings and counts are in `PRESENT` (`lib/presentation.ts`, `labelAlpha`).
- Dev only: `window.__map` is the MapLibre map (to read the camera when checking). A 1280x720 window
  keeps the browser tool responsive; the 3D map renders in software.

## Footer and partner logos

A dark strip along the bottom (`components/Footer.tsx`, always shown, also while presenting or
playing a journey) holds:
- the credit "Built by Vinicius Pozzobon Borin" with a GitHub link (`https://github.com/borinvini`);
- a data note (Fintraffic and FMI, both CC BY 4.0, which requires credit; it shows from 1280 px
  wide);
- the University of Oulu, 6G Flagship and Interreg Aurora logos, each linking to its site.

All three logos are one line high and share one height: 28 px, with 24 px and 18 px on smaller
screens. The Interreg logo keeps only its top line, so the "Aurora" row is cut.

The footer's height is the `--footer-h` token in `index.css`: 52 px on one row, and 76 px on two
rows below 1024 px. The bottom row (legend and buttons), the left column's max height and MapLibre's
attribution all keep clear of it. The camera is unchanged: at 1280×720 Helsinki was already below
the screen edge, and at 1920×1080 it sits above the strip.

- **Logos** are transparent PNGs in `web/src/assets/logos/`, made from the originals in `src/` by
  `scripts/make_logos.py` (Pillow + numpy; use the training conda env). The script does this:
  - it "unmixes" each pixel against the background, so the edges stay smooth;
  - it recolours blue to white and pink/lavender to ice;
  - it keeps the 6G gold.

  Rerun it if the originals change; never edit the PNGs by hand.
- **The EU flag keeps its real blue and yellow, with a thin white border.** EU visibility rules
  require this on dark backgrounds, so never recolour it.

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
