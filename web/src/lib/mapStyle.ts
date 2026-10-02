import type { LayerSpecification, StyleSpecification } from '@maplibre/maplibre-gl-style-spec'
import type { FinlandGeoJSON } from './types'

/**
 * MapLibre's `LayerSpecification` is a strict discriminated union keyed on `type`, which makes
 * generic "look up this layer by id and poke its paint" code (below) awkward to type exactly.
 * We mutate through this loosened shape instead of fighting the union per property.
 */
type MutableLayer = LayerSpecification & { paint?: Record<string, unknown>; layout?: Record<string, unknown> }

/**
 * Fixed camera, approved by the user — same on first load and on every reset, regardless of
 * window size (a bounds+padding fit was tried first but recomputes slightly per viewport).
 * See CLAUDE.md "Camera". Do not derive this from fitBounds.
 */
export const DEFAULT_VIEW = {
  center: [24.635713828561506, 63.3503682327765] as [number, number],
  zoom: 5.853516957291411,
  pitch: 61.37740676562255,
  bearing: -14.062336607182147,
}

/** Share of the screen width kept free on the left for the statistics column. Applied as map
 *  camera padding, so DEFAULT_VIEW's numbers stay untouched and Finland lands in the same
 *  relative spot (centre at ~68% of the width) on any window size. */
export const LEFT_PANEL_FRACTION = 0.36

/** "Nordic night" palette: navy shades derived from the Finnish flag blue (Pantone 294 C,
 *  #002F6C) with an icy accent. See CLAUDE.md "Map style". */
const P = {
  land: '#0d1b2e',
  finlandLand: '#16304f', // Finland highlighted a step lighter than the rest
  outsideDim: 0.5, // overlay strength outside Finland
  mask: '#02060d',
  water: '#040b16',
  waterLabel: '#3a5070',
  road: '#2a3d55',
  boundary: '#1f3048',
  ice: '#9cc3e8', // highways, country labels/borders, Finland outline
  city: '#c9d6e3', // locality labels
  label: '#7f93a8',
  halo: '#02060d',
}

// Layers kept (recoloured); everything else is hidden for a minimalist look. OSM rail lines
// are hidden so they never compete with our own route lines.
const HIDE_PREFIX = [
  'landcover', 'landuse', 'building', 'aeroway', 'road_', 'highway_path',
  'highway_minor', 'highway_major_casing', 'highway_major_subtle', 'highway_motorway_casing',
  'highway_motorway_subtle', 'highway_name', 'railway', 'place_other', 'place_suburb', 'place_village',
]

/**
 * Restyles the OpenFreeMap "dark" style to the Nordic-night palette and highlights Finland.
 * Mutates and returns `style`. See CLAUDE.md "Restyle recipe" / "Highlighting Finland".
 */
export function restyleBasemap(style: StyleSpecification, finland: FinlandGeoJSON): StyleSpecification {
  const layers = (style.layers as MutableLayer[]).filter((l) => l.type !== 'raster') // drop shaded-relief raster
  style.layers = layers as LayerSpecification[]
  style.sources.finland = { type: 'geojson', data: finland }

  for (const l of layers) {
    const id = l.id
    l.paint = l.paint || {}
    if (HIDE_PREFIX.some((p) => id.startsWith(p))) {
      l.layout = { ...(l.layout || {}), visibility: 'none' }
      continue
    }
    const paint = l.paint
    if (id === 'background') paint['background-color'] = P.land
    else if (id === 'water') paint['fill-color'] = P.water
    else if (id === 'waterway') paint['line-color'] = P.water
    else if (id === 'water_name') { paint['text-color'] = P.waterLabel; paint['text-halo-color'] = P.halo }
    else if (id === 'highway_major_inner') { paint['line-color'] = P.road; paint['line-opacity'] = 0.35 }
    else if (id === 'highway_motorway_inner') { paint['line-color'] = P.ice; paint['line-opacity'] = 0.28 }
    else if (id.startsWith('boundary_country')) { paint['line-color'] = P.ice; paint['line-opacity'] = 0.35 }
    else if (id.startsWith('boundary')) paint['line-color'] = P.boundary
    else if (id.startsWith('place_country')) { paint['text-color'] = P.ice; paint['text-halo-color'] = P.halo }
    else if (id.startsWith('place_')) {
      paint['text-color'] = id === 'place_state' ? P.label : P.city
      paint['text-halo-color'] = P.halo
      paint['text-halo-width'] = 1.2
    }
  }

  // Highlight Finland: lighter land under the water layers, dimmed mask over everything else.
  const bgIdx = style.layers.findIndex((l) => l.id === 'background')
  style.layers.splice(bgIdx + 1, 0, {
    id: 'finland-land', type: 'fill', source: 'finland',
    filter: ['==', ['get', 'kind'], 'land'],
    paint: { 'fill-color': P.finlandLand },
  })
  style.layers.push(
    {
      id: 'outside-mask', type: 'fill', source: 'finland',
      filter: ['==', ['get', 'kind'], 'mask'],
      paint: { 'fill-color': P.mask, 'fill-opacity': P.outsideDim },
    },
    {
      id: 'finland-outline', type: 'line', source: 'finland',
      filter: ['==', ['get', 'kind'], 'outline'],
      paint: { 'line-color': P.ice, 'line-opacity': 0.6, 'line-width': 1.1 },
    },
  )

  return style
}
