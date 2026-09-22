/** Gold accent used for the network's connection lines' glow -- same accent as country/motorway
 *  labels and the Finland outline. See CLAUDE.md "Map style" palette. */
export const NETWORK_LINE_COLOR: [number, number, number] = [0xe5, 0xc1, 0x63]

/** Lighter, hotter gold for the crisp line core, so it reads as a bright glowing thread
 *  against the glow underneath it rather than blending into the same tone. */
export const NETWORK_LINE_CORE_COLOR: [number, number, number] = [0xfd, 0xe4, 0xa8]

/** Delay colour ramp: teal (on time) -> amber -> rose (8+ min late). See CLAUDE.md "Map style". */
const DELAY_STOPS: [number, number, number][] = [
  [0x5e, 0xea, 0xd4],
  [0xfb, 0xbf, 0x24],
  [0xf4, 0x3f, 0x5e],
]

/** Average delay in minutes -> deck.gl RGBA colour, clamped to the 0-8 min ramp. */
export function delayColor(avgDelayMin: number, alpha = 255): [number, number, number, number] {
  const t = Math.max(0, Math.min(1, avgDelayMin / 8)) * 2
  const i = Math.min(1, Math.floor(t))
  const f = t - i
  const [r, g, b] = DELAY_STOPS[i].map((v, k) => Math.round(v + (DELAY_STOPS[i + 1][k] - v) * f))
  return [r, g, b, alpha]
}
