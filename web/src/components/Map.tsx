import { MapboxOverlay } from '@deck.gl/mapbox'
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers'
import * as maplibregl from 'maplibre-gl'
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre resolves its web-worker script as a sibling file next to its own module's URL at
// runtime. That works unbundled (dev), but in a production bundle the code ends up looking
// for the worker beside the bundled chunk, where it was never emitted — Vite can't statically
// see that dynamic URL construction to know to copy it. Importing it with `?url` makes Vite
// emit the real worker file and give us its correct built (and base-path-aware) URL, which we
// hand to MapLibre explicitly. Must run before any `maplibregl.Map` is constructed.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useRef, useState } from 'react'
import { delayColor } from '../lib/colors'
import { DEFAULT_VIEW, restyleBasemap } from '../lib/mapStyle'
import type { FinlandGeoJSON, RouteFeature } from '../lib/types'

maplibregl.setWorkerUrl(maplibreWorkerUrl)

const BASEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark'

interface MapProps {
  routes: RouteFeature[]
  finland: FinlandGeoJSON | null
  selected: RouteFeature | null
  onSelect: (route: RouteFeature | null) => void
}

/**
 * The approved dashboard map, ported from prototype/index.html — see CLAUDE.md "Map style"
 * for the palette, camera and interaction spec this reproduces. MapLibre and deck.gl are
 * plain JS libraries here (no react-map-gl): the Map/overlay instances live in refs and are
 * created once in an effect, then kept in sync with props.
 */
export default function MapView({ routes, finland, selected, onSelect }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const overlayRef = useRef<MapboxOverlay | null>(null)
  const hoveredRef = useRef<RouteFeature | null>(null)
  const selectedRef = useRef<RouteFeature | null>(selected)
  const routesRef = useRef<RouteFeature[]>(routes)
  const onSelectRef = useRef(onSelect)
  const [resetShown, setResetShown] = useState(false)

  onSelectRef.current = onSelect

  function buildLayers() {
    const currentRoutes = routesRef.current
    const dim = selectedRef.current !== null
    const isSel = (d: RouteFeature) => selectedRef.current?.id === d.id
    const alpha = (d: RouteFeature, hi: number, lo: number) =>
      isSel(d) || d === hoveredRef.current ? hi : dim ? lo : hi

    return [
      new PathLayer<RouteFeature>({
        id: 'glow', data: currentRoutes, getPath: (d) => d.path, widthUnits: 'pixels',
        getWidth: (d) => (isSel(d) ? 14 : 9), capRounded: true, jointRounded: true,
        getColor: (d) => delayColor(d.avgDelay, alpha(d, 55, 8)),
        updateTriggers: { getColor: [selectedRef.current, hoveredRef.current], getWidth: [selectedRef.current] },
      }),
      new PathLayer<RouteFeature>({
        id: 'core', data: currentRoutes, pickable: true, autoHighlight: false,
        getPath: (d) => d.path, widthUnits: 'pixels', widthMinPixels: 2,
        getWidth: (d) => (isSel(d) || d === hoveredRef.current ? 4 : 2.4), capRounded: true, jointRounded: true,
        getColor: (d) => delayColor(d.avgDelay, alpha(d, 255, 55)),
        onHover: ({ object }) => {
          hoveredRef.current = (object as RouteFeature | undefined) ?? null
          overlayRef.current?.setProps({ layers: buildLayers() })
        },
        onClick: ({ object }) => onSelectRef.current((object as RouteFeature | undefined) ?? null),
        updateTriggers: {
          getColor: [selectedRef.current, hoveredRef.current],
          getWidth: [selectedRef.current, hoveredRef.current],
        },
      }),
      new ScatterplotLayer<[number, number]>({
        id: 'ends',
        data: currentRoutes.flatMap((r) => [r.path[0], r.path[r.path.length - 1]]),
        getPosition: (d) => d, radiusUnits: 'pixels', getRadius: 3.2,
        getFillColor: [240, 240, 245, 200],
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
      map.on('error', (e: maplibregl.ErrorEvent & { sourceId?: string }) =>
        console.error('MAPERR', e.error?.message, e.sourceId ?? ''),
      )

      map.addControl(new maplibregl.NavigationControl({ showZoom: false, visualizePitch: true }), 'top-right')

      function updateResetVisibility() {
        if (!map) return
        const drifted =
          Math.abs(map.getPitch() - DEFAULT_VIEW.pitch) > 1 ||
          Math.abs(map.getBearing() - DEFAULT_VIEW.bearing) > 1 ||
          Math.abs(map.getZoom() - DEFAULT_VIEW.zoom) > 0.3
        setResetShown(drifted)
      }
      map.on('rotate', updateResetVisibility)
      map.on('pitch', updateResetVisibility)
      map.on('zoom', updateResetVisibility)

      const overlay = new MapboxOverlay({ interleaved: false, layers: buildLayers(), pickingRadius: 10 })
      overlayRef.current = overlay
      map.addControl(overlay as unknown as maplibregl.IControl)

      map.on('click', () => { if (!hoveredRef.current) onSelectRef.current(null) })
      onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onSelectRef.current(null) }
      document.addEventListener('keydown', onKeyDown)
    })()

    return () => {
      cancelled = true
      if (onKeyDown) document.removeEventListener('keydown', onKeyDown)
      map?.remove()
      mapRef.current = null
      overlayRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finland])

  // Keep deck.gl layers in sync with the routes data and the selection lifted to App.
  useEffect(() => {
    routesRef.current = routes
    selectedRef.current = selected
    overlayRef.current?.setProps({ layers: buildLayers() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, selected])

  function resetView() {
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
        style={{ background: 'linear-gradient(to bottom, var(--bg), rgba(11,11,12,0))' }}
      />
      <button
        type="button"
        onClick={resetView}
        className={`absolute bottom-6 left-[270px] flex items-center gap-[7px] rounded-[10px] border border-(--line) bg-(--surface) px-[14px] py-[10px] text-[13px] text-(--muted) backdrop-blur-[8px] transition-opacity duration-150 hover:text-(--text) ${
          resetShown ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
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
