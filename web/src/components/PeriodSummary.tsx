import { useLang } from '../i18n'
import { periodLabel, scopeOf, type Period } from '../lib/period'
import type { SummaryFile } from '../lib/types'
import { Sparkline } from './DelayCharts'
import FinnishFlag from './FinnishFlag'
import PeriodPicker from './PeriodPicker'

interface PeriodSummaryProps {
  summary: SummaryFile | null
  period: Period
  onPeriod: (p: Period) => void
  /** Open the "How delays changed" pop-up. */
  onOpenTrends: () => void
}

/**
 * Title card at the top of the left column: what this page is, a period picker (by year or by month)
 * (every number and colour on the page follows it), the period's two headline numbers (set like a
 * departure board) and a small month-by-month delay line that opens the full charts (which also hold
 * the late-trains-in-bad-weather figures). Numbers come from summary.json; until it loads the card
 * shows the title.
 */
export default function PeriodSummary({ summary, period, onPeriod, onOpenTrends }: PeriodSummaryProps) {
  const { t, f } = useLang()
  const headline = summary?.scopes[scopeOf(period)] ?? null
  const label = periodLabel(summary?.years ?? null, period, f) ?? t.allYears
  const trainsText = headline ? f.int(headline.trains) : ''

  return (
    <header className="card">
      <div className="flex items-center gap-3">
        <FinnishFlag className="h-7 w-auto shrink-0 rounded-[2px] ring-1 ring-(--card-line)" />
        <div>
          <h1 className="font-board m-0 text-[26px] leading-tight font-semibold">{t.summary.title}</h1>
          <p className="m-0 text-[15px] text-(--card-ink-2)">{t.summary.tapHint(label)}</p>
        </div>
      </div>

      {summary && summary.years.length > 1 && (
        <PeriodPicker years={summary.years} period={period} onPeriod={onPeriod} className="mt-3" />
      )}

      {headline && (
        <>
          <dl className="m-0 mt-3.5 grid grid-cols-2 gap-4 border-t border-(--card-line) pt-3">
            <div className="min-w-0">
              <dd className={`font-board m-0 leading-none font-semibold ${trainsText.length > 6 ? 'text-[34px]' : 'text-[44px]'}`}>
                {trainsText}
              </dd>
              <dt className="mt-1 text-[15px] text-(--card-ink-2)">{t.summary.trainsRan}</dt>
            </div>
            <div>
              <dd className="font-board m-0 text-[44px] leading-none font-semibold">
                {headline.onTimePct === null ? '–' : f.pct(headline.onTimePct, 0)}
              </dd>
              <dt className="mt-1 text-[15px] text-(--card-ink-2)">{t.summary.onTime}</dt>
            </div>
          </dl>

          {summary && summary.months.length > 1 && (
            <button
              type="button"
              onClick={onOpenTrends}
              className="mt-3 block w-full cursor-pointer border-t border-(--card-line) bg-transparent px-0 pt-3 pb-0 text-left text-(--card-ink)"
            >
              <Sparkline months={summary.months} avg={summary.trend.avg} period={period} />
              <span className="mt-1.5 flex min-h-11 items-center justify-between text-[15px] text-(--card-ink-2)">
                <span>{t.summary.trendsLink}</span>
                <span aria-hidden="true" className="text-lg">→</span>
              </span>
            </button>
          )}
        </>
      )}
    </header>
  )
}
