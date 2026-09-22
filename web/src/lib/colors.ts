/** Gold accent used for the network's connection lines' glow -- same accent as country/motorway
 *  labels and the Finland outline. See CLAUDE.md "Map style" palette. */
export const NETWORK_LINE_COLOR: [number, number, number] = [0xe5, 0xc1, 0x63]

/** Lighter, hotter gold for the crisp line core, so it reads as a bright glowing thread
 *  against the glow underneath it rather than blending into the same tone. */
export const NETWORK_LINE_CORE_COLOR: [number, number, number] = [0xfd, 0xe4, 0xa8]

/** Delay colour ramp: a single-hue magenta, orchid pink (on time) -> fuchsia (8+ min late).
 *  Mono-hue by request -- earlier multi-hue passes (teal/amber/rose, then emerald/indigo/
 *  magenta, then green/violet/hot-pink) all sat too close to the gold routes/basemap accent or
 *  read as a hue jump the user didn't want. See CLAUDE.md "Map style". */
const DELAY_STOPS: [number, number, number][] = [
  [0xf5, 0xd0, 0xfe],
  [0xe8, 0x79, 0xf9],
  [0xc0, 0x26, 0xd3],
]

/** Average delay in minutes -> deck.gl RGBA colour, clamped to the 0-8 min ramp. */
export function delayColor(avgDelayMin: number, alpha = 255): [number, number, number, number] {
  const t = Math.max(0, Math.min(1, avgDelayMin / 8)) * 2
  const i = Math.min(1, Math.floor(t))
  const f = t - i
  const [r, g, b] = DELAY_STOPS[i].map((v, k) => Math.round(v + (DELAY_STOPS[i + 1][k] - v) * f))
  return [r, g, b, alpha]
}
