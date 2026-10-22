import { useEffect, useMemo } from 'react'
import { count, periodLabel } from '../lib/period'
import { MONTH_NAMES, monthTitle, seasonal, yearly } from '../lib/trends'
import type { SummaryFile } from '../lib/types'
import { MonthlyLine, SeasonBars } from './DelayCharts'
import YearChips from './YearChips'

interface DelayTrendsProps {
  summary: SummaryFile
  year: number | null
  /** Pick a year (or null for all) without closing the pop-up; the page behind follows too. */
  onYear: (year: number | null) => void
  onClose: () => void
}

/**
 * Pop-up in front of the map: how delays changed over the years (one line, a point per month) and
 * through the year (twelve bars, pooled over the years). Same shell and Esc handling as
 * RouteDetails. The picked year is drawn strong on the line and the rest fade.
 */
export default function DelayTrends({ summary, year, onYear, onClose }: DelayTrendsProps) {
  const series = useMemo(() => ({ avg: summary.trend.avg, n: summary.trend.arrivals }), [summary])
  const bySeason = useMemo(() => seasonal(summary.months, series, year), [summary, series, year])
  const byYear = useMemo(() => yearly(summary.months, series), [summary, series])

  // Esc closes just this pop-up: capture on window so the page-wide Esc handler never sees it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const takeaways = useMemo(() => {
    const out: string[] = []
    const months = bySeason.avg.map((v, k) => ({ v, k })).filter((m): m is { v: number; k: number } => m.v !== null)
    if (months.length >= 2) {
      const worst = months.reduce((a, b) => (b.v > a.v ? b : a))
      const best = months.reduce((a, b) => (b.v < a.v ? b : a))
      out.push(
        `${year === null ? 'Trains run' : `In ${year} trains ran`} latest in ${MONTH_NAMES[worst.k]} (${worst.v.toFixed(1)} min on average) and least late in ${MONTH_NAMES[best.k]} (${best.v.toFixed(1)} min).`,
      )
    }
    if (byYear.length >= 2) {
      const worst = byYear.reduce((a, b) => (b.avg > a.avg ? b : a))
      const best = byYear.reduce((a, b) => (b.avg < a.avg ? b : a))
      out.push(`${worst.year} was the latest year (${worst.avg.toFixed(1)} min on average), ${best.year} the least late (${best.avg.toFixed(1)} min).`)
    }
    // The month with the fewest arrivals (spring 2020) is worth a line: fewer trains ran.
    const counts = summary.trend.arrivals.map((n, i) => ({ n, i })).filter((c): c is { n: number; i: number } => c.n !== null)
    if (counts.length > 12) {
      const fewest = counts.reduce((a, b) => (b.n < a.n ? b : a))
      const typical = [...counts].sort((a, b) => a.n - b.n)[Math.floor(counts.length / 2)].n
      if (fewest.n < typical * 0.7) {
        out.push(`The fewest trains ran in ${monthTitle(summary.months[fewest.i])}: ${Math.round((fewest.n / typical) * 100)}% of a typical month.`)
      }
    }
    return out
  }, [bySeason, byYear, summary, year])

  const label = periodLabel(summary.years, null)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(2,6,13,0.55)] p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delay-trends-title"
        onClick={(e) => e.stopPropagation()}
        className="card relative max-h-[90vh] w-[min(860px,100%)] overflow-y-auto !rounded-xl !p-6 !shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-2 right-2 flex h-11 w-11 cursor-pointer items-center justify-center text-lg text-(--card-ink-3) hover:text-(--card-ink)"
        >
          ✕
        </button>

        <h2 id="delay-trends-title" className="font-board m-0 pr-10 text-[32px] leading-tight font-semibold">
          How delays changed
        </h2>
        <p className="m-0 mt-0.5 text-[15px] text-(--card-ink-2)">
          Every long-distance train, {label}.{year !== null && ` ${year} is picked out below.`}
        </p>
        <YearChips years={summary.years} year={year} onYear={onYear} columns="grid-cols-5 sm:grid-cols-10" className="mt-3" />

        <h3 className="font-board mt-5 mb-1 text-[22px] font-semibold">Month by month</h3>
        <p className="m-0 mb-2 text-[15px] text-(--card-ink-2)">Typical minutes late when trains arrived, for each month.</p>
        <MonthlyLine
          months={summary.months}
          avg={summary.trend.avg}
          year={year}
          ariaLabel="Line chart of the typical minutes late in each month"
        />

        <h3 className="font-board mt-6 mb-1 text-[22px] font-semibold">Through the year</h3>
        <p className="m-0 mb-2 text-[15px] text-(--card-ink-2)">
          {year === null ? 'The same, for each calendar month, with all the years put together.' : `The same, for each calendar month of ${year}.`}
        </p>
        <SeasonBars avg={bySeason.avg} ariaLabel={`Bar chart of the typical minutes late in each calendar month${year === null ? '' : ` of ${year}`}`} />

        {takeaways.map((line) => (
          <p key={line} className="m-0 mt-2 text-[15px] text-(--card-ink)">{line}</p>
        ))}

        <p className="m-0 mt-4 text-sm text-(--card-ink-3)">
          Delay is the minutes late at each arrival (early arrivals count as 0), averaged over{' '}
          {count(summary.trend.arrivals.reduce<number>((s, n) => s + (n ?? 0), 0))} arrivals.
        </p>
      </div>
    </div>
  )
}
