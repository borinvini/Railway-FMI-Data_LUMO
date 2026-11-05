import type { Period } from './period'
import type { RouteHighlight, RoutePath, RoutePattern } from './types'

export interface RouteResult {
  /** Each distinct way (track) trains take from `start` to `end`, busiest first; stop sequences
   *  that differ only in skipped stops on the same track are one path. */
  paths: RoutePath[]
  /** Trains per train type (busiest first). A run belongs to exactly one type. */
  byType: { type: string; trains: number }[]
  totalTrains: number
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** Trains of one type on one pattern in the picked period. `years` is `SummaryFile.years`, which
 *  `runsByType` is aligned with; a month reads `runsByMonth` (January first). */
export function trainsIn(pattern: RoutePattern, type: string, p: Period, years: number[]): number {
  const perYear = pattern.runsByType[type] ?? []
  if (p.kind === 'year') return perYear[years.indexOf(p.year)] ?? 0
  if (p.kind === 'month') return pattern.runsByMonth?.[type]?.[p.month - 1] ?? 0
  return sum(perYear)
}

/** Two stop sequences are the same route when no stop of either lies further than this from the
 *  other's line. Trains on the same track differ only in which waypoints they record (0-6 km
 *  apart, a chord across a curve); real alternatives (Kerava-Lahti vs Riihimäki-Lahti, via
 *  Tampere vs via Kouvola) are 27 km or more apart in the data. */
export const SAME_ROUTE_KM = 12

type XY = [number, number]

/** [lon, lat] to flat km around Finland's middle latitude: plenty for a 12 km test. */
const toKm = ([lon, lat]: [number, number]): XY => [lon * 111.32 * Math.cos((63 * Math.PI) / 180), lat * 110.57]

function segmentKm(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}

/** The furthest any point of `a` lies from the line through `b`. */
function furthestKm(a: XY[], b: XY[]): number {
  if (b.length < 2) return 0
  let worst = 0
  for (const p of a) {
    let best = Infinity
    for (let i = 1; i < b.length && best > worst; i++) best = Math.min(best, segmentKm(p, b[i - 1], b[i]))
    if (best > worst) worst = best
  }
  return worst
}

/** Stops in `extra` that `base` lacks, each placed right after the last stop the two share, so a
 *  waypoint one variant records lands where it sits on the track. */
function unionStops(base: string[], extra: string[]): string[] {
  const out = [...base]
  let at = -1
  for (const code of extra) {
    const i = out.indexOf(code)
    if (i >= 0) at = i
    else out.splice(++at, 0, code)
  }
  return out
}

/**
 * Groups stop sequences that follow the same track into one route (see SAME_ROUTE_KM), busiest
 * first: a variant joins the first group whose busiest member runs along it, otherwise it starts
 * a new group. Trains, types and services are summed; the stops are the ordered union. A stop
 * with no known coordinates is left out of the distance test.
 */
export function mergeVariants(variants: RoutePath[], coords: Map<string, [number, number]>): RoutePath[] {
  const line = (p: RoutePath) => p.stops.flatMap((c) => {
    const ll = coords.get(c)
    return ll ? [toKm(ll)] : []
  })
  const groups: { lead: XY[]; path: RoutePath }[] = []
  for (const v of [...variants].sort((a, b) => b.trains - a.trains)) {
    const pts = line(v)
    const group = groups.find((g) => Math.max(furthestKm(pts, g.lead), furthestKm(g.lead, pts)) <= SAME_ROUTE_KM)
    if (!group) {
      groups.push({ lead: pts, path: { stops: [...v.stops], trains: v.trains, byType: { ...v.byType }, sources: v.sources.map((s) => ({ ...s })) } })
      continue
    }
    const p = group.path
    p.stops = unionStops(p.stops, v.stops)
    p.trains += v.trains
    for (const [type, n] of Object.entries(v.byType)) p.byType[type] = (p.byType[type] ?? 0) + n
    for (const s of v.sources) {
      const same = p.sources.find((x) => x.id === s.id)
      if (same) same.trains += s.trains
      else p.sources.push({ ...s })
    }
  }
  return groups.map((g) => g.path).sort((a, b) => b.trains - a.trains)
}

/** The train type of a service id (`<from>-<to>-<type>`). */
export const serviceType = (id: string) => id.slice(id.lastIndexOf('-') + 1)

/** The same route, counting only trains of one type: its stops stay, its trains and services
 *  narrow to that type. */
export function pathForType(path: RoutePath, type: string): RoutePath {
  const sources = path.sources.filter((s) => serviceType(s.id) === type)
  return {
    stops: path.stops,
    trains: path.byType[type] ?? 0,
    byType: { [type]: path.byType[type] ?? 0 },
    sources,
  }
}

/**
 * Direct trains that stop at `start` and then, later in the same run, at `end`. Trains run in
 * both directions, so each direction appears as its own pattern in the data -- no special
 * handling needed for reversed pairs. `period` picks the period to count trains for (`years` =
 * `SummaryFile.years`); a way that no train used in that period is left out. Stop sequences on
 * the same track are merged into one route (`mergeVariants`, using `coords`: [lon, lat] for every
 * stop code). Returns null when there is no such train.
 */
export function findRoutes(
  patterns: RoutePattern[],
  start: string,
  end: string,
  period: Period,
  years: number[],
  coords: Map<string, [number, number]>,
): RouteResult | null {
  const paths = new Map<string, RoutePath>()
  const typeRuns = new Map<string, number>()

  for (const p of patterns) {
    const i = p.stops.indexOf(start)
    if (i < 0) continue
    const j = p.stops.indexOf(end, i + 1)
    if (j < 0) continue

    const counts = Object.keys(p.runsByType)
      .map((type) => [type, trainsIn(p, type, period, years)] as const)
      .filter(([, n]) => n > 0)
    if (counts.length === 0) continue

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
    for (const [type, n] of counts) {
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
    paths: mergeVariants([...paths.values()], coords),
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
 * dense Helsinki area. The pair always has a direct train in the picked period, so the finder
 * never answers "no direct train" for it. Tries a few times to avoid repeating `avoid` (the pair
 * currently shown). `stations` maps every passenger station code to its coordinates. Null only if no
 * train in the data covers that distance.
 */
export function pickRandomRoute(
  patterns: RoutePattern[],
  stations: Map<string, { lat: number; lon: number }>,
  avoid: { start: string; end: string } | null,
  period: Period,
  years: number[],
): { start: string; end: string } | null {
  const candidates = patterns
    .map((p) => ({
      stops: p.stops.filter((c) => stations.has(c)),
      runs: Object.keys(p.runsByType).reduce((a, type) => a + trainsIn(p, type, period, years), 0),
    }))
    .filter((c) => c.stops.length >= 2 && c.runs > 0)
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
