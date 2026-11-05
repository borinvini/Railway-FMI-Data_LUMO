/**
 * The distance the Live train has covered, published every animation frame and read by the weather
 * chart. A tiny module-level pub-sub on purpose: going through React state would re-render the
 * whole app sixty times a second just to move a line.
 */
type Listener = (km: number) => void

const listeners = new Set<Listener>()
let current = 0

export function setLiveKm(km: number): void {
  current = km
  // Called from the map's animation loop and its effect cleanup: a chart that fails to draw must not
  // take the map (and with it the whole page) down.
  listeners.forEach((fn) => {
    try { fn(km) } catch (e) { console.error(e) }
  })
}

/** Subscribe (called once at once with the current value); returns the unsubscribe function. */
export function subscribeLiveKm(fn: Listener): () => void {
  listeners.add(fn)
  fn(current)
  return () => {
    listeners.delete(fn)
  }
}

/** The latest distance, for code that draws on demand (the chart cursor). */
export function getLiveKm(): number {
  return current
}

/** For tests: how many charts are listening. */
export function liveKmSubscribers(): number {
  return listeners.size
}
