/**
 * Presentation mode: a looping helicopter flight over Finland. Pure (no map imports), like
 * lib/liveTrain.ts; Map.tsx runs the animation frame loop and sets the camera from `cameraAt`.
 */

export interface Camera {
  lon: number
  lat: number
  zoom: number
  pitch: number
  /** Degrees; 0 = north up. May be outside -180..180 while blending. */
  bearing: number
}

/** All the tunables in one place, like `LIVE` in liveTrain.ts. */
export const PRESENT = {
  /** Seconds from one keyframe to the next: the whole loop is TOUR.length x this (~104 s). */
  segmentSeconds: 13,
  /** Seconds to ease from wherever the camera is now onto the tour when it starts. */
  blendSeconds: 2.5,
  // After one tour the show picks a random route, holds it, plays the journey, then holds the arrived
  // route before the next tour (see the phases in App.tsx).
  routeHoldSeconds: 3.5,
  arrivedHoldSeconds: 3.5,
  // Station names that appear while it flies: each fades in, stays, fades out (same navy tag as the
  // station name in Play the journey). Up to `maxLabels` at once, drawn from the `poolSize` most
  // important stations that are on screen, at least `minSeparationPx` apart.
  labelFadeInSeconds: 0.4,
  labelHoldSeconds: 3.4,
  labelFadeOutSeconds: 0.7,
  maxLabels: 3,
  spawnEverySeconds: 1.5,
  minSeparationPx: 180,
  poolSize: 24,
  // The map's own limits (see mapStyle / Map.tsx constructor); the flight stays inside them.
  minZoom: 3.5,
  maxZoom: 9,
  maxPitch: 70,
} as const

/**
 * The flight, keyframe by keyframe (looping back from the last to the first). The bearing is the
 * direction the camera faces, and it swings left and right (about -25 to +150) while always looking
 * toward land: facing out over the Baltic or Russia would leave the middle of the screen empty, and
 * Finland is already drawn right of the statistics column (map padding), so these are plain places,
 * not offset values. The zoom dives in over a place and pulls back out; the tilt rises and falls.
 */
export const TOUR: readonly Camera[] = [
  { lon: 25.3, lat: 62.6, zoom: 6.25, pitch: 62, bearing: 5 }, // all of Finland filling the free area (the first view: no empty side)
  { lon: 25.0, lat: 60.9, zoom: 7.2, pitch: 64, bearing: 35 }, // the Helsinki coast, looking north-east over land
  { lon: 23.9, lat: 61.7, zoom: 6.9, pitch: 62, bearing: -25 }, // Tampere, swinging left
  { lon: 28.3, lat: 62.7, zoom: 6.8, pitch: 64, bearing: 30 }, // the eastern lakes (Kuopio, Joensuu)
  { lon: 25.6, lat: 64.9, zoom: 7.2, pitch: 66, bearing: 70 }, // the Oulu coast
  { lon: 26.2, lat: 66.5, zoom: 6.5, pitch: 68, bearing: 150 }, // Lapland, looking south down the country
  { lon: 26.5, lat: 64.0, zoom: 5.9, pitch: 60, bearing: 80 }, // pulling back
  { lon: 25.0, lat: 63.0, zoom: 6.0, pitch: 60, bearing: 25 }, // wide again, swinging back
]

/** One component of a periodic Catmull-Rom spline through p1 -> p2 (p0, p3 are the neighbours). */
function catmullRom(p0: number, p1: number, p2: number, p3: number, u: number): number {
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * u +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u +
    (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u
  )
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Where the camera is `seconds` into the flight. A periodic spline through TOUR, so the motion is
 * smooth (no jumps, and none at the loop point) and passes through every keyframe.
 */
export function cameraAt(seconds: number, tour: readonly Camera[] = TOUR): Camera {
  const n = tour.length
  const pos = ((seconds / PRESENT.segmentSeconds) % n + n) % n
  const i = Math.floor(pos)
  const u = pos - i
  const p = (k: number) => tour[(((i + k) % n) + n) % n]
  const at = (pick: (c: Camera) => number) => catmullRom(pick(p(-1)), pick(p(0)), pick(p(1)), pick(p(2)), u)
  return {
    lon: at((c) => c.lon),
    lat: at((c) => c.lat),
    zoom: clamp(at((c) => c.zoom), PRESENT.minZoom, PRESENT.maxZoom),
    pitch: clamp(at((c) => c.pitch), 0, PRESENT.maxPitch),
    bearing: at((c) => c.bearing),
  }
}

const smoothstep = (k: number) => {
  const t = clamp(k, 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Eases from `from` (the camera when the flight started) onto `to` (the flight's current frame),
 * so starting from any view needs no jump and no separate fly-in. `seconds` = time since the start;
 * once it passes PRESENT.blendSeconds this is just `to`. The bearing takes the short way round.
 */
export function blendIn(from: Camera, to: Camera, seconds: number): Camera {
  const s = smoothstep(seconds / PRESENT.blendSeconds)
  if (s >= 1) return to
  const turn = ((to.bearing - from.bearing + 540) % 360) - 180
  return {
    lon: from.lon + (to.lon - from.lon) * s,
    lat: from.lat + (to.lat - from.lat) * s,
    zoom: from.zoom + (to.zoom - from.zoom) * s,
    pitch: from.pitch + (to.pitch - from.pitch) * s,
    bearing: from.bearing + turn * s,
  }
}

/** Seconds a name stays from first appearing to being gone. */
export const LABEL_LIFE_SECONDS = PRESENT.labelFadeInSeconds + PRESENT.labelHoldSeconds + PRESENT.labelFadeOutSeconds

/** Opacity (0-1) of a name `age` seconds after it appeared: fades in, holds, fades out. */
export function labelAlpha(age: number): number {
  const into = clamp(age / PRESENT.labelFadeInSeconds, 0, 1)
  const out = clamp((age - PRESENT.labelFadeInSeconds - PRESENT.labelHoldSeconds) / PRESENT.labelFadeOutSeconds, 0, 1)
  return into * (1 - out)
}

/** One full tour, in seconds: after this the show moves on to its random route. */
export const TOUR_SECONDS = TOUR.length * PRESENT.segmentSeconds
