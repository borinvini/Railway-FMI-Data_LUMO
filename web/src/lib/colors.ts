/** Gold accent used for the network's connection lines' glow -- same accent as country/motorway
 *  labels and the Finland outline. See CLAUDE.md "Map style" palette. */
export const NETWORK_LINE_COLOR: [number, number, number] = [0xe5, 0xc1, 0x63]

/** Lighter, hotter gold for the crisp line core, so it reads as a bright glowing thread
 *  against the glow underneath it rather than blending into the same tone. */
export const NETWORK_LINE_CORE_COLOR: [number, number, number] = [0xfd, 0xe4, 0xa8]

/** Delay colour ramp: vivid green (on time) -> violet -> hot pink (8+ min late). Chosen to sit
 *  apart from the gold routes/basemap accent rather than passing through amber, which read as
 *  nearly the same colour as the gold network; pushed to more saturated stops than an earlier
 *  emerald/indigo/magenta pass, which read as too muted against the map. See CLAUDE.md "Map style". */
const DELAY_STOPS: [number, number, number][] = [
  [0x00, 0xe6, 0x76],
  [0xa8, 0x55, 0xf7],
  [0xff, 0x2d, 0x78],
]

/** Average delay in minutes -> deck.gl RGBA colour, clamped to the 0-8 min ramp. */
export function delayColor(avgDelayMin: number, alpha = 255): [number, number, number, number] {
  const t = Math.max(0, Math.min(1, avgDelayMin / 8)) * 2
  const i = Math.min(1, Math.floor(t))
  const f = t - i
  const [r, g, b] = DELAY_STOPS[i].map((v, k) => Math.round(v + (DELAY_STOPS[i + 1][k] - v) * f))
  return [r, g, b, alpha]
}
