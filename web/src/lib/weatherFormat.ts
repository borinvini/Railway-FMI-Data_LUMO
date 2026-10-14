/** Number formats shared by the weather pins on the map and the pop-up text. */

/** "−3°" with a real minus sign; no "-0"; "–" when there is no figure. */
export function formatTemp(t: number | null): string {
  if (t === null) return '–'
  const r = Math.round(t)
  return `${r < 0 ? '\u2212' : ''}${Math.abs(r)}°`
}

/** "12 cm"; "0 cm" for no snow; empty when there is no figure. */
export function formatSnow(s: number | null): string {
  return s === null ? '' : `${Math.round(s)} cm`
}
