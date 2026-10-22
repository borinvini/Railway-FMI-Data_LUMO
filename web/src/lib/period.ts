import type { SummaryFile } from './types'

/** File/cache key of a period: "all" (every year) or the year, e.g. "2021". */
export const scopeOf = (year: number | null): string => (year === null ? 'all' : String(year))

/** Plain label for the period on screen: "2018–2025" for everything, "2021" for one year. */
export function periodLabel(years: SummaryFile['years'] | null, year: number | null): string {
  if (year !== null) return String(year)
  if (!years || years.length === 0) return 'all years'
  return years.length === 1 ? String(years[0]) : `${years[0]}–${years[years.length - 1]}`
}

/** "in 2021" / "in 2018–2025", for sentences. */
export const inPeriod = (label: string): string => `in ${label}`

/** Thousands separators, so 612,614 trains reads at a glance. */
export const count = (n: number): string => n.toLocaleString('en-GB')

/** "1 train", "3,198 trains". */
export const trainsText = (n: number): string => `${count(n)} ${n === 1 ? 'train' : 'trains'}`
