import type { RouteHighlight, RoutePath, RoutePattern } from './types'

export interface RouteResult {
  /** Each distinct stop-by-stop way trains get from `start` to `end` (busiest first). */
  paths: RoutePath[]
  /** Trains per train type (busiest first). A run belongs to exactly one type. */
  byType: { type: string; trains: number }[]
  totalTrains: number
}

/**
 * Direct trains that stop at `start` and then, later in the same run, at `end`. Trains run in
 * both directions, so each direction appears as its own pattern in the data -- no special
 * handling needed for reversed pairs. Returns null when there is no such train.
 */
export function findRoutes(patterns: RoutePattern[], start: string, end: string): RouteResult | null {
  const paths = new Map<string, RoutePath>()
  const typeRuns = new Map<string, number>()

  for (const p of patterns) {
    const i = p.stops.indexOf(start)
    if (i < 0) continue
    const j = p.stops.indexOf(end, i + 1)
    if (j < 0) continue

    const stops = p.stops.slice(i, j + 1)
    const key = stops.join('>')
    let path = paths.get(key)
    if (!path) {
      path = { stops, trains: 0, byType: {}, sources: [] }
      paths.set(key, path)
    }

    // A service (origin -> destination x train type) is what the saved statistics describe;
    // its id matches the keys of route_stats.json.
    const serviceBase = `${p.stops[0]}-${p.stops[p.stops.length - 1]}`
    for (const [type, n] of Object.entries(p.runsByType)) {
      path.trains += n
      path.byType[type] = (path.byType[type] ?? 0) + n
      const id = `${serviceBase}-${type}`
      const source = path.sources.find((s) => s.id === id)
      if (source) source.trains += n
      else path.sources.push({ id, trains: n })
      typeRuns.set(type, (typeRuns.get(type) ?? 0) + n)
    }
  }

  if (paths.size === 0) return null
  const byType = [...typeRuns].map(([type, trains]) => ({ type, trains })).sort((a, b) => b.trains - a.trains)
  return {
    paths: [...paths.values()].sort((a, b) => b.trains - a.trains),
    byType,
    totalTrains: byType.reduce((sum, t) => sum + t.trains, 0),
  }
}

/**
 * Turns station-code paths into [lon, lat] paths for the map, index-aligned with
 * `result.paths` (a clicked line's index selects the matching route's details). A station with
 * no known coordinates (a few border stops aren't in the metadata) is skipped, so the line
 * bridges straight over it instead of breaking.
 */
export function toHighlight(
  result: RouteResult,
  start: string,
  end: string,
  coords: Map<string, [number, number]>,
): RouteHighlight {
  return {
    paths: result.paths.map((p) => p.stops.map((c) => coords.get(c)).filter((c): c is [number, number] => c !== undefined)),
    start,
    end,
    stationCodes: [...new Set(result.paths.flatMap((p) => p.stops))],
  }
}

const MIN_DISTANCE_KM = 100

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/**
 * A random pair of passenger stations that a real train connects: pick a train pattern
 * (weighted by how many runs followed it, so common services come up more often), then two of
 * its passenger stops (start before end) at least MIN_DISTANCE_KM apart as the crow flies, so
 * the route is worth looking at -- "3 stops apart" was tried first but is only a few km in the
 * dense Helsinki area. The pair always has a direct train, so the finder never answers "no
 * direct train" for it. Tries a few times to avoid repeating `avoid` (the pair currently
 * shown). `stations` maps every passenger station code to its coordinates. Null only if no
 * train in the data covers that distance.
 */
export function pickRandomRoute(
  patterns: RoutePattern[],
  stations: Map<string, { lat: number; lon: number }>,
  avoid?: { start: string; end: string } | null,
): { start: string; end: string } | null {
  const candidates = patterns
    .map((p) => ({
      stops: p.stops.filter((c) => stations.has(c)),
      runs: Object.values(p.runsByType).reduce((a, b) => a + b, 0),
    }))
    .filter((c) => c.stops.length >= 2)
  const totalRuns = candidates.reduce((sum, c) => sum + c.runs, 0)
  if (totalRuns === 0) return null

  for (let attempt = 0; attempt < 30; attempt++) {
    let r = Math.random() * totalRuns
    const chosen = candidates.find((c) => (r -= c.runs) < 0) ?? candidates[candidates.length - 1]
    const pairs: { start: string; end: string }[] = []
    for (let i = 0; i < chosen.stops.length; i++) {
      for (let j = i + 1; j < chosen.stops.length; j++) {
        const start = chosen.stops[i]
        const end = chosen.stops[j]
        if (distanceKm(stations.get(start)!, stations.get(end)!) < MIN_DISTANCE_KM) continue
        if (avoid && start === avoid.start && end === avoid.end) continue
        pairs.push({ start, end })
      }
    }
    if (pairs.length) return pairs[Math.floor(Math.random() * pairs.length)]
  }
  return null
}
