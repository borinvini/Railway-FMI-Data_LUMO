/**
 * The temperature and snow-depth profile along a Live route, for the chart that draws itself as
 * the train runs. Pure: the points are the route's passenger stops (distance from the start, mean
 * temperature and snow depth of the route's own trains there), and `profileUpTo` returns what to
 * draw for a given distance: every stop already passed plus an interpolated head at the train.
 * These are January averages at each stop, met in the order the train meets them -- not readings.
 */

export interface ProfilePoint {
  x: number
  y: number
}

export interface LiveProfile {
  /** Distance from the start at each stop, km (monotonic). */
  km: number[]
  /** Mean air temperature at each stop, °C (null = no figure). */
  temp: (number | null)[]
  /** Mean snow depth at each stop, cm (null = no figure). */
  snow: (number | null)[]
  totalKm: number
  startName: string
  endName: string
  /** Fixed axis ranges, from the whole route (so the chart never rescales while it fills in). */
  tempMin: number
  tempMax: number
  snowMax: number
  /** Tick spacing for the two axes (1, 2, 2.5, 5, 10 ... times a power of ten), so the labels are round. */
  tempStep: number
  snowStep: number
}

/** The smallest "nice" step (1, 2, 2.5, 5 or 10 times a power of ten) giving at most `ticks` intervals. */
function niceStep(span: number, ticks: number): number {
  const raw = Math.max(span, 1e-9) / ticks
  const mag = 10 ** Math.floor(Math.log10(raw))
  return ([1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw) ?? 10 * mag)
}

/** A flat route must still read as flat: the axes never zoom in tighter than this. */
const MIN_TEMP_SPAN = 4
const MIN_SNOW_MAX = 10

export interface ProfileStop {
  code: string
  name: string
  km: number
}

export function buildLiveProfile(
  stops: ProfileStop[],
  totalKm: number,
  values: Map<string, { temp: number | null; snow: number | null }>,
): LiveProfile | null {
  const km: number[] = []
  const temp: (number | null)[] = []
  const snow: (number | null)[] = []
  for (const s of stops) {
    const v = values.get(s.code)
    if (!v || (v.temp === null && v.snow === null)) continue
    km.push(s.km)
    temp.push(v.temp)
    snow.push(v.snow)
  }
  if (km.length < 2 || totalKm <= 0) return null

  const t = temp.filter((v): v is number => v !== null)
  const sn = snow.filter((v): v is number => v !== null)
  let lo = t.length ? Math.min(...t) : 0
  let hi = t.length ? Math.max(...t) : MIN_TEMP_SPAN
  const pad = 0.6
  lo -= pad
  hi += pad
  if (hi - lo < MIN_TEMP_SPAN) {
    const mid = (hi + lo) / 2
    lo = mid - MIN_TEMP_SPAN / 2
    hi = mid + MIN_TEMP_SPAN / 2
  }
  const tempStep = niceStep(hi - lo, 4)
  const snowTop = Math.max(MIN_SNOW_MAX, (sn.length ? Math.max(...sn) : 0) * 1.05)
  const snowStep = niceStep(snowTop, 3)
  return {
    km, temp, snow, totalKm,
    startName: stops[0]?.name ?? '',
    endName: stops[stops.length - 1]?.name ?? '',
    tempMin: Math.floor(lo / tempStep) * tempStep,
    tempMax: Math.ceil(hi / tempStep) * tempStep,
    tempStep,
    snowMax: Math.ceil(snowTop / snowStep) * snowStep,
    snowStep,
  }
}

export interface DelayProfile {
  /** Distance from the start at each stop that has a figure, km. */
  km: number[]
  /** Monthly average delay at each of those stops, minutes (early = 0). */
  delay: number[]
  totalKm: number
  startName: string
  endName: string
  /** Fixed y range 0..max and tick spacing. */
  max: number
  step: number
}

/** The route's delay at each passenger stop (the same figures as the delay badges). */
export function buildDelayProfile(stops: ProfileStop[], totalKm: number, values: Map<string, number | null>): DelayProfile | null {
  const km: number[] = []
  const delay: number[] = []
  for (const s of stops) {
    const v = values.get(s.code)
    if (v === null || v === undefined) continue
    km.push(s.km)
    delay.push(Math.max(0, v))
  }
  if (km.length < 1 || totalKm <= 0) return null
  // 8 min is the top of the delay colour ramp used elsewhere; never zoom in tighter than that.
  const top = Math.max(8, Math.max(...delay) * 1.1)
  const step = niceStep(top, 4)
  return {
    km, delay, totalKm,
    startName: stops[0]?.name ?? '',
    endName: stops[stops.length - 1]?.name ?? '',
    max: Math.ceil(top / step) * step,
    step,
  }
}

/** The delay line `km` kilometres into the trip: the stops already reached, then a head at the train
 *  (interpolated between the stops either side, flat past the ends). */
export function delayUpTo(p: DelayProfile, km: number): ProfilePoint[] {
  const out: ProfilePoint[] = []
  for (let i = 0; i < p.km.length; i++) {
    if (p.km[i] > km) break
    out.push({ x: p.km[i], y: p.delay[i] })
  }
  const head = valueAt(p.km, p.delay, km)
  if (head !== null) out.push({ x: km, y: head })
  return out
}

/** Value of one series at `km`: linear between the nearest figures either side, flat past the ends. */
function valueAt(km: number[], series: (number | null)[], at: number): number | null {
  let before = -1
  let after = -1
  for (let i = 0; i < km.length; i++) {
    if (series[i] === null) continue
    if (km[i] <= at) before = i
    if (km[i] >= at && after === -1) after = i
  }
  if (before === -1 && after === -1) return null
  if (before === -1) return series[after]
  if (after === -1) return series[before]
  if (before === after || km[after] === km[before]) return series[before]
  const f = (at - km[before]) / (km[after] - km[before])
  return (series[before] as number) + ((series[after] as number) - (series[before] as number)) * f
}

export function profileAt(p: LiveProfile, km: number): { temp: number | null; snow: number | null } {
  return { temp: valueAt(p.km, p.temp, km), snow: valueAt(p.km, p.snow, km) }
}

/** The points to draw `km` kilometres into the trip: stops already passed, then the head. */
export function profileUpTo(p: LiveProfile, km: number): { temp: ProfilePoint[]; snow: ProfilePoint[] } {
  const temp: ProfilePoint[] = []
  const snow: ProfilePoint[] = []
  for (let i = 0; i < p.km.length; i++) {
    if (p.km[i] > km) break
    if (p.temp[i] !== null) temp.push({ x: p.km[i], y: p.temp[i] as number })
    if (p.snow[i] !== null) snow.push({ x: p.km[i], y: p.snow[i] as number })
  }
  const head = profileAt(p, km)
  if (head.temp !== null) temp.push({ x: km, y: head.temp })
  if (head.snow !== null) snow.push({ x: km, y: head.snow })
  return { temp, snow }
}
