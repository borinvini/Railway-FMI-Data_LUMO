/**
 * "Live": a train rides a route from its first station to its last. This file is the pure part (no
 * map, no React): the route geometry, the timeline (cruise + a short stop at every passenger
 * station) and `sample(timeline, t)`. Map.tsx runs the animation loop and draws what `sample`
 * returns. It is a time-lapse of a *typical* trip, not the timetable and not real time.
 */

/** Everything worth tuning lives here. */
export const LIVE = {
  /** Cruising: the moving part of the trip takes distance / cruiseKmPerSecond seconds ... */
  cruiseKmPerSecond: 20,
  /** ... but never less than this, so a short hop is still watchable, nor more than this. */
  minMoveSeconds: 12,
  maxMoveSeconds: 45,
  /** The train waits this long at every passenger station so its values can land. */
  dwellSeconds: 0.9,
  /** The whole trip (moving + stops) is kept under this by shortening the stops. */
  maxTotalSeconds: 70,
  /** Camera. */
  followZoom: 8.5,
  followLerp: 0.15,
  /** If the train is further than this from the camera centre (px), jump straight to it. */
  snapPx: 450,
  /** The station name beside the train: fade in on arrival, stay a moment after leaving, fade out. */
  nameFadeInSeconds: 0.22,
  nameLingerSeconds: 0.7,
  nameFadeOutSeconds: 0.5,
  flyInMs: 1600,
  fitMs: 1800,
} as const

export interface LiveStop {
  code: string
  name: string
  lon: number
  lat: number
  /** A passenger station: the train stops here and its values appear. Waypoints are passed. */
  passenger: boolean
  /** Distance from the start along the route, km. */
  km: number
}

export interface LiveRoute {
  stops: LiveStop[]
  totalKm: number
}

export interface LiveTimeline {
  route: LiveRoute
  /** Seconds the whole run takes (the train sits at the last station until then). */
  seconds: number
  /** Indices (into route.stops) of the passenger stops, in order. */
  passengerIndexes: number[]
  /** Time the train arrives at each passenger stop, seconds from the start. */
  arriveAt: number[]
  /** Time it leaves each passenger stop. */
  departAt: number[]
}

export interface LiveSample {
  lon: number
  lat: number
  /** Distance along the route, km. */
  km: number
  /** 0-1 of the distance. */
  progress: number
  /** How many passenger stops have been reached so far (arrived at). */
  reached: number
  /** Index into `passengerIndexes` of the stop the train is at or last left; -1 before the start. */
  at: number
  /** True while the train is waiting at a passenger station. */
  dwelling: boolean
  done: boolean
}

function haversineKm(aLon: number, aLat: number, bLon: number, bLat: number): number {
  const rad = Math.PI / 180
  const dLat = (bLat - aLat) * rad
  const dLon = (bLon - aLon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/**
 * The route as an ordered list of stops with coordinates and cumulative distance. A stop with no
 * known coordinates is skipped (the line bridges over it, like the highlighted route does).
 * `names` has an entry for every passenger station (the others are waypoints).
 */
export function buildLiveRoute(codes: string[], coords: Map<string, [number, number]>, names: Map<string, string>): LiveRoute {
  const stops: LiveStop[] = []
  let km = 0
  for (const code of codes) {
    const c = coords.get(code)
    if (!c) continue
    const prev = stops[stops.length - 1]
    if (prev) km += haversineKm(prev.lon, prev.lat, c[0], c[1])
    stops.push({ code, name: names.get(code) ?? code, lon: c[0], lat: c[1], passenger: names.has(code), km })
  }
  // The ends always count as stops, even if the name lookup somehow missed one.
  if (stops.length > 0) {
    stops[0].passenger = true
    stops[stops.length - 1].passenger = true
  }
  return { stops, totalKm: km }
}

export function buildTimeline(route: LiveRoute): LiveTimeline {
  const passengerIndexes = route.stops.flatMap((s, i) => (s.passenger ? [i] : []))
  const n = passengerIndexes.length
  const moveSeconds = Math.min(LIVE.maxMoveSeconds, Math.max(LIVE.minMoveSeconds, route.totalKm / LIVE.cruiseKmPerSecond))
  // Shorten the stops (down to a floor) if the whole trip would run past the cap.
  const dwell = Math.max(0.35, Math.min(LIVE.dwellSeconds, (LIVE.maxTotalSeconds - moveSeconds) / Math.max(n, 1)))
  const secondsPerKm = route.totalKm > 0 ? moveSeconds / route.totalKm : 0

  const arriveAt: number[] = []
  const departAt: number[] = []
  let t = 0
  for (let k = 0; k < n; k++) {
    const km = route.stops[passengerIndexes[k]].km
    // Time spent moving up to this stop plus the dwells at the stops before it.
    t = km * secondsPerKm + k * dwell
    arriveAt.push(t)
    departAt.push(t + dwell)
  }
  return { route, seconds: (arriveAt[n - 1] ?? 0) + 0.6, passengerIndexes, arriveAt, departAt }
}

/** Distance (km) covered `t` seconds in, honouring the dwells. */
function kmAt(tl: LiveTimeline, t: number): number {
  const { route, passengerIndexes, arriveAt, departAt } = tl
  const n = passengerIndexes.length
  if (n === 0 || t <= 0) return 0
  for (let k = 0; k < n; k++) {
    const stopKm = route.stops[passengerIndexes[k]].km
    if (t < arriveAt[k]) {
      // Moving between the previous stop (or the start) and stop k.
      const fromKm = k === 0 ? 0 : route.stops[passengerIndexes[k - 1]].km
      const fromT = k === 0 ? 0 : departAt[k - 1]
      const span = arriveAt[k] - fromT
      return span <= 0 ? stopKm : fromKm + ((stopKm - fromKm) * (t - fromT)) / span
    }
    if (t < departAt[k]) return stopKm // waiting at stop k
  }
  return route.totalKm
}

/** Position by distance along the polyline (binary search on the cumulative km). */
function pointAtKm(route: LiveRoute, km: number): [number, number] {
  const s = route.stops
  if (km <= 0) return [s[0].lon, s[0].lat]
  if (km >= route.totalKm) return [s[s.length - 1].lon, s[s.length - 1].lat]
  let lo = 0
  let hi = s.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (s[mid].km <= km) lo = mid
    else hi = mid
  }
  const span = s[hi].km - s[lo].km
  const f = span <= 0 ? 0 : (km - s[lo].km) / span
  return [s[lo].lon + (s[hi].lon - s[lo].lon) * f, s[lo].lat + (s[hi].lat - s[lo].lat) * f]
}

export function sample(tl: LiveTimeline, t: number): LiveSample {
  const { route, passengerIndexes, arriveAt, departAt } = tl
  const km = kmAt(tl, t)
  const [lon, lat] = pointAtKm(route, km)
  let reached = 0
  let at = -1
  let dwelling = false
  for (let k = 0; k < passengerIndexes.length; k++) {
    if (t >= arriveAt[k]) {
      reached = k + 1
      at = k
      dwelling = t < departAt[k]
    }
  }
  return {
    lon, lat, km,
    progress: route.totalKm > 0 ? Math.min(1, km / route.totalKm) : 1,
    reached, at, dwelling,
    done: t >= tl.seconds,
  }
}

/** The part of the route already travelled, ending exactly at the train. */
export function trailPath(route: LiveRoute, km: number): [number, number][] {
  const out: [number, number][] = []
  for (const s of route.stops) {
    if (s.km >= km) break
    out.push([s.lon, s.lat])
  }
  out.push(pointAtKm(route, km))
  return out
}

/** Codes of the passenger stations reached so far. */
export function reachedCodes(tl: LiveTimeline, reached: number): Set<string> {
  return new Set(tl.passengerIndexes.slice(0, reached).map((i) => tl.route.stops[i].code))
}
