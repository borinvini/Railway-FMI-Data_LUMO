import { distanceKm } from './routeFinder'
import type { EmsWeatherFile, RoutePath, RouteStatsFile, StationFeature, WeatherCell, WeatherPin } from './types'

export interface ServiceRow {
  id: string
  type: string
  journey: string
  /** Trains of this service that follow the selected route. */
  trains: number
  avg: number | null
  onTime: number | null
  /** 90th percentile of per-train average delay: the worst 10% of trains were later than this. */
  p90: number | null
  cancelled: number | null
}

export interface StopPoint {
  code: string
  name: string
  /** Typical minutes late at this stop; null when no service has data for it. */
  avg: number | null
  trains: number
  /** Mean air temperature (°C) and snow depth (cm) when this route's trains were at the stop, and
   *  how many readings that is (weight when stops are pooled). null / 0 when too few. */
  temp: number | null
  snow: number | null
  weatherN: number
}

export interface RouteSummary {
  trains: number
  avgLate: number | null
  onTimePct: number | null
  minorPct: number | null
  majorPct: number | null
  cancelledPct: number | null
  services: ServiceRow[]
  stops: StopPoint[]
  /** Services on this route that have no saved statistics (should be none). */
  missingServices: number
  insights: string[]
  /** Arrivals by weather band, pooled over the route's services; null per band when empty. */
  weather: { t: (WeatherRow | null)[]; s: (WeatherRow | null)[] }
}

export interface WeatherRow {
  /** Arrivals in this band, mean minutes late, and the share more than 5 min late. */
  n: number
  avg: number
  latePct: number
}

const stripAsema = (s: string) => s.replace(/ asema$/, '')

/** Weighted mean of `value` over `items`, ignoring null values; null if nothing has a value. */
function weightedMean<T>(items: T[], value: (t: T) => number | null, weight: (t: T) => number): number | null {
  let sum = 0
  let total = 0
  for (const item of items) {
    const v = value(item)
    const w = weight(item)
    if (v === null || w <= 0) continue
    sum += v * w
    total += w
  }
  return total > 0 ? sum / total : null
}

/**
 * Numbers for the route details pop-up, from the saved statistics (route_stats.json, the same
 * rows as routes_index.csv).
 *
 * - General stats: weighted averages across the train services that run this route (weight =
 *   trains on this route). Averages and percentages combine exactly this way; percentiles do
 *   not, so "worst 10%" only appears per service in the table.
 * - Stops: for each stop on the route, the weighted mean of the services' per-stop average
 *   delay (weight = that stop's trains).
 */
export function summarizeRoute(
  path: RoutePath,
  stats: RouteStatsFile,
  stationNames: Map<string, string>,
): RouteSummary {
  const found = path.sources.flatMap((source) => {
    const stat = stats[source.id]
    return stat ? [{ source, stat }] : []
  })

  const general = (pick: (s: (typeof found)[number]['stat']) => number | null) =>
    weightedMean(found, (f) => pick(f.stat), (f) => f.source.trains)

  const services: ServiceRow[] = found
    .map(({ source, stat }) => ({
      id: source.id,
      type: stat.type,
      journey: `${stripAsema(stat.fromName)} → ${stripAsema(stat.toName)}`,
      trains: source.trains,
      avg: stat.avg,
      onTime: stat.onTime,
      p90: stat.p90,
      cancelled: stat.cancelled,
    }))
    .sort((a, b) => b.trains - a.trains)

  // Per-stop delay along the route. Only passenger stops have saved rows (and names).
  const stops: StopPoint[] = path.stops
    .filter((code) => stationNames.has(code))
    .map((code) => {
      const rows = found.flatMap(({ stat }) => {
        const row = stat.stops.find((r) => r[0] === code)
        return row && row[2] !== null && row[1] > 0 ? [{ avg: row[2], trains: row[1] }] : []
      })
      const trains = rows.reduce((sum, r) => sum + r.trains, 0)
      const wx = found.flatMap(({ stat }) => {
        const row = stat.stops.find((r) => r[0] === code)
        return row && row[4] !== null && row[6] > 0 ? [{ temp: row[4], snow: row[5], n: row[6] }] : []
      })
      return {
        code,
        name: stationNames.get(code) ?? code,
        avg: weightedMean(rows, (r) => r.avg, (r) => r.trains),
        trains,
        temp: weightedMean(wx, (r) => r.temp, (r) => r.n),
        snow: weightedMean(wx, (r) => r.snow, (r) => r.n),
        weatherN: wx.reduce((sum, r) => sum + r.n, 0),
      }
    })

  return {
    trains: path.trains,
    avgLate: general((s) => s.avg),
    onTimePct: general((s) => s.onTime),
    minorPct: general((s) => s.minor),
    majorPct: general((s) => s.major),
    cancelledPct: general((s) => s.cancelled),
    services,
    stops,
    missingServices: path.sources.length - found.length,
    insights: stopInsights(stops),
    weather: {
      t: [0, 1, 2].map((band) => poolWeather(found.map((f) => f.stat.w?.t[band] ?? null))),
      s: [0, 1, 2].map((band) => poolWeather(found.map((f) => f.stat.w?.s[band] ?? null))),
    },
  }
}

/** Pool one band across services: weight by arrivals, which pools means and percentages
 *  exactly. Bands the build already suppressed (null) simply don't contribute. */
function poolWeather(cells: (WeatherCell | null)[]): WeatherRow | null {
  const real = cells.filter((c): c is WeatherCell => c !== null)
  const n = real.reduce((sum, c) => sum + c[0], 0)
  if (n === 0) return null
  return {
    n,
    avg: real.reduce((sum, c) => sum + c[1] * c[0], 0) / n,
    latePct: real.reduce((sum, c) => sum + c[2] * c[0], 0) / n,
  }
}

const min1 = (v: number) => `${v.toFixed(1)} min`

/** One or two plain-language sentences about where along the route delay shows up. */
function stopInsights(stops: StopPoint[]): string[] {
  const valued = stops.filter((s) => s.avg !== null) as (StopPoint & { avg: number })[]
  if (valued.length < 2) return []
  const out: string[] = []

  // Only compare neighbouring stops that both have data -- a jump across a gap of stops with no
  // figures would wrongly look like one big step.
  let bestJump: { from: StopPoint; to: StopPoint; by: number } | null = null
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1].avg
    const b = stops[i].avg
    if (a === null || b === null) continue
    const by = b - a
    if (!bestJump || by > bestJump.by) bestJump = { from: stops[i - 1], to: stops[i], by }
  }
  if (bestJump && bestJump.by >= 0.5) {
    out.push(`Delay grows most between ${bestJump.from.name} and ${bestJump.to.name} (+${min1(bestJump.by)}).`)
  }

  const latest = valued.reduce((a, b) => (b.avg > a.avg ? b : a))
  out.push(`Latest-running stop: ${latest.name}, ${min1(latest.avg)} late on average.`)
  return out
}

export interface StationInfo {
  name: string
  runs: number
  lat: number
  lon: number
}

const VIA_MIN_KM = 60

/**
 * Short plain-language name for a route: its two busiest stops that are well away from both ends
 * (so Helsinki's own suburbs don't win), kept in travel order -- "via Tampere, Seinäjoki" --
 * or "direct" when there are no stops in between.
 */
export function viaLabel(path: RoutePath, info: Map<string, StationInfo>): string {
  const interior = path.stops.slice(1, -1).filter((c) => info.has(c))
  if (interior.length === 0) return 'direct'
  const start = info.get(path.stops[0])
  const end = info.get(path.stops[path.stops.length - 1])
  const far = interior.filter((c) => {
    const here = info.get(c)!
    return !start || !end || (distanceKm(here, start) >= VIA_MIN_KM && distanceKm(here, end) >= VIA_MIN_KM)
  })
  const pool = far.length > 0 ? far : interior
  const top = [...pool].sort((a, b) => info.get(b)!.runs - info.get(a)!.runs).slice(0, 2)
  return `via ${interior.filter((c) => top.includes(c)).map((c) => info.get(c)!.name).join(', ')}`
}

/** A station's typical delay for the map badges. `own` = from this route's own trains; otherwise
 *  it is the station's usual delay across all long-distance trains that stop there. */
export interface StationValue {
  avg: number
  own: boolean
}

const stationAverageCache = new WeakMap<RouteStatsFile, Map<string, number>>()

/** Each station's average delay over every saved train service that has a figure for it. */
function stationAverages(stats: RouteStatsFile): Map<string, number> {
  const cached = stationAverageCache.get(stats)
  if (cached) return cached
  const sums = new Map<string, { sum: number; weight: number }>()
  for (const service of Object.values(stats)) {
    for (const [code, trains, avg] of service.stops) {
      if (avg === null || trains <= 0) continue
      const entry = sums.get(code) ?? { sum: 0, weight: 0 }
      entry.sum += avg * trains
      entry.weight += trains
      sums.set(code, entry)
    }
  }
  const result = new Map([...sums].map(([code, { sum, weight }]) => [code, sum / weight]))
  stationAverageCache.set(stats, result)
  return result
}

/**
 * The typical delay at each station of the highlighted routes, for the map badges. A station on
 * several routes gets one value: the mean of its per-route values weighted by the trains at the
 * stop (the same weighting the pop-up chart uses). The saved per-stop figures only cover each
 * service's usual stops, so a less common variation of a route can have stops with no figure for
 * its own trains; those fall back to the station's usual delay across all trains (`own: false`).
 */
export function routeStationValues(
  paths: RoutePath[],
  stats: RouteStatsFile,
  stationNames: Map<string, string>,
): Map<string, StationValue> {
  const sums = new Map<string, { sum: number; weight: number }>()
  const onRoute = new Set<string>()
  for (const path of paths) {
    for (const stop of summarizeRoute(path, stats, stationNames).stops) {
      onRoute.add(stop.code)
      if (stop.avg === null || stop.trains <= 0) continue
      const entry = sums.get(stop.code) ?? { sum: 0, weight: 0 }
      entry.sum += stop.avg * stop.trains
      entry.weight += stop.trains
      sums.set(stop.code, entry)
    }
  }
  const values = new Map<string, StationValue>(
    [...sums].map(([code, { sum, weight }]) => [code, { avg: sum / weight, own: true }]),
  )
  const fallback = stationAverages(stats)
  for (const code of onRoute) {
    const avg = fallback.get(code)
    if (!values.has(code) && avg !== undefined) values.set(code, { avg, own: false })
  }
  return values
}

/**
 * One weather pin per distinct weather station serving the highlighted route's passenger stops.
 * The numbers are the mean temperature and snow depth when *this route's own* trains were at the
 * stops the station serves (pooled across stops by number of readings), like the per-route delay
 * badges. Where the route's trains have no figure the station's January average is used instead
 * (`own: false`). `names` maps station code to display name; `start`/`end` are the route ends.
 */
export function routeWeatherPins(
  paths: RoutePath[],
  stats: RouteStatsFile,
  stations: StationFeature[],
  names: Map<string, string>,
  emsWeather: EmsWeatherFile | null,
  start: string,
  end: string,
): WeatherPin[] {
  const byCode = new Map(stations.map((s) => [s.code, s]))
  // Pool each stop across the route's paths (they share stops), weighted by readings.
  const stop = new Map<string, { tempSum: number; snowSum: number; snowN: number; n: number }>()
  const onRoute = new Set<string>()
  for (const path of paths) {
    for (const p of summarizeRoute(path, stats, names).stops) {
      onRoute.add(p.code)
      if (p.temp === null || p.weatherN <= 0) continue
      const e = stop.get(p.code) ?? { tempSum: 0, snowSum: 0, snowN: 0, n: 0 }
      e.tempSum += p.temp * p.weatherN
      e.n += p.weatherN
      if (p.snow !== null) {
        e.snowSum += p.snow * p.weatherN
        e.snowN += p.weatherN
      }
      stop.set(p.code, e)
    }
  }

  type Group = { station: StationFeature; codes: string[]; tempSum: number; n: number; snowSum: number; snowN: number }
  const groups = new Map<string, Group>()
  for (const code of onRoute) {
    const station = byCode.get(code)
    if (!station?.ems) continue
    const g = groups.get(station.ems.name) ?? { station, codes: [], tempSum: 0, n: 0, snowSum: 0, snowN: 0 }
    g.codes.push(code)
    // One serving station labels the pop-up ("4 km from Ähtäri"): a route end if the weather
    // station serves one (so Rovaniemi's reads "from Rovaniemi"), otherwise the nearest.
    const isEnd = (c: string) => c === start || c === end
    if (!isEnd(g.station.code) && (isEnd(code) || station.ems.km < g.station.ems!.km)) g.station = station
    const e = stop.get(code)
    if (e) {
      g.tempSum += e.tempSum
      g.n += e.n
      g.snowSum += e.snowSum
      g.snowN += e.snowN
    }
    groups.set(station.ems.name, g)
  }

  return [...groups.entries()].map(([name, g]) => {
    const own = g.n > 0
    const january = emsWeather?.stations[name]
    return {
      key: name,
      ems: g.station.ems!,
      scope: 'route' as const,
      stationNames: [g.station.code, ...g.codes.filter((c) => c !== g.station.code)].map((c) => names.get(c) ?? c),
      stationCodes: g.codes,
      temp: own ? g.tempSum / g.n : january?.temp.avg ?? null,
      snow: own ? (g.snowN > 0 ? g.snowSum / g.snowN : null) : january?.snow.avg ?? null,
      own,
      isEnd: g.codes.includes(start) || g.codes.includes(end),
    }
  })
}
