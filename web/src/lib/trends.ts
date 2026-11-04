import type { RouteTrendsFile } from './types'

/** Delay per month: average minutes late (null = no trains) and the weight behind it (trains or
 *  arrivals). Index-aligned with a list of "YYYY-MM" months. */
export interface Series {
  avg: (number | null)[]
  n: (number | null)[]
}

/** Pool several train services' months: weighted by each service's trains in that month. */
export function combineServices(file: RouteTrendsFile, services: { id: string }[]): Series {
  const found = services.map((s) => file.services[s.id]).filter((s) => s !== undefined)
  const avg: (number | null)[] = []
  const n: (number | null)[] = []
  for (let i = 0; i < file.months.length; i++) {
    let sum = 0
    let total = 0
    for (const s of found) {
      const a = s.avg[i]
      const w = s.n[i]
      if (a === null || w <= 0) continue
      sum += (a / 10) * w
      total += w
    }
    avg.push(total > 0 ? sum / total : null)
    n.push(total > 0 ? total : null)
  }
  return { avg, n }
}

/** One value per calendar month (January...December), weighted: pooled over all years, or only the
 *  months of `year` when one is picked. */
export function seasonal(months: string[], series: Series, year: number | null = null): { avg: (number | null)[]; n: number[] } {
  const sum = new Array<number>(12).fill(0)
  const total = new Array<number>(12).fill(0)
  months.forEach((m, i) => {
    const a = series.avg[i]
    const w = series.n[i] ?? 0
    if (a === null || w <= 0) return
    if (year !== null && !m.startsWith(String(year))) return
    const k = Number(m.slice(5, 7)) - 1
    sum[k] += a * w
    total[k] += w
  })
  return { avg: sum.map((s, k) => (total[k] > 0 ? s / total[k] : null)), n: total }
}

/** One value per calendar year, weighted. Keys are the year numbers found in `months`. */
export function yearly(months: string[], series: Series): { year: number; avg: number; n: number }[] {
  const acc = new Map<number, { sum: number; total: number }>()
  months.forEach((m, i) => {
    const a = series.avg[i]
    const w = series.n[i] ?? 0
    if (a === null || w <= 0) return
    const y = Number(m.slice(0, 4))
    const e = acc.get(y) ?? { sum: 0, total: 0 }
    e.sum += a * w
    e.total += w
    acc.set(y, e)
  })
  return [...acc].map(([year, { sum, total }]) => ({ year, avg: sum / total, n: total })).sort((a, b) => a.year - b.year)
}
