import type { PredictorStation, PredictorWeatherMonth, SliderRange } from './types'

/** The visitor's weather; null = the real weather the trains had. */
export interface PickedWeather {
  temp: number
  snow: number
}

const logit = (p: number) => {
  const q = Math.min(Math.max(p, 1e-6), 1 - 1e-6)
  return Math.log(q / (1 - q))
}
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

export const rangeValues = ([first, step, n]: SliderRange) => Array.from({ length: n }, (_, i) => first + i * step)

/** Shift of the logit for the picked weather in that month (0 for the real weather). */
export function weatherShift(w: PredictorWeatherMonth | undefined, picked: PickedWeather | null): number {
  if (!w || !picked) return 0
  const ti = Math.round((picked.temp - w.temps[0]) / w.temps[1])
  const si = Math.round((picked.snow - w.snows[0]) / w.snows[1])
  const row = w.d[Math.min(Math.max(ti, 0), w.temps[2] - 1)]
  return row[Math.min(Math.max(si, 0), w.snows[2] - 1)] / 100
}

/** A chance in percent moved by a logit shift. */
export function shifted(chancePct: number, shift: number): number {
  return shift === 0 ? chancePct : 100 * sigmoid(logit(chancePct / 100) + shift)
}

/** Stations with a trained model (scripts/build_predictor.py `BEST`), known before the file loads
 *  so the station panel can offer the button straight away. */
export const PREDICTOR_CODES = new Set(['HKI', 'PSL', 'TPE', 'SK', 'YV', 'OL', 'ROI'])

export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Chance of a disruption in percent. month 1-12, day Mon = 0 .. Sun = 6, slot index of the day. */
export function chanceAt(st: PredictorStation, month: number, day: number, slot: number): number {
  return st.p[month - 1][day][slot] / 10
}

/** True when few real trains ran then, so the answer is a rough guess. */
export function fewAt(st: PredictorStation, month: number, day: number, slot: number): boolean {
  return st.few[month - 1][day][slot] === 1
}

/** "08:30" for a slot index. */
export function slotLabel(slot: number, stepMinutes: number): string {
  const m = slot * stepMinutes
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** The visitor's current month, day and time slot (rounded down), as the pop-up's starting point. */
export function nowPick(stepMinutes: number, date = new Date()) {
  return {
    month: date.getMonth() + 1,
    day: (date.getDay() + 6) % 7,
    slot: Math.floor((date.getHours() * 60 + date.getMinutes()) / stepMinutes),
  }
}

/** Plain words for the difference against the station's usual share. */
export function changeWords(chance: number, usual: number): string {
  const d = Math.round(chance - usual)
  if (d === 0) return `About the same as usual here (${Math.round(usual)}%)`
  return `${Math.abs(d)} ${Math.abs(d) === 1 ? 'point' : 'points'} ${d > 0 ? 'higher' : 'lower'} than usual here (${Math.round(usual)}%)`
}
