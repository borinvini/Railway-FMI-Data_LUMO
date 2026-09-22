/** Light magenta used for the network's connection lines' glow. Replaces the original gold
 *  accent (which matched the basemap's country/motorway-label gold) by request. */
export const NETWORK_LINE_COLOR: [number, number, number] = [0xe8, 0x79, 0xf9]

/** Paler, hotter magenta for the crisp line core, so it reads as a bright glowing thread
 *  against the glow underneath it rather than blending into the same tone. */
export const NETWORK_LINE_CORE_COLOR: [number, number, number] = [0xfb, 0xcf, 0xe8]

/** Delay colour ramp: teal (on time) -> amber -> rose (8+ min late), i.e. green/yellow/red. The
 *  original ramp -- restored by request after several multi-hue and mono-hue alternatives.
 *  See CLAUDE.md "Map style". */
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
