import type { SummaryFile } from './types'

/** File/cache key of a period: "all" (every year) or the year, e.g. "2021". */
export const scopeOf = (year: number | null): string => (year === null ? 'all' : String(year))

/** Label for the period on screen: "2018–2025" for everything, "2021" for one year; null before
 *  summary.json has said which years there are (the caller shows its language's "all years"). */
export function periodLabel(years: SummaryFile['years'] | null, year: number | null): string | null {
  if (year !== null) return String(year)
  if (!years || years.length === 0) return null
  return years.length === 1 ? String(years[0]) : `${years[0]}–${years[years.length - 1]}`
}
