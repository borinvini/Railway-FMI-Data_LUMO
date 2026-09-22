/** One origin→destination route, aggregated over the month (see scripts/build_data.py). */
export interface RouteFeature {
  id: string
  from_: string
  to: string
  runs: number
  avgDelay: number
  onTimePct: number
  path: [number, number][]
}

/** Finland outline data — see CLAUDE.md "Highlighting Finland". */
export type FinlandFeatureKind = 'land' | 'mask' | 'outline'
export type FinlandGeoJSON = GeoJSON.FeatureCollection<GeoJSON.Geometry, { kind: FinlandFeatureKind }>
