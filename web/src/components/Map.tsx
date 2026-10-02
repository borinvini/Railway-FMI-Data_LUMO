import { MapboxOverlay } from '@deck.gl/mapbox'
import { IconLayer, PathLayer } from '@deck.gl/layers'
import * as maplibregl from 'maplibre-gl'
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import { delayColor, NETWORK_LINE_COLOR, NETWORK_LINE_CORE_COLOR } from '../lib/colors'
import { TOP_10_STATION_CODES } from '../lib/importantStations'
import { DEFAULT_VIEW, LEFT_PANEL_FRACTION, restyleBasemap } from '../lib/mapStyle'
import { STATION_MARKER_ICON, STATION_MARKER_OUTLINE_ICON } from '../lib/markerIcon'
import type { ConnectionFeature, FinlandGeoJSON, RouteHighlight, StationFeature } from '../lib/types'

// At the default zoom, only Finland's 10 biggest cities show a marker (see
// lib/importantStations.ts); zooming in reveals progressively less prominent stations, ranked
// by network traffic (`runs`), until every station shows by REVEAL_ZOOM_END. Selected/hovered
// stations always show regardless of rank.
const REVEAL_ZOOM_START = DEFAULT_VIEW.zoom
const REVEAL_ZOOM_END = 8

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
  /** The Reset view button was pressed: App clears the station and route selection. */
  onReset: () => void
}

/**
 * The approved dashboard map, ported from prototype/index.html — see CLAUDE.md "Map style"
 * for the palette, camera and interaction spec this reproduces. Camera/basemap/Finland-highlight
 * logic is unchanged from the prototype; what's pickable is now the station network (dots +
 * the segments between directly-adjacent stations) rather than whole routes. MapLibre and
 * deck.gl are plain JS libraries here (no react-map-gl): the Map/overlay instances live in
 * refs and are created once in an effect, then kept in sync with props.
 */
export default function MapView({ stations, connections, finland, selected, onSelect, routeHighlight, onRouteClick, activeRoute, onReset }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const overlayRef = useRef<MapboxOverlay | null>(null)
  const hoveredRef = useRef<StationFeature | null>(null)
  const selectedRef = useRef<StationFeature | null>(selected)
  const stationsRef = useRef<StationFeature[]>(stations)
  const connectionsRef = useRef<ConnectionFeature[]>(connections)
  const routeRef = useRef<RouteHighlight | null>(routeHighlight)
  const hadRouteRef = useRef(false)
  const onSelectRef = useRef(onSelect)
  const onRouteClickRef = useRef(onRouteClick)
  const activeRouteRef = useRef<number | null>(activeRoute)
  const routeHoverRef = useRef(false)
  const zoomRef = useRef(DEFAULT_VIEW.zoom)
  // code -> importance rank (0 = most important). The top 10 cities are fixed at the front;
  // the rest are ranked by `runs` (how often a train stops there), a proxy for network
  // significance -- recomputed whenever the station list changes, not on every render.
  const rankRef = useRef<Map<string, number>>(new Map())
  const [resetShown, setResetShown] = useState(false)

  onSelectRef.current = onSelect
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
    // While a route is highlighted, markers appear only for stations on it (until it's cleared).
    const routeStations = route ? new Set(route.stationCodes) : null
    const onRoute = (d: StationFeature) => routeStations === null || routeStations.has(d.code)
    const isHovered = (d: StationFeature) => hovered?.code === d.code
    const touchesSelected = (d: ConnectionFeature) => sel !== null && (d.from === sel.code || d.to === sel.code)

    const revealT = Math.max(0, Math.min(1, (zoomRef.current - REVEAL_ZOOM_START) / (REVEAL_ZOOM_END - REVEAL_ZOOM_START)))
    const visibleCount = Math.round(TOP_10_STATION_CODES.length + (rankRef.current.size - TOP_10_STATION_CODES.length) * revealT)
    const isRevealed = (d: StationFeature) =>
      isSel(d) || isRouteEnd(d) ||
      (onRoute(d) && (isHovered(d) || (rankRef.current.get(d.code) ?? Infinity) < visibleCount))

    const setCursor = () => {
      // MapLibre's own canvas carries `cursor: grab`, which overrides the cursor deck.gl sets on
      // its container -- so set it on the MapLibre canvas directly.
      const canvas = mapRef.current?.getCanvas()
      if (canvas) canvas.style.cursor = hoveredRef.current || routeHoverRef.current ? 'pointer' : ''
    }
    const routeHover = ({ object }: { object?: unknown }) => {
      routeHoverRef.current = object !== undefined && object !== null
      setCursor()
    }
    const routeClick = ({ index }: { index: number }) => {
      if (index >= 0) onRouteClickRef.current(index)
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
        onHover: ({ object }) => {
          hoveredRef.current = (object as StationFeature | undefined) ?? null
          setCursor()
          overlayRef.current?.setProps({ layers: buildLayers() })
        },
        onClick: ({ object }) => onSelectRef.current((object as StationFeature | undefined) ?? null),
        updateTriggers: { getSize: [sel, hovered, revealT, route], getColor: [sel, hovered, route] },
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
        setResetShown(drifted)
      }
      map.on('rotate', updateResetVisibility)
      map.on('pitch', updateResetVisibility)
      map.on('zoom', updateResetVisibility)
      map.on('move', updateResetVisibility)

      map.on('zoom', () => {
        zoomRef.current = map!.getZoom()
        scheduleRebuild()
      })

      const overlay = new MapboxOverlay({
        interleaved: false, layers: buildLayers(), pickingRadius: 10,
        getTooltip: ({ object, layer }) => {
          if (!object) return null
          const isRoute = layer?.id.startsWith('route-highlight') ?? false
          const station = object as StationFeature
          return {
            text: isRoute ? 'Click for route details' : `${station.name}\n${station.avgDelay.toFixed(1)} min late on average`,
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

      map.on('click', () => { if (!hoveredRef.current && !routeHoverRef.current) onSelectRef.current(null) })
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
  }, [stations, connections, selected, routeHighlight, activeRoute])

  // Pan to whichever station gets selected, whether that came from a map click or the
  // dropdown menu (StationSelect only lifts the selection to App; this is the one place
  // that knows about the map instance, so it owns the fly-to).
  useEffect(() => {
    if (selected) mapRef.current?.flyTo({ center: [selected.lon, selected.lat], duration: 600 })
  }, [selected])

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

  function resetView() {
    onReset()
    mapRef.current?.flyTo({ ...DEFAULT_VIEW, duration: 600 })
  }

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
      <button
        type="button"
        onClick={resetView}
        className={`absolute bottom-6 left-[270px] flex items-center gap-[7px] rounded-[10px] border border-(--line) bg-(--surface) px-[14px] py-[10px] text-[13px] text-(--muted) backdrop-blur-[8px] transition-opacity duration-150 hover:text-(--text) ${
          (resetShown || selected !== null || routeHighlight !== null) ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[14px] w-[14px]">
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
        </svg>
        Reset view
      </button>
    </>
  )
}
