/** One origin→destination route, aggregated over the month (see scripts/build_data.py).
 *  Not currently used by the home page (station map superseded it), kept for a possible
 *  future route-detail view. */
export interface RouteFeature {
  id: string
  from_: string
  to: string
  runs: number
  avgDelay: number
  onTimePct: number
  path: [number, number][]
}

/** One passenger station, with its own delay stats (see scripts/build_data.py,
 *  scripts/routes_lib.py `station_summary`). */
export interface StationFeature {
  code: string
  name: string
  lat: number
  lon: number
  avgDelay: number
  onTimePct: number
  runs: number
  appearances: number
  distinctRoutes: number
  cancelledPct: number
}

/** One physical segment between two directly-adjacent passenger stations
 *  (see scripts/routes_lib.py `station_network_edges`). */
export interface ConnectionFeature {
  from: string
  to: string
  fromLon: number
  fromLat: number
  toLon: number
  toLat: number
  runs: number
}

/** Finland outline data — see CLAUDE.md "Highlighting Finland". */
export type FinlandFeatureKind = 'land' | 'mask' | 'outline'
export type FinlandGeoJSON = GeoJSON.FeatureCollection<GeoJSON.Geometry, { kind: FinlandFeatureKind }>

/** One distinct full stop sequence a train ran (see scripts/build_data.py
 *  `build_route_patterns_payload`): every station it stops at, in order, plus how many runs
 *  of each train type followed it. */
export interface RoutePattern {
  stops: string[]
  runsByType: Record<string, number>
}

/** What the route finder highlights on the map: one [lon, lat] path per distinct way trains
 *  get from the start station to the end station, plus the two end stations. */
export interface RouteHighlight {
  paths: [number, number][][]
  start: string
  end: string
}
