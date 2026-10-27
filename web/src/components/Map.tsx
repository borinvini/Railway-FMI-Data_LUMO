import { MapboxOverlay } from '@deck.gl/mapbox'
import { IconLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import * as maplibregl from 'maplibre-gl'
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import { delayColor, NETWORK_LINE_COLOR, NETWORK_LINE_CORE_COLOR, routeBadgeStep } from '../lib/colors'
import { TOP_10_STATION_CODES } from '../lib/importantStations'
import type { StationValue } from '../lib/routeStats'
import { DEFAULT_VIEW, LEFT_PANEL_FRACTION, restyleBasemap } from '../lib/mapStyle'
import { LIVE_TRAIN_ICON, ROUTE_BADGE_ICON, STATION_MARKER_ICON, STATION_MARKER_OUTLINE_ICON, WEATHER_PIN_GREY_ICON, WEATHER_PIN_ICON } from '../lib/markerIcon'
import { LIVE, sample, trailPath, type LiveSample, type LiveTimeline } from '../lib/liveTrain'
import { setLiveKm } from '../lib/liveStore'
import { blendIn, cameraAt, labelAlpha, LABEL_LIFE_SECONDS, PRESENT, TOUR_SECONDS, type Camera } from '../lib/presentation'
import { formatSnow, formatTemp } from '../lib/weatherFormat'
import type { ConnectionFeature, FinlandGeoJSON, RouteHighlight, StationFeature, WeatherPin } from '../lib/types'

// At the default zoom, only Finland's 10 biggest cities show a marker (see
// lib/importantStations.ts); zooming in reveals progressively less prominent stations, ranked
// by network traffic (`runs`), until every station shows by REVEAL_ZOOM_END. Selected/hovered
// stations always show regardless of rank.
const REVEAL_ZOOM_START = DEFAULT_VIEW.zoom
const REVEAL_ZOOM_END = 8

// While a route is highlighted its stations become round badges with the delay inside; a badge is
// drawn only if it is at least this far (screen pixels) from every badge already kept, so they
// never overlap -- zooming in makes room for more.
const MIN_BADGE_GAP_PX = 38

// Weather pins (temperature and snow depth written in a navy pin whose tip is the weather
// station): kept only if the pin head is at least this far from every kept pin head, and from
// every kept delay badge, so neither is hidden. The route's start and end are always kept.
const MIN_PIN_GAP_PX = 50
const MIN_PIN_BADGE_GAP_PX = 40
// A route-end pin is drawn above the badges, so a neighbouring badge under its head would be left
// half hidden: such badges are dropped instead (zooming in brings them back).
const MIN_END_PIN_BADGE_GAP_PX = 38
const WEATHER_PIN_SIZE = 60
// Distance (px) from the pin's tip up to the centre of its round head (34 of 64 icon units).
const WEATHER_PIN_HEAD_UP = WEATHER_PIN_SIZE * (34 / 64)
const WEATHER_FONT = "'Barlow Condensed', Barlow, system-ui, sans-serif"

// Lines from each weather pin to the train stations it serves. Tune the look here: `color` is RGB,
// `width` in pixels, `alpha` 0-255; "strong" is the selected station's own line. The yellow is a
// lemon (hue ~54 degrees), deliberately greener than the delay amber (#ffb340, ~36 degrees) so a
// link is not read as "2-5 min late".
const EMS_LINK = {
  color: [255, 230, 60],
  width: 2.5,
  widthStrong: 3.5,
  alpha: 235,
  alphaStrong: 255,
} as const

// MapLibre's worker (maplibre-gl-worker.mjs) imports a sibling chunk (maplibre-gl-shared.mjs)
// via a relative ES module import. Pulling the worker in as a Vite `?url` import (tried first)
// only emits the single file you import, not files it internally imports -- so the production
// build silently shipped a worker that 404'd on its own dependency (no console error, style
// loads, but no tiles ever render). Fix: `scripts/copy-maplibre-worker.mjs` (run via
// `predev`/`prebuild`, see package.json) copies both files verbatim into public/maplibre/, and
// we point at them there directly -- untouched by Vite's bundler, so the worker's relative
// import keeps resolving against its real sibling. `import.meta.env.BASE_URL` respects the
// `base: './'` config so this still works under a Hostinger subfolder. Must run before any
// `maplibregl.Map` is constructed.
maplibregl.setWorkerUrl(`${import.meta.env.BASE_URL}maplibre/maplibre-gl-worker.mjs`)

const BASEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark'

/** Fit the camera to the whole route, keeping the visitor's tilt and rotation (fitBounds would
 *  otherwise reset the bearing to 0). Used when a route is chosen and when a Live run ends. */
function fitRoutePaths(map: maplibregl.Map, paths: [number, number][][], duration: number) {
  const pts = paths.flat()
  if (pts.length === 0) return
  const lons = pts.map((p) => p[0])
  const lats = pts.map((p) => p[1])
  map.fitBounds(
    [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
    { padding: { top: 110, bottom: 110, left: 60, right: 80 }, maxZoom: 8, bearing: map.getBearing(), pitch: map.getPitch(), duration },
  )
}

// Map interaction handlers switched off while a Live run drives the camera.
const LIVE_LOCKED_HANDLERS = ['dragPan', 'scrollZoom', 'boxZoom', 'dragRotate', 'keyboard', 'doubleClickZoom', 'touchZoomRotate', 'touchPitch'] as const

/** What a running Live trip looks like at this instant (written by the animation loop). */
interface LiveFrame {
  timeline: LiveTimeline
  sample: LiveSample
  trail: [number, number][]
  /** The name of the station the train is at (or has just left), faded in and out; null otherwise. */
  label: { name: string; alpha: number } | null
}

/** A station name shown for a moment while Presentation mode flies (see the `presenting` effect). */
interface PresentLabel {
  code: string
  name: string
  lon: number
  lat: number
  /** performance.now() when it appeared. */
  bornAt: number
}

interface MapProps {
  stations: StationFeature[]
  connections: ConnectionFeature[]
  finland: FinlandGeoJSON | null
  selected: StationFeature | null
  onSelect: (station: StationFeature | null) => void
  /** Route finder result to draw on top of the network (and zoom to); null = none. */
  routeHighlight: RouteHighlight | null
  /** A highlighted route line was clicked; `index` matches `routeHighlight.paths`. */
  onRouteClick: (index: number) => void
  /** Index of the route whose details pop-up is open (drawn bolder), or null. */
  activeRoute: number | null
  /** Typical delay (minutes) at each station of the highlighted routes, for the badges. */
  routeValues: Map<string, StationValue>
  /** Bumped by App when Reset view is pressed (or the idle timer fires): fly back to DEFAULT_VIEW. */
  resetSignal: number
  /** The camera moved away from DEFAULT_VIEW (true) or came back (false): App shows Reset view. */
  onDriftChange: (drifted: boolean) => void
  /** The first view finished loading its tiles (or a timeout passed): App fades out the veil. */
  onReady: () => void
  /** Weather pins for the highlighted route: one per distinct weather station, with the route's own
   *  trains' figures. Thinned here by screen distance. */
  weatherPins: WeatherPin[]
  /** The selected station's weather station, with the station's average at train times (null if none). */
  selectedWeatherPin: WeatherPin | null
  /** The "Hide weather stations" switch: false hides the route's pins. */
  showWeather: boolean
  /** A weather pin was clicked: App opens its weather pop-up. */
  onWeatherPinClick: (pin: WeatherPin) => void
  /** A Live run: a train rides this timeline while the camera follows it (null = not running). */
  live: LiveTimeline | null
  /** The train reached another passenger station (called once per station, and at the start). */
  onLiveProgress: (sample: LiveSample) => void
  /** The run finished on its own (the camera has already fitted the full route again). */
  onLiveEnd: () => void
  /** Presentation mode: the camera flies the tour from lib/presentation.ts. */
  presenting: boolean
  /** Bumped by App for every new tour, so the flight starts over (easing in from the camera as it is). */
  presentCycle: number
  /** One full tour has been flown (the flight stops; App moves on to the random route). */
  onPresentLoop: () => void
}

/**
 * The approved dashboard map, ported from prototype/index.html — see CLAUDE.md "Map style"
 * for the palette, camera and interaction spec this reproduces. Camera/basemap/Finland-highlight
 * logic is unchanged from the prototype; what's pickable is now the station network (dots +
 * the segments between directly-adjacent stations) rather than whole routes. MapLibre and
 * deck.gl are plain JS libraries here (no react-map-gl): the Map/overlay instances live in
 * refs and are created once in an effect, then kept in sync with props.
 */
export default function MapView({ stations, connections, finland, selected, onSelect, routeHighlight, routeValues, onRouteClick, activeRoute, resetSignal, onDriftChange, onReady, weatherPins, selectedWeatherPin, showWeather, onWeatherPinClick, live, onLiveProgress, onLiveEnd, presenting, presentCycle, onPresentLoop }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const overlayRef = useRef<MapboxOverlay | null>(null)
  const hoveredRef = useRef<StationFeature | null>(null)
  const selectedRef = useRef<StationFeature | null>(selected)
  const stationsRef = useRef<StationFeature[]>(stations)
  const connectionsRef = useRef<ConnectionFeature[]>(connections)
  const routeRef = useRef<RouteHighlight | null>(routeHighlight)
  const routeValuesRef = useRef<Map<string, StationValue>>(routeValues)
  const hadRouteRef = useRef(false)
  // Live: the frame being shown (null when not running) and the latest callbacks.
  const liveFrameRef = useRef<LiveFrame | null>(null)
  // Presentation mode: the station names currently shown (written by the flight loop).
  const presentLabelsRef = useRef<PresentLabel[]>([])
  const onLiveProgressRef = useRef(onLiveProgress)
  const onLiveEndRef = useRef(onLiveEnd)
  const onPresentLoopRef = useRef(onPresentLoop)
  onPresentLoopRef.current = onPresentLoop
  const lastRouteClickRef = useRef<number | null>(null)
  const onSelectRef = useRef(onSelect)
  const onRouteClickRef = useRef(onRouteClick)
  const activeRouteRef = useRef<number | null>(activeRoute)
  const routeHoverRef = useRef(false)
  const zoomRef = useRef(DEFAULT_VIEW.zoom)
  // code -> importance rank (0 = most important). The top 10 cities are fixed at the front;
  // the rest are ranked by `runs` (how often a train stops there), a proxy for network
  // significance -- recomputed whenever the station list changes, not on every render.
  const rankRef = useRef<Map<string, number>>(new Map())
  const onDriftRef = useRef(onDriftChange)
  const onWeatherClickRef = useRef(onWeatherPinClick)
  const weatherPinsRef = useRef(weatherPins)
  const selectedPinRef = useRef(selectedWeatherPin)
  const showWeatherRef = useRef(showWeather)
  const emsHoverRef = useRef(false)
  // Set for one tick by a click on the weather station marker so the map's own click handler
  // (which deselects on an empty-map click) does not clear the selection it belongs to.
  const emsClickRef = useRef(false)
  const onReadyRef = useRef(onReady)

  onSelectRef.current = onSelect
  onDriftRef.current = onDriftChange
  onWeatherClickRef.current = onWeatherPinClick
  onLiveProgressRef.current = onLiveProgress
  onLiveEndRef.current = onLiveEnd
  weatherPinsRef.current = weatherPins
  selectedPinRef.current = selectedWeatherPin
  showWeatherRef.current = showWeather
  onReadyRef.current = onReady
  routeValuesRef.current = routeValues
  onRouteClickRef.current = onRouteClick
  activeRouteRef.current = activeRoute

  function buildLayers() {
    const currentStations = stationsRef.current
    const currentConnections = connectionsRef.current
    const sel = selectedRef.current
    const hovered = hoveredRef.current
    const route = routeRef.current
    const activeIdx = activeRouteRef.current
    // While a Live run is going the map shows no delay badges and no weather pins: the route, the
    // train and the name of the station being passed are all that stay (the figures are in the charts).
    const liveFrame = liveFrameRef.current
    const dim = sel !== null || route !== null
    const isSel = (d: StationFeature) => sel?.code === d.code
    const isRouteEnd = (d: StationFeature) => route !== null && (d.code === route.start || d.code === route.end)
    const isHovered = (d: StationFeature) => hovered?.code === d.code
    const touchesSelected = (d: ConnectionFeature) => sel !== null && (d.from === sel.code || d.to === sel.code)

    const revealT = Math.max(0, Math.min(1, (zoomRef.current - REVEAL_ZOOM_START) / (REVEAL_ZOOM_END - REVEAL_ZOOM_START)))
    const visibleCount = Math.round(TOP_10_STATION_CODES.length + (rankRef.current.size - TOP_10_STATION_CODES.length) * revealT)

    // Route mode: only the highlighted route's stations get a marker, as badges thinned by screen
    // distance (start and end always kept, then the most important stations first).
    const badges: StationFeature[] = []
    const badgePoints: { x: number; y: number }[] = []
    const map = mapRef.current
    if (route && map && !liveFrame) {
      const byCode = new Map(currentStations.map((st) => [st.code, st]))
      const isEndCode = (code: string) => code === route.start || code === route.end
      const priority = (st: StationFeature) => (isEndCode(st.code) ? -1 : rankRef.current.get(st.code) ?? 1e9)
      const candidates = route.stationCodes
        .flatMap((code) => { const st = byCode.get(code); return st ? [st] : [] })
        .sort((a, b) => priority(a) - priority(b))
      const kept = badgePoints
      // Heads of the route-end weather pins (drawn above the badges, see `topPins` below).
      const endHeads = showWeatherRef.current
        ? weatherPinsRef.current
            .filter((p) => p.isEnd)
            .map((p) => {
              const tip = map.project([p.ems.lon, p.ems.lat])
              return { x: tip.x, y: tip.y - WEATHER_PIN_HEAD_UP }
            })
        : []
      for (const st of candidates) {
        const pt = map.project([st.lon, st.lat])
        if (!isEndCode(st.code) && endHeads.some((h) => Math.hypot(h.x - pt.x, h.y - pt.y) < MIN_END_PIN_BADGE_GAP_PX)) continue
        if (isEndCode(st.code) || kept.every((k) => Math.hypot(k.x - pt.x, k.y - pt.y) >= MIN_BADGE_GAP_PX)) {
          kept.push(pt)
          badges.push(st)
        }
      }
    }
    const badgeCodes = new Set(badges.map((st) => st.code))

    // Weather pins: the route's weather stations thinned like the badges, but against the kept
    // badges too, so a pin never covers a delay figure. The selected station's own weather
    // station is always shown (with its link line and name) unless the route already has it.
    const routePins: WeatherPin[] = []
    if (route && map && showWeatherRef.current && !liveFrame) {
      const ordered = [...weatherPinsRef.current].sort(
        (a, b) => Number(b.isEnd) - Number(a.isEnd) || b.stationCodes.length - a.stationCodes.length,
      )
      const heads: { x: number; y: number }[] = []
      for (const pin of ordered) {
        const tip = map.project([pin.ems.lon, pin.ems.lat])
        const head = { x: tip.x, y: tip.y - WEATHER_PIN_HEAD_UP }
        const clear =
          heads.every((h) => Math.hypot(h.x - head.x, h.y - head.y) >= MIN_PIN_GAP_PX) &&
          badgePoints.every((b) => Math.hypot(b.x - head.x, b.y - head.y) >= MIN_PIN_BADGE_GAP_PX)
        if (pin.isEnd || clear) {
          heads.push(head)
          routePins.push(pin)
        }
      }
    }
    const selectedPin = sel && !liveFrame ? selectedPinRef.current : null
    const allPins =
      selectedPin && !routePins.some((p) => p.key === selectedPin.key) ? [selectedPin, ...routePins] : routePins

    // Lines from each weather pin to the train stations it was matched to: in a route, the route's
    // stations it serves; for a selected station, every station that shares the weather station
    // (the selected one stronger). Underneath the pins and badges.
    const stationByCode = new Map(currentStations.map((st) => [st.code, st]))
    const sharing = new Map<string, string[]>()
    for (const st of currentStations) {
      if (st.ems) sharing.set(st.ems.name, [...(sharing.get(st.ems.name) ?? []), st.code])
    }
    // The route's end pins are drawn above the delay badges (an end's weather station is usually
    // a few km away, so its head would otherwise be half hidden behind the big end badge); the
    // rest stay under, so a badge is never covered. The pin head leaves the badge's centre free.
    const underPins = allPins.filter((p) => !p.isEnd)
    const topPins = allPins.filter((p) => p.isEnd)
    const pinLayers = (suffix: string, data: WeatherPin[]) => [
      new IconLayer<WeatherPin>({
        id: `ems-pin${suffix}`, data, pickable: true,
        parameters: { depthCompare: 'always' },
        getPosition: (d) => [d.ems.lon, d.ems.lat],
        getIcon: (d) => (d.own ? WEATHER_PIN_ICON : WEATHER_PIN_GREY_ICON),
        sizeUnits: 'pixels', getSize: WEATHER_PIN_SIZE,
        onHover: emsHover, onClick: emsClick,
      }),
      new TextLayer<WeatherPin>({
        id: `ems-temp${suffix}`, data,
        parameters: { depthCompare: 'always' },
        getPosition: (d) => [d.ems.lon, d.ems.lat],
        getText: (d) => formatTemp(d.temp),
        getSize: 20, sizeUnits: 'pixels',
        getColor: [255, 255, 255, 255],
        getPixelOffset: [0, -(WEATHER_PIN_HEAD_UP + 6)],
        getTextAnchor: 'middle', getAlignmentBaseline: 'center',
        fontFamily: WEATHER_FONT, fontWeight: 600,
        characterSet: '0123456789\u2212\u00b0\u2013',
      }),
      new TextLayer<WeatherPin>({
        id: `ems-snow${suffix}`, data,
        parameters: { depthCompare: 'always' },
        getPosition: (d) => [d.ems.lon, d.ems.lat],
        getText: (d) => formatSnow(d.snow),
        getSize: 15, sizeUnits: 'pixels',
        // Navy on the pin's ice-blue lower half (see lib/markerIcon.ts).
        getColor: [6, 16, 31, 255],
        getPixelOffset: [0, -(WEATHER_PIN_HEAD_UP - 11)],
        getTextAnchor: 'middle', getAlignmentBaseline: 'center',
        fontFamily: WEATHER_FONT, fontWeight: 600,
        characterSet: '0123456789 cm',
      }),
    ]
    const links: { path: [number, number][]; strong: boolean }[] = []
    for (const pin of allPins) {
      const codes = pin.scope === 'route' ? pin.stationCodes : sharing.get(pin.ems.name) ?? pin.stationCodes
      for (const code of codes) {
        const st = stationByCode.get(code)
        if (!st) continue
        links.push({ path: [[st.lon, st.lat], [pin.ems.lon, pin.ems.lat]], strong: sel?.code === code })
      }
    }
    // Pins: normally the zoom-reveal rule; in route mode only a selected station that has no badge.
    const isRevealed = (d: StationFeature) =>
      route
        ? isSel(d) && !badgeCodes.has(d.code)
        : isSel(d) || isHovered(d) || (rankRef.current.get(d.code) ?? Infinity) < visibleCount

    // The Live run: the route lit up behind the train (`liveTrail`, drawn right above the base route
    // line so it stays under every station badge and weather pin), and the train with its
    // pulsing ring on top of everything (`liveTrain`).
    const pulse = ((typeof performance !== 'undefined' ? performance.now() : 0) % 1400) / 1400
    const liveTrail = liveFrame
      ? [
          new PathLayer<[number, number][]>({
            id: 'live-trail-glow', data: [liveFrame.trail],
            parameters: { depthCompare: 'always' },
            getPath: (d) => d, widthUnits: 'pixels', capRounded: true, jointRounded: true,
            getWidth: 15, getColor: [...NETWORK_LINE_COLOR, 130],
          }),
          new PathLayer<[number, number][]>({
            id: 'live-trail-core', data: [liveFrame.trail],
            parameters: { depthCompare: 'always' },
            getPath: (d) => d, widthUnits: 'pixels', capRounded: true, jointRounded: true,
            getWidth: 5, getColor: [255, 255, 255, 255],
          }),
        ]
      : []
    const liveTrain = liveFrame
      ? [
          new ScatterplotLayer<[number, number]>({
            id: 'live-pulse', data: [[liveFrame.sample.lon, liveFrame.sample.lat]],
            parameters: { depthCompare: 'always' },
            getPosition: (d) => d,
            radiusUnits: 'pixels', getRadius: 20 + 16 * pulse,
            stroked: true, filled: false, lineWidthUnits: 'pixels', getLineWidth: 3,
            getLineColor: [255, 255, 255, Math.round(200 * (1 - pulse))],
          }),
          new IconLayer<[number, number]>({
            id: 'live-train', data: [[liveFrame.sample.lon, liveFrame.sample.lat]],
            parameters: { depthCompare: 'always' },
            getPosition: (d) => d,
            getIcon: () => LIVE_TRAIN_ICON,
            sizeUnits: 'pixels', getSize: 42,
          }),
          // The name of the station being passed, in a navy tag beside the train.
          new TextLayer<{ name: string; alpha: number }>({
            id: 'live-station-name', data: liveFrame.label ? [liveFrame.label] : [],
            parameters: { depthCompare: 'always' },
            getPosition: () => [liveFrame.sample.lon, liveFrame.sample.lat],
            getText: (d) => d.name,
            getSize: 24, sizeUnits: 'pixels',
            getColor: (d) => [255, 255, 255, Math.round(255 * d.alpha)],
            getPixelOffset: [34, -30],
            getTextAnchor: 'start', getAlignmentBaseline: 'center',
            fontFamily: WEATHER_FONT, fontWeight: 600,
            characterSet: 'auto',
            background: true,
            backgroundPadding: [12, 6],
            getBackgroundColor: (d) => [6, 16, 31, Math.round(235 * d.alpha)],
            getBorderColor: (d) => [156, 195, 232, Math.round(200 * d.alpha)],
            getBorderWidth: 1.5,
            updateTriggers: { getColor: [liveFrame.label?.alpha], getBackgroundColor: [liveFrame.label?.alpha], getBorderColor: [liveFrame.label?.alpha] },
          }),
        ]
      : []

    // Presentation mode: a few important station names fading in and out beside their markers, in
    // exactly the navy tag the Play the journey run uses for the station being passed.
    const nowMs = typeof performance !== 'undefined' ? performance.now() : 0
    const presentNames = presentLabelsRef.current.map((l) => ({ name: l.name, lon: l.lon, lat: l.lat, alpha: labelAlpha((nowMs - l.bornAt) / 1000) }))
    const presentNameLayer = presentNames.length
      ? [
          new TextLayer<{ name: string; lon: number; lat: number; alpha: number }>({
            id: 'present-station-name', data: presentNames,
            parameters: { depthCompare: 'always' },
            getPosition: (d) => [d.lon, d.lat],
            getText: (d) => d.name,
            getSize: 24, sizeUnits: 'pixels',
            getColor: (d) => [255, 255, 255, Math.round(255 * d.alpha)],
            getPixelOffset: [24, -30],
            getTextAnchor: 'start', getAlignmentBaseline: 'center',
            fontFamily: WEATHER_FONT, fontWeight: 600,
            characterSet: 'auto',
            background: true,
            backgroundPadding: [12, 6],
            getBackgroundColor: (d) => [6, 16, 31, Math.round(235 * d.alpha)],
            getBorderColor: (d) => [156, 195, 232, Math.round(200 * d.alpha)],
            getBorderWidth: 1.5,
            updateTriggers: { getColor: [nowMs], getBackgroundColor: [nowMs], getBorderColor: [nowMs] },
          }),
        ]
      : []

    const setCursor = () => {
      // MapLibre's own canvas carries `cursor: grab`, which overrides the cursor deck.gl sets on
      // its container -- so set it on the MapLibre canvas directly.
      const canvas = mapRef.current?.getCanvas()
      if (canvas) canvas.style.cursor = hoveredRef.current || routeHoverRef.current || emsHoverRef.current ? 'pointer' : ''
    }
    const stationHover = ({ object }: { object?: unknown }) => {
      hoveredRef.current = (object as StationFeature | undefined) ?? null
      setCursor()
      overlayRef.current?.setProps({ layers: buildLayers() })
    }
    // Clicks on stations are ignored during a Live run: a selection would fly the camera away.
    const stationClick = ({ object }: { object?: unknown }) => {
      if (liveFrameRef.current) return
      onSelectRef.current((object as StationFeature | undefined) ?? null)
    }
    const emsHover = ({ object }: { object?: unknown }) => {
      emsHoverRef.current = object !== undefined && object !== null
      setCursor()
    }
    const emsClick = ({ object }: { object?: unknown }) => {
      emsClickRef.current = true
      window.setTimeout(() => { emsClickRef.current = false }, 0)
      if (object) onWeatherClickRef.current(object as WeatherPin)
    }
    const routeHover = ({ object }: { object?: unknown }) => {
      routeHoverRef.current = object !== undefined && object !== null
      setCursor()
    }
    // Routes often share stretches of track, and deck.gl's plain pick only reports the one drawn on
    // top -- so a click there could never reach the others. Instead collect every route under the
    // pointer and cycle: each click moves on to the next one after the route opened last time.
    // (The pop-up's tabs reach any route directly.)
    const routeClick = ({ index, x, y }: { index: number; x: number; y: number }) => {
      if (index < 0) return
      const deck = (overlayRef.current as unknown as { _deck?: { pickMultipleObjects: (o: object) => { index: number }[] } } | null)?._deck
      const under = deck
        ? [...new Set(deck.pickMultipleObjects({ x, y, radius: 6, depth: 8, layerIds: ['route-highlight-core', 'route-highlight-glow'] }).map((h) => h.index))].sort((a, b) => a - b)
        : [index]
      const candidates = under.length > 0 ? under : [index]
      const last = lastRouteClickRef.current
      const next = last === null ? candidates[0] : candidates.find((i) => i > last) ?? candidates[0]
      lastRouteClickRef.current = next
      onRouteClickRef.current(next)
    }

    return [
      // Soft glow underneath, same technique as the original prototype's route lines: a wide,
      // translucent line under a crisp bright core reads as a glowing line rather than a flat
      // stroke. Both layers share the same path (now traced through every physical stop,
      // passenger or not, so the curve follows the real rail alignment instead of jumping
      // straight between distant passenger stations).
      new PathLayer<ConnectionFeature>({
        id: 'connections-outer-glow', data: currentConnections,
        getPath: (d) => [[d.fromLon, d.fromLat], [d.toLon, d.toLat]],
        widthUnits: 'pixels', capRounded: true,
        getWidth: (d) => (touchesSelected(d) ? 12 : 9),
        getColor: (d) => [...NETWORK_LINE_COLOR, touchesSelected(d) ? 55 : dim ? 6 : 28],
        updateTriggers: { getColor: [sel, route], getWidth: [sel] },
      }),
      new PathLayer<ConnectionFeature>({
        id: 'connections-glow', data: currentConnections,
        getPath: (d) => [[d.fromLon, d.fromLat], [d.toLon, d.toLat]],
        widthUnits: 'pixels', capRounded: true,
        getWidth: (d) => (touchesSelected(d) ? 6 : 5),
        getColor: (d) => [...NETWORK_LINE_COLOR, touchesSelected(d) ? 140 : dim ? 15 : 75],
        updateTriggers: { getColor: [sel, route], getWidth: [sel] },
      }),
      new PathLayer<ConnectionFeature>({
        id: 'connections-core', data: currentConnections,
        getPath: (d) => [[d.fromLon, d.fromLat], [d.toLon, d.toLat]],
        widthUnits: 'pixels', capRounded: true,
        getWidth: (d) => (touchesSelected(d) ? 3.2 : 2.4),
        getColor: (d) => [...NETWORK_LINE_CORE_COLOR, touchesSelected(d) ? 255 : dim ? 60 : 235],
        updateTriggers: { getColor: [sel, route], getWidth: [sel] },
      }),
      // Route finder highlight: a wide ice-blue halo under a bright white core, drawn over the
      // (dimmed) network so the chosen route(s) read from across a room. Empty when no route.
      // Clickable: a click opens that route's details pop-up (the wide halo is the touch target).
      new PathLayer<[number, number][]>({
        id: 'route-highlight-glow', data: route?.paths ?? [], pickable: true,
        getPath: (d) => d,
        widthUnits: 'pixels', capRounded: true, jointRounded: true,
        getWidth: (_d, { index }) => (index === activeIdx ? 20 : 16),
        getColor: (_d, { index }) => [...NETWORK_LINE_COLOR, activeIdx !== null && index !== activeIdx ? 70 : 110],
        onHover: routeHover, onClick: routeClick,
        updateTriggers: { getWidth: [activeIdx], getColor: [activeIdx] },
      }),
      new PathLayer<[number, number][]>({
        id: 'route-highlight-core', data: route?.paths ?? [], pickable: true,
        getPath: (d) => d,
        widthUnits: 'pixels', capRounded: true, jointRounded: true,
        getWidth: (_d, { index }) => (index === activeIdx ? 6.5 : 4.5),
        getColor: (_d, { index }) => [255, 255, 255, activeIdx !== null && index !== activeIdx ? 170 : 255],
        onHover: routeHover, onClick: routeClick,
        updateTriggers: { getWidth: [activeIdx], getColor: [activeIdx] },
      }),
      // The lit part of the route while a Live run is going: above the base route line, below
      // everything that marks a station.
      ...liveTrail,
      // Weather pins: a navy map pin whose tip is the weather station's real location, with the
      // temperature and snow depth written in its head (see lib/markerIcon.ts). In a route they
      // are the route's own trains' figures, for a selected station its average. Drawn
      // under the delay badges so a badge is never hidden; flat overlay like the badges, so they
      // never z-fight with the lines. Clickable, which opens the weather pop-up.
      new PathLayer<{ path: [number, number][]; strong: boolean }>({
        id: 'ems-links', data: links,
        parameters: { depthCompare: 'always' },
        getPath: (d) => d.path,
        widthUnits: 'pixels', capRounded: true,
        getWidth: (d) => (d.strong ? EMS_LINK.widthStrong : EMS_LINK.width),
        getColor: (d) => [...EMS_LINK.color, d.strong ? EMS_LINK.alphaStrong : EMS_LINK.alpha],
      }),
      ...pinLayers('', underPins),
      new TextLayer<WeatherPin>({
        id: 'ems-label', data: selectedPin ? [selectedPin] : [],
        parameters: { depthCompare: 'always' },
        getPosition: (d) => [d.ems.lon, d.ems.lat],
        getText: (d) => d.ems.name,
        getSize: 15, sizeUnits: 'pixels',
        getColor: [234, 241, 248, 255],
        // The pin's tip is the anchor, so the name sits just below it.
        getPixelOffset: [0, 6],
        getTextAnchor: 'middle', getAlignmentBaseline: 'top',
        fontFamily: 'Barlow, system-ui, sans-serif', fontWeight: 500,
        characterSet: 'auto',
        outlineWidth: 3, outlineColor: [2, 6, 13, 255],
      }),
      // Route mode badges: a ring (white for start/end, navy otherwise) under a flat coloured
      // circle, with the typical delay at that stop written on top (colours: see
      // ROUTE_BADGE_STEPS). Pickable like the pins: hover tooltip, click opens the station pop-up.
      new IconLayer<StationFeature>({
        id: 'route-badge-ring', data: badges,
        // Flat overlay: skip depth testing so the badges never z-fight with the route lines under them.
        parameters: { depthCompare: 'always' },
        getPosition: (d) => [d.lon, d.lat],
        getIcon: () => ROUTE_BADGE_ICON,
        sizeUnits: 'pixels',
        getSize: (d) => (d.code === route?.start || d.code === route?.end ? 52 : 40),
        getColor: (d) => {
          if (d.code === route?.start || d.code === route?.end) return [255, 255, 255, 255]
          // Grey ring = the station's usual delay, not a figure for this route's own trains.
          return routeValuesRef.current.get(d.code)?.own === false ? [133, 151, 171, 255] : [2, 6, 13, 255]
        },
        updateTriggers: { getSize: [route], getColor: [route, routeValues] },
      }),
      new IconLayer<StationFeature>({
        id: 'route-badge-fill', data: badges, pickable: true,
        // Flat overlay: skip depth testing so the badges never z-fight with the route lines under them.
        parameters: { depthCompare: 'always' },
        getPosition: (d) => [d.lon, d.lat],
        getIcon: () => ROUTE_BADGE_ICON,
        sizeUnits: 'pixels',
        getSize: (d) => (d.code === route?.start || d.code === route?.end ? 44 : 34),
        getColor: (d) => [...routeBadgeStep(routeValuesRef.current.get(d.code)?.avg).fill, 255],
        onHover: stationHover, onClick: stationClick,
        updateTriggers: { getSize: [route], getColor: [routeValues] },
      }),
      new TextLayer<StationFeature>({
        id: 'route-badge-text', data: badges,
        // Flat overlay: skip depth testing so the badges never z-fight with the route lines under them.
        parameters: { depthCompare: 'always' },
        getPosition: (d) => [d.lon, d.lat],
        getText: (d) => {
          const v = routeValuesRef.current.get(d.code)
          return v === undefined ? '–' : v.avg.toFixed(1)
        },
        getSize: (d) => (d.code === route?.start || d.code === route?.end ? 17 : 14),
        getColor: (d) => [...routeBadgeStep(routeValuesRef.current.get(d.code)?.avg).text, 255],
        sizeUnits: 'pixels',
        getTextAnchor: 'middle', getAlignmentBaseline: 'center',
        fontFamily: 'system-ui, sans-serif', fontWeight: 700,
        characterSet: '0123456789.–',
        updateTriggers: { getText: [routeValues], getColor: [routeValues], getSize: [route] },
      }),
      // Route-end weather pins, above the badges (see `topPins`).
      ...pinLayers('-top', topPins),
      // Black outline underneath the coloured pin: a stroked variant of the same icon (see
      // lib/markerIcon.ts), rendered at the SAME size as the pin above rather than scaled up --
      // the stroke is baked into the icon's own geometry, so it rings both the outer edge and
      // the punched-through hole evenly. Not pickable; the coloured pin above handles hover/click.
      new IconLayer<StationFeature>({
        id: 'stations-outline', data: currentStations,
        getPosition: (d) => [d.lon, d.lat],
        getIcon: () => STATION_MARKER_OUTLINE_ICON,
        sizeUnits: 'pixels',
        getSize: (d) => (!isRevealed(d) ? 0 : isSel(d) || isRouteEnd(d) ? 46 : isHovered(d) ? 40 : 30),
        getColor: (d) => [2, 6, 13, isSel(d) || isRouteEnd(d) || isHovered(d) ? 255 : dim ? 130 : 220],
        updateTriggers: { getSize: [sel, hovered, revealT, route], getColor: [sel, hovered, route] },
      }),
      // Stick-and-ball markers, anchored at the station point and rising above it -- this,
      // combined with the tilted camera, is what gives the map its 3D feel rather than flat
      // dots. Single grayscale icon (see lib/markerIcon.ts), tinted per-station via getColor
      // (mask: true) with the same delay ramp the dots used. Only the top-N most important
      // stations for the current zoom are shown (isRevealed above) -- at the default view
      // that's just Finland's 10 biggest cities, growing to every station by REVEAL_ZOOM_END.
      new IconLayer<StationFeature>({
        id: 'stations', data: currentStations, pickable: true,
        getPosition: (d) => [d.lon, d.lat],
        getIcon: () => STATION_MARKER_ICON,
        sizeUnits: 'pixels',
        getSize: (d) => (!isRevealed(d) ? 0 : isSel(d) || isRouteEnd(d) ? 46 : isHovered(d) ? 40 : 30),
        getColor: (d) => delayColor(d.avgDelay, isSel(d) || isRouteEnd(d) || isHovered(d) ? 255 : dim ? 130 : 220),
        onHover: stationHover,
        onClick: stationClick,
        updateTriggers: { getSize: [sel, hovered, revealT, route], getColor: [sel, hovered, route] },
      }),
      ...liveTrain,
      ...presentNameLayer,
    ]
  }

  // Create the map once `finland` is available. The restyled basemap is fetched first and
  // passed directly into the Map constructor's `style` option — constructing with an empty
  // skeleton and calling `setStyle()` afterward (tried first) never completes in this
  // MapLibre version: the style silently stays unset with no error event. Cleanup handles
  // React StrictMode's double-invoke in dev.
  useEffect(() => {
    if (!containerRef.current || !finland) return
    let cancelled = false
    let map: maplibregl.Map | null = null
    let onKeyDown: ((e: KeyboardEvent) => void) | null = null
    let rafId: number | null = null

    // Coalesces rapid zoom events (many fire per animation frame during a pinch/scroll) into at
    // most one reveal-cutoff rebuild per frame.
    function scheduleRebuild() {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        overlayRef.current?.setProps({ layers: buildLayers() })
      })
    }

    ;(async () => {
      const rawStyle = (await fetch(BASEMAP_STYLE_URL).then((r) => r.json())) as StyleSpecification
      if (cancelled || !containerRef.current) return

      map = new maplibregl.Map({
        container: containerRef.current,
        style: restyleBasemap(rawStyle, finland),
        ...DEFAULT_VIEW,
        minZoom: 3.5, maxZoom: 9, maxPitch: 70,
        attributionControl: { compact: true },
      })
      mapRef.current = map
      // Dev only: lets a debugging session read the camera (see CLAUDE.md "Presentation mode").
      if (import.meta.env.DEV) (window as unknown as { __map?: maplibregl.Map }).__map = map

      // Draw the camera centre in the middle of the area right of the statistics column,
      // without touching DEFAULT_VIEW. Padding is persistent camera state, so Reset view and
      // station fly-tos honour it too.
      const applyPadding = () => {
        if (!map) return
        map.setPadding({ left: Math.round(map.getContainer().clientWidth * LEFT_PANEL_FRACTION), top: 0, right: 0, bottom: 0 })
      }
      applyPadding()
      map.on('resize', applyPadding)

      // Fade the loading veil once the first view has its tiles; the timeout keeps a slow or
      // failed tile request from leaving the veil up for good.
      const readyTimer = window.setTimeout(() => onReadyRef.current(), 10000)
      map.once('idle', () => { window.clearTimeout(readyTimer); onReadyRef.current() })

      map.on('error', (e: maplibregl.ErrorEvent & { sourceId?: string }) =>
        console.error('MAPERR', e.error?.message, e.sourceId ?? ''),
      )

      map.addControl(new maplibregl.NavigationControl({ showZoom: false, visualizePitch: true }), 'top-right')

      function updateResetVisibility() {
        if (!map) return
        // Panning counts too: compare where the default centre would be drawn with where the
        // camera centre is drawn (> 40 px apart), so moving to another place shows the button.
        const home = map.project(DEFAULT_VIEW.center)
        const here = map.project(map.getCenter())
        const drifted =
          Math.abs(map.getPitch() - DEFAULT_VIEW.pitch) > 1 ||
          Math.abs(map.getBearing() - DEFAULT_VIEW.bearing) > 1 ||
          Math.abs(map.getZoom() - DEFAULT_VIEW.zoom) > 0.3 ||
          Math.hypot(home.x - here.x, home.y - here.y) > 40
        onDriftRef.current(drifted)
      }
      map.on('rotate', updateResetVisibility)
      map.on('pitch', updateResetVisibility)
      map.on('zoom', updateResetVisibility)
      map.on('move', updateResetVisibility)

      map.on('zoom', () => {
        zoomRef.current = map!.getZoom()
        scheduleRebuild()
      })
      // Badge thinning depends on screen positions, which pan/pitch/rotate change too.
      map.on('move', () => { if (routeRef.current) scheduleRebuild() })

      const overlay = new MapboxOverlay({
        interleaved: false, layers: buildLayers(), pickingRadius: 10,
        getTooltip: ({ object, layer }) => {
          if (!object) return null
          const layerId = layer?.id ?? ''
          // Build the text per layer: on a route line `object` is a path (an array of coordinates),
          // not a station -- touching `station.avgDelay` there throws, which stops deck.gl's render
          // loop for good (the camera keeps moving but no new layers ever draw).
          let text: string
          if (layerId.startsWith('route-highlight')) {
            text = 'Click for route details'
          } else if (layerId.startsWith('ems-pin')) {
            // A weather pin, not a train station: it has no `avgDelay`.
            const pin = object as WeatherPin
            const t = `${formatTemp(pin.temp)}C`
            const snow = pin.snow === null ? 'no snow figure' : `${formatSnow(pin.snow)} of snow`
            if (pin.scope === 'station') {
              text = `${pin.ems.name} weather station\n${pin.ems.km.toFixed(1)} km away\nAverage at train times: ${t}, ${snow}\nClick for the weather`
            } else {
              const figures = pin.own
                ? `${t} on average, ${snow},\nwhen this route's trains were there`
                : `Average at nearby stations: ${t}, ${snow}\n(no figure for this route's own trains)`
              text = `${pin.ems.name} weather station\n${figures}\nServes ${pin.stationNames.join(', ')}\nClick for the weather`
            }
          } else {
            const station = object as StationFeature
            if (layerId === 'route-badge-fill') {
              const v = routeValuesRef.current.get(station.code)
              const name = station.name.replace(/ asema$/, '')
              if (v === undefined) text = `${name}\nNo saved figure for this station`
              else if (v.own) text = `${name}\n${v.avg.toFixed(1)} min late on this route`
              else text = `${name}\n${v.avg.toFixed(1)} min late (station average:\nno figure for this route's own trains)`
            } else {
              text = `${station.name}\n${station.avgDelay.toFixed(1)} min late on average`
            }
          }
          return {
            text,
            style: {
              background: 'rgba(6,16,31,.92)', color: '#eaf1f8',
              border: '1px solid rgba(156,195,232,.2)', borderRadius: '8px',
              padding: '8px 10px', whiteSpace: 'pre',
            },
          }
        },
      })
      overlayRef.current = overlay
      map.addControl(overlay as unknown as maplibregl.IControl)

      // Debugging aid per CLAUDE.md gotchas (prototype/index.html does the same):
      // overlay._deck.pickObject({x, y, radius}) tests picking from the console.
      ;(window as unknown as { map: maplibregl.Map; overlay: MapboxOverlay }).map = map
      ;(window as unknown as { map: maplibregl.Map; overlay: MapboxOverlay }).overlay = overlay

      map.on('click', () => {
        if (!hoveredRef.current && !routeHoverRef.current && !emsHoverRef.current && !emsClickRef.current) onSelectRef.current(null)
      })
      onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onSelectRef.current(null) }
      document.addEventListener('keydown', onKeyDown)
    })()

    return () => {
      cancelled = true
      if (onKeyDown) document.removeEventListener('keydown', onKeyDown)
      if (rafId !== null) cancelAnimationFrame(rafId)
      map?.remove()
      mapRef.current = null
      overlayRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finland])

  // Keep deck.gl layers in sync with the station/connection data and the selection lifted to App.
  // The importance ranking (which stations reveal at which zoom) is recomputed here too, before
  // the rebuild that reads it: the top 10 cities first (TOP_10_STATION_CODES order), then
  // everything else by `runs` descending.
  useEffect(() => {
    stationsRef.current = stations
    connectionsRef.current = connections
    selectedRef.current = selected
    routeRef.current = routeHighlight
    const rank = new Map<string, number>()
    const rest = stations
      .filter((s) => !TOP_10_STATION_CODES.includes(s.code))
      .sort((a, b) => b.runs - a.runs)
    for (const [i, code] of TOP_10_STATION_CODES.entries()) rank.set(code, i)
    for (const [i, s] of rest.entries()) rank.set(s.code, TOP_10_STATION_CODES.length + i)
    rankRef.current = rank
    overlayRef.current?.setProps({ layers: buildLayers() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stations, connections, selected, routeHighlight, activeRoute, routeValues, weatherPins, selectedWeatherPin, showWeather])

  // Pan to whichever station gets selected, whether that came from a map click or the
  // dropdown menu (StationSelect only lifts the selection to App; this is the one place
  // that knows about the map instance, so it owns the fly-to).
  useEffect(() => {
    const map = mapRef.current
    if (!selected || !map) return
    const ems = selected.ems
    if (!ems) {
      map.flyTo({ center: [selected.lon, selected.lat], duration: 600 })
      return
    }
    // Fit the station and its weather station together. At the default zoom a 10 km gap is about
    // 8 px, so the marker would sit on top of the pin; maxZoom keeps a close pair from zooming in
    // absurdly. Bearing and pitch are kept, like the route fit below.
    map.fitBounds(
      [
        [Math.min(selected.lon, ems.lon), Math.min(selected.lat, ems.lat)],
        [Math.max(selected.lon, ems.lon), Math.max(selected.lat, ems.lat)],
      ],
      { padding: { top: 140, bottom: 140, left: 80, right: 120 }, maxZoom: 8.5, bearing: map.getBearing(), pitch: map.getPitch(), duration: 600 },
    )
  }, [selected])

  // A new set of highlighted routes starts the click-to-cycle order over.
  useEffect(() => { lastRouteClickRef.current = null }, [routeHighlight])

  // Zoom to a newly highlighted route (keeping the visitor's current tilt/rotation -- fitBounds
  // would otherwise reset the bearing to 0); when the route is cleared, return to the default view.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (routeHighlight) {
      fitRoutePaths(map, routeHighlight.paths, 800)
      hadRouteRef.current = true
    } else if (hadRouteRef.current) {
      hadRouteRef.current = false
      map.flyTo({ ...DEFAULT_VIEW, duration: 600 })
    }
  }, [routeHighlight])

  // Live: fly in to the start, then ride along with the train until the last station and fit the
  // whole route again. The loop only writes `liveFrameRef` and re-sets the layers; what is shown
  // for it is decided in buildLayers. Cleanup (Stop, another route, Reset, unmount) restores the
  // map's interaction handlers and clears the frame, leaving the camera where it is.
  useEffect(() => {
    const map = mapRef.current
    if (!live || !map) return
    const timeline = live
    const first = timeline.route.stops[0]
    const wasEnabled = LIVE_LOCKED_HANDLERS.map((h) => map[h].isEnabled())
    for (const h of LIVE_LOCKED_HANDLERS) map[h].disable()

    let raf = 0
    let ended = false
    let lastReached = -1
    const startAt = performance.now() + LIVE.flyInMs

    map.flyTo({ center: [first.lon, first.lat], zoom: LIVE.followZoom, bearing: map.getBearing(), pitch: map.getPitch(), duration: LIVE.flyInMs, essential: true })

    const frame = (now: number) => {
      if (ended) return
      const t = Math.max(0, (now - startAt) / 1000)
      const s = sample(timeline, t)
      setLiveKm(s.km)
      // The station's name rides with the train: it fades in as the train arrives and fades out
      // shortly after it pulls away (the last station's stays until the run ends). When two
      // stations are close together the newer name simply replaces the older.
      let label: LiveFrame['label'] = null
      if (s.at >= 0) {
        const k = s.at
        const into = Math.min(1, Math.max(0, (t - timeline.arriveAt[k]) / LIVE.nameFadeInSeconds))
        const isLast = k === timeline.passengerIndexes.length - 1
        const out = isLast ? 0 : Math.min(1, Math.max(0, (t - (timeline.departAt[k] + LIVE.nameLingerSeconds)) / LIVE.nameFadeOutSeconds))
        const alpha = into * (1 - out)
        if (alpha > 0.01) label = { name: timeline.route.stops[timeline.passengerIndexes[k]].name, alpha }
      }
      liveFrameRef.current = { timeline, sample: s, trail: trailPath(timeline.route, s.km), label }
      if (s.reached !== lastReached) {
        lastReached = s.reached
        onLiveProgressRef.current(s)
      }
      // Follow once the fly-in is over: ease the centre toward the train, frame by frame.
      if (now >= startAt) {
        // The zoom eases too, so a fly-in that was interrupted (a hidden tab, a throttled frame)
        // still ends up at the follow zoom instead of staying out.
        const c = map.getCenter()
        const z = map.getZoom()
        // After a stall (a hidden tab, a long frame) the train may be far from the camera: snap
        // rather than slowly sliding across the map.
        const gap = Math.hypot(map.project([s.lon, s.lat]).x - map.project([c.lng, c.lat]).x, map.project([s.lon, s.lat]).y - map.project([c.lng, c.lat]).y)
        const k = gap > LIVE.snapPx ? 1 : LIVE.followLerp
        map.jumpTo({
          center: [c.lng + (s.lon - c.lng) * k, c.lat + (s.lat - c.lat) * k],
          zoom: z + (LIVE.followZoom - z) * LIVE.followLerp,
        })
      }
      overlayRef.current?.setProps({ layers: buildLayers() })
      if (s.done) {
        ended = true
        // Arrived: zoom back out to the full route (App then drops `live`, which runs cleanup).
        if (routeRef.current) fitRoutePaths(map, routeRef.current.paths, LIVE.fitMs)
        onLiveEndRef.current()
        return
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      ended = true
      cancelAnimationFrame(raf)
      setLiveKm(0)
      liveFrameRef.current = null
      LIVE_LOCKED_HANDLERS.forEach((h, i) => { if (wasEnabled[i]) map[h].enable() })
      overlayRef.current?.setProps({ layers: buildLayers() })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live])

  // Presentation mode: fly the tour (lib/presentation.ts) frame by frame, easing in from wherever
  // the camera is. The interaction handlers stay on, so the touch that ends the tour (App watches
  // for it) also starts a normal drag. Cleanup stops the loop and leaves the camera where it is.
  useEffect(() => {
    const map = mapRef.current
    if (!presenting || !map) return
    const c = map.getCenter()
    const from: Camera = { lon: c.lng, lat: c.lat, zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() }
    const startedAt = performance.now()
    let raf = 0
    let lastSpawn = startedAt
    // When each station last had its name shown: the one shown longest ago (or never) goes next, so the
    // names rotate through the important stations instead of repeating the same few.
    const lastShown = new Map<string, number>()
    const stripAsema = (s: string) => s.replace(/ asema$/, '')

    // Show one more name if there is a free slot: an important station that is on screen (right of
    // the cards, away from the edges), far enough from the names already showing.
    const spawnLabel = (now: number) => {
      const labels = presentLabelsRef.current
      const rank = rankRef.current
      const width = map.getContainer().clientWidth
      const height = map.getContainer().clientHeight
      const left = (map.getPadding().left ?? 0) + 70
      const taken = labels.map((l) => map.project([l.lon, l.lat]))
      const featured = (code: string) => (PRESENT.featuredCodes as readonly string[]).includes(code)
      const rankOf = (code: string) => (featured(code) ? -1 : rank.get(code) ?? Infinity)
      const options = stationsRef.current
        .filter((s) => (featured(s.code) || rankOf(s.code) < PRESENT.poolSize) && !labels.some((l) => l.code === s.code))
        .flatMap((s) => {
          const p = map.project([s.lon, s.lat])
          const onScreen = p.x > left && p.x < width - 260 && p.y > 130 && p.y < height - 110
          const apart = taken.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= PRESENT.minSeparationPx)
          return onScreen && apart ? [s] : []
        })
        .sort((a, b) => (lastShown.get(a.code) ?? -Infinity) - (lastShown.get(b.code) ?? -Infinity) || rankOf(a.code) - rankOf(b.code))
      const pick = options[0]
      if (!pick) return
      lastShown.set(pick.code, now)
      presentLabelsRef.current = [...labels, { code: pick.code, name: stripAsema(pick.name), lon: pick.lon, lat: pick.lat, bornAt: now }]
    }

    const frame = (now: number) => {
      const t = (now - startedAt) / 1000
      // One full tour flown: stop here and let App pick the random route (it bumps presentCycle later).
      if (t >= TOUR_SECONDS) {
        onPresentLoopRef.current()
        return
      }
      const cam = blendIn(from, cameraAt(t), t)
      map.jumpTo({ center: [cam.lon, cam.lat], zoom: cam.zoom, pitch: cam.pitch, bearing: cam.bearing })

      // Names: retire the ones that have faded out, add a new one every so often.
      const alive = presentLabelsRef.current.filter((l) => (now - l.bornAt) / 1000 < LABEL_LIFE_SECONDS)
      const changed = alive.length !== presentLabelsRef.current.length
      presentLabelsRef.current = alive
      if (t > PRESENT.blendSeconds && alive.length < PRESENT.maxLabels && (now - lastSpawn) / 1000 >= PRESENT.spawnEverySeconds) {
        lastSpawn = now
        spawnLabel(now)
      }
      // The names fade frame by frame, so the layers are rebuilt while any is showing.
      if (changed || presentLabelsRef.current.length > 0) overlayRef.current?.setProps({ layers: buildLayers() })
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      presentLabelsRef.current = []
      overlayRef.current?.setProps({ layers: buildLayers() })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenting, presentCycle])

  // Reset view: App has already cleared the selection/route; this just flies the camera home.
  useEffect(() => {
    if (resetSignal > 0) mapRef.current?.flyTo({ ...DEFAULT_VIEW, duration: 600 })
  }, [resetSignal])

  return (
    <>
      {/* Inline style, not the Tailwind `absolute inset-0` classes: maplibre-gl.css sets
          `.maplibregl-map { position: relative }` at equal specificity, and whichever
          stylesheet loads last would otherwise win and collapse this to zero height. */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[40%]"
        style={{ background: 'linear-gradient(to bottom, var(--bg), rgba(6,16,31,0))' }}
      />
    </>
  )
}
