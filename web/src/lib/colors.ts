/** Icy-blue accent used for the network's connection lines' glow -- same accent as country/motorway
 *  labels and the Finland outline. See CLAUDE.md "Map style" palette. */
export const NETWORK_LINE_COLOR: [number, number, number] = [0x9c, 0xc3, 0xe8]

/** Near-white snow for the crisp line core, so it reads as a bright glowing thread
 *  against the glow underneath it rather than blending into the same tone. */
export const NETWORK_LINE_CORE_COLOR: [number, number, number] = [0xea, 0xf3, 0xfc]

/** Delay colour ramp: snow white (on time, echoing the flag's white) -> amber -> crimson (8+ min
 *  late). Lightness falls steadily so it survives colour-blindness. Chosen to fit the Finnish-flag
 *  "Nordic night" theme. See CLAUDE.md "Map style". */
export const DELAY_RAMP_HEX = ['#f1f6fb', '#ffb340', '#e8344e'] as const

const DELAY_STOPS: [number, number, number][] = DELAY_RAMP_HEX.map((hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
])

/** Average delay in minutes -> deck.gl RGBA colour, clamped to the 0-8 min ramp. */
export function delayColor(avgDelayMin: number, alpha = 255): [number, number, number, number] {
  const t = Math.max(0, Math.min(1, avgDelayMin / 8)) * 2
  const i = Math.min(1, Math.floor(t))
  const f = t - i
  const [r, g, b] = DELAY_STOPS[i].map((v, k) => Math.round(v + (DELAY_STOPS[i + 1][k] - v) * f))
  return [r, g, b, alpha]
}
