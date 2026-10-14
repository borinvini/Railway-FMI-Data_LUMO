import { MapboxOverlay } from '@deck.gl/mapbox'
import { IconLayer, PathLayer, TextLayer } from '@deck.gl/layers'
import * as maplibregl from 'maplibre-gl'
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import { delayColor, NETWORK_LINE_COLOR, NETWORK_LINE_CORE_COLOR, routeBadgeStep } from '../lib/colors'
import { TOP_10_STATION_CODES } from '../lib/importantStations'
import type { StationValue } from '../lib/routeStats'
import { DEFAULT_VIEW, LEFT_PANEL_FRACTION, restyleBasemap } from '../lib/mapStyle'
import { ROUTE_BADGE_ICON, STATION_MARKER_ICON, STATION_MARKER_OUTLINE_ICON, WEATHER_STATION_ICON } from '../lib/markerIcon'
import type { ConnectionFeature, FinlandGeoJSON, RouteHighlight, StationEms, StationFeature } from '../lib/types'

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
  /** The selected station's weather station marker was clicked: App opens its weather pop-up. */
  onWeatherStationClick: () => void
}

/**
 * The approved dashboard map, ported from prototype/index.html — see CLAUDE.md "Map style"
 * for the palette, camera and interaction spec this reproduces. Camera/basemap/Finland-highlight
 * logic is unchanged from the prototype; what's pickable is now the station network (dots +
 * the segments between directly-adjacent stations) rather than whole routes. MapLibre and
 * deck.gl are plain JS libraries here (no react-map-gl): the Map/overlay instances live in
 * refs and are created once in an effect, then kept in sync with props.
 */
export default function MapView({ stations, connections, finland, selected, onSelect, routeHighlight, routeValues, onRouteClick, activeRoute, resetSignal, onDriftChange, onReady, onWeatherStationClick }: MapProps) {
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
  const onWeatherClickRef = useRef(onWeatherStationClick)
  const emsHoverRef = useRef(false)
  // Set for one tick by a click on the weather station marker so the map's own click handler
  // (which deselects on an empty-map click) does not clear the selection it belongs to.
  const emsClickRef = useRef(false)
  const onReadyRef = useRef(onReady)

  onSelectRef.current = onSelect
  onDriftRef.current = onDriftChange
  onWeatherClickRef.current = onWeatherStationClick
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
    const dim = sel !== null || route !== null
    const isSel = (d: StationFeature) => sel?.code === d.code
    const isRouteEnd = (d: StationFeature) => route !== null && (d.code === route.start || d.code === route.end)
    const isHovered = (d: StationFeature) => hovered?.code === d.code
    const touchesSelected = (d: ConnectionFeature) => sel !== null && (d.from === sel.code || d.to === sel.code)
    const weatherStation = sel?.ems ?? null

    const revealT = Math.max(0, Math.min(1, (zoomRef.current - REVEAL_ZOOM_START) / (REVEAL_ZOOM_END - REVEAL_ZOOM_START)))
    const visibleCount = Math.round(TOP_10_STATION_CODES.length + (rankRef.current.size - TOP_10_STATION_CODES.length) * revealT)

    // Route mode: only the highlighted route's stations get a marker, as badges thinned by screen
    // distance (start and end always kept, then the most important stations first).
    const badges: StationFeature[] = []
    const map = mapRef.current
    if (route && map) {
      const byCode = new Map(currentStations.map((st) => [st.code, st]))
      const isEndCode = (code: string) => code === route.start || code === route.end
      const priority = (st: StationFeature) => (isEndCode(st.code) ? -1 : rankRef.current.get(st.code) ?? 1e9)
      const candidates = route.stationCodes
        .flatMap((code) => { const st = byCode.get(code); return st ? [st] : [] })
        .sort((a, b) => priority(a) - priority(b))
      const kept: { x: number; y: number }[] = []
      for (const st of candidates) {
        const pt = map.project([st.lon, st.lat])
        if (isEndCode(st.code) || kept.every((k) => Math.hypot(k.x - pt.x, k.y - pt.y) >= MIN_BADGE_GAP_PX)) {
          kept.push(pt)
          badges.push(st)
        }
      }
    }
    const badgeCodes = new Set(badges.map((st) => st.code))
    // Pins: normally the zoom-reveal rule; in route mode only a selected station that has no badge.
    const isRevealed = (d: StationFeature) =>
      route
        ? isSel(d) && !badgeCodes.has(d.code)
        : isSel(d) || isHovered(d) || (rankRef.current.get(d.code) ?? Infinity) < visibleCount

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
    const stationClick = ({ object }: { object?: unknown }) => onSelectRef.current((object as StationFeature | undefined) ?? null)
    const emsHover = ({ object }: { object?: unknown }) => {
      emsHoverRef.current = object !== undefined && object !== null
      setCursor()
    }
    const emsClick = () => {
      emsClickRef.current = true
      window.setTimeout(() => { emsClickRef.current = false }, 0)
      onWeatherClickRef.current()
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
      // The selected station's weather station: a thin ice link from the pin, a navy map pin with a
      // thermometer whose tip is the station's real location (no delay colour, see
      // lib/markerIcon.ts) and its name. Only
      // present while a station is selected. Flat overlay like the route badges, so it never
      // z-fights with the lines; clickable, which opens its January weather pop-up.
      new PathLayer<[number, number][]>({
        id: 'ems-link', data: weatherStation && sel ? [[[sel.lon, sel.lat], [weatherStation.lon, weatherStation.lat]]] : [],
        parameters: { depthCompare: 'always' },
        getPath: (d) => d,
        widthUnits: 'pixels', capRounded: true,
        getWidth: 2,
        getColor: [156, 195, 232, 190],
      }),
      new IconLayer<StationEms>({
        id: 'ems-marker', data: weatherStation ? [weatherStation] : [], pickable: true,
        parameters: { depthCompare: 'always' },
        getPosition: (d) => [d.lon, d.lat],
        getIcon: () => WEATHER_STATION_ICON,
        sizeUnits: 'pixels', getSize: 44,
        onHover: emsHover, onClick: emsClick,
      }),
      new TextLayer<StationEms>({
        id: 'ems-label', data: weatherStation ? [weatherStation] : [],
        parameters: { depthCompare: 'always' },
        getPosition: (d) => [d.lon, d.lat],
        getText: (d) => d.name,
        getSize: 15, sizeUnits: 'pixels',
        getColor: [234, 241, 248, 255],
        // The pin's tip is the anchor, so the name sits just below it.
        getPixelOffset: [0, 6],
        getTextAnchor: 'middle', getAlignmentBaseline: 'top',
        fontFamily: 'Barlow, system-ui, sans-serif', fontWeight: 500,
        characterSet: 'auto',
        outlineWidth: 3, outlineColor: [2, 6, 13, 255],
      }),
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
          } else if (layerId === 'ems-marker') {
            // A weather station, not a train station: it has no `avgDelay`.
            const ems = object as StationEms
            text = `${ems.name} weather station\n${ems.km.toFixed(1)} km away\nClick for January weather`
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
  }, [stations, connections, selected, routeHighlight, activeRoute, routeValues])

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
      const pts = routeHighlight.paths.flat()
      const lons = pts.map((p) => p[0])
      const lats = pts.map((p) => p[1])
      map.fitBounds(
        [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
        { padding: { top: 110, bottom: 110, left: 60, right: 80 }, maxZoom: 8, bearing: map.getBearing(), pitch: map.getPitch(), duration: 800 },
      )
      hadRouteRef.current = true
    } else if (hadRouteRef.current) {
      hadRouteRef.current = false
      map.flyTo({ ...DEFAULT_VIEW, duration: 600 })
    }
  }, [routeHighlight])

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
