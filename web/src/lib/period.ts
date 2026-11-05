import type { Fmt } from '../i18n/format'

/** The picked period: every year, one year, or one calendar month pooled over every year. Every
 *  number and colour on the page follows it. */
export type Period = { kind: 'all' } | { kind: 'year'; year: number } | { kind: 'month'; month: number /* 1-12 */ }

export const ALL: Period = { kind: 'all' }

/** File/cache key of a period: "all", the year ("2021") or the month ("m01"), as in data/scope/. */
export function scopeOf(p: Period): string {
  if (p.kind === 'year') return String(p.year)
  if (p.kind === 'month') return `m${String(p.month).padStart(2, '0')}`
  return 'all'
}

export const samePeriod = (a: Period, b: Period): boolean => scopeOf(a) === scopeOf(b)

/** Indexes of the "YYYY-MM" months a period file key covers: everything for "all", one year's
 *  months for "2021", that calendar month of every year for "m01". */
export function monthsOfScope(months: string[], scope: string): number[] {
  const out: number[] = []
  const month = /^m\d\d$/.test(scope) ? scope.slice(1) : null
  months.forEach((m, i) => {
    if (scope === 'all' || (month !== null ? m.slice(5, 7) === month : m.startsWith(scope))) out.push(i)
  })
  return out
}

/** The period Presentation mode runs in: a picked year stays, a picked month goes back to By year /
 *  All years (the spec: Presentation start resets the mode to By year). */
export const presentationPeriod = (p: Period): Period => (p.kind === 'month' ? ALL : p)

const span = (years: number[]) => (years.length === 1 ? String(years[0]) : `${years[0]}–${years[years.length - 1]}`)

/** Label for the period on screen: "2018–2025" for everything, "2021" for one year, "January,
 *  2018–2025" for a month; null before summary.json has said which years there are (the caller
 *  shows its language's "all years"). */
export function periodLabel(years: number[] | null, p: Period, f: Fmt): string | null {
  if (p.kind === 'year') return String(p.year)
  if (!years || years.length === 0) return p.kind === 'month' ? f.months[p.month - 1] : null
  if (p.kind === 'month') return `${f.months[p.month - 1]}, ${span(years)}`
  return span(years)
}

/** The same, short enough for the phone's top bar: "Jan, 2018–25". */
export function periodShort(years: number[] | null, p: Period, f: Fmt): string | null {
  if (p.kind !== 'month') return periodLabel(years, p, f)
  const name = f.monthsShort[p.month - 1]
  if (!years || years.length === 0) return name
  const last = years[years.length - 1]
  return years.length === 1 ? `${name}, ${years[0]}` : `${name}, ${years[0]}–${String(last).slice(2)}`
}
