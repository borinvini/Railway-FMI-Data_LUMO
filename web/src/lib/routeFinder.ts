import type { RouteHighlight, RoutePattern } from './types'

export interface RouteResult {
  /** Each distinct stop-by-stop way trains get from `start` to `end`. */
  paths: string[][]
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
  const pathRuns = new Map<string, { path: string[]; runs: number }>()
  const typeRuns = new Map<string, number>()

  for (const p of patterns) {
    const i = p.stops.indexOf(start)
    if (i < 0) continue
    const j = p.stops.indexOf(end, i + 1)
    if (j < 0) continue

    const path = p.stops.slice(i, j + 1)
    const key = path.join('>')
    const runs = Object.values(p.runsByType).reduce((a, b) => a + b, 0)
    const entry = pathRuns.get(key)
    if (entry) entry.runs += runs
    else pathRuns.set(key, { path, runs })

    for (const [type, n] of Object.entries(p.runsByType)) {
      typeRuns.set(type, (typeRuns.get(type) ?? 0) + n)
    }
  }

  if (pathRuns.size === 0) return null
  const byType = [...typeRuns].map(([type, trains]) => ({ type, trains })).sort((a, b) => b.trains - a.trains)
  return {
    paths: [...pathRuns.values()].sort((a, b) => b.runs - a.runs).map((e) => e.path),
    byType,
    totalTrains: byType.reduce((sum, t) => sum + t.trains, 0),
  }
}

/**
 * Turns station-code paths into [lon, lat] paths for the map. A station with no known
 * coordinates (a few border stops aren't in the metadata) is skipped, so the line bridges
 * straight over it instead of breaking.
 */
export function toHighlight(
  result: RouteResult,
  start: string,
  end: string,
  coords: Map<string, [number, number]>,
): RouteHighlight {
  const paths = result.paths.map((codes) =>
    codes.map((c) => coords.get(c)).filter((c): c is [number, number] => c !== undefined),
  )
  return { paths: paths.filter((p) => p.length >= 2), start, end }
}
