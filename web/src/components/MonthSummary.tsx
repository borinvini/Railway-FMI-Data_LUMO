import type { SummaryFile } from '../lib/types'
import FinnishFlag from './FinnishFlag'

const monthYear = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayMonth = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })

/**
 * Title card at the top of the left column: what this page is, the month's two headline numbers
 * (set like a departure board) and the one-line hint on how to use it. Numbers come from
 * summary.json; until it loads the card still shows the title.
 */
export default function MonthSummary({ summary }: { summary: SummaryFile | null }) {
  return (
    <header className="card">
      <div className="flex items-center gap-3">
        <FinnishFlag className="h-7 w-auto shrink-0 rounded-[2px] ring-1 ring-(--card-line)" />
        <div>
          <h1 className="font-board m-0 text-[26px] leading-tight font-semibold">Long-distance trains in Finland</h1>
          <p className="m-0 text-[15px] text-(--card-ink-2)">{summary?.firstDate ? monthYear(summary.firstDate) : 'January 2020'}</p>
        </div>
      </div>

      {summary && (
        <>
          <dl className="m-0 mt-3.5 grid grid-cols-2 gap-4 border-t border-(--card-line) pt-3">
            <div>
              <dd className="font-board m-0 text-[44px] leading-none font-semibold">{summary.trains.toLocaleString('en-GB')}</dd>
              <dt className="mt-1 text-[15px] text-(--card-ink-2)">trains ran</dt>
            </div>
            <div>
              <dd className="font-board m-0 text-[44px] leading-none font-semibold">
                {summary.onTimePct === null ? '–' : `${summary.onTimePct.toFixed(0)}%`}
              </dd>
              <dt className="mt-1 text-[15px] text-(--card-ink-2)">on time (up to 5 min late)</dt>
            </div>
          </dl>
          {summary.worstDay && (
            <p className="m-0 mt-3 text-[15px] text-(--card-ink-2)">
              Worst day: {dayMonth(summary.worstDay.date)}
              {summary.worstDay.typicalDelay !== null && `, trains typically ${summary.worstDay.typicalDelay.toFixed(1)} min late`}
            </p>
          )}
        </>
      )}

      <p className="m-0 mt-3 border-t border-(--card-line) pt-3 text-[15px] text-(--card-ink-3)">
        Tap a station on the map, or pick two stations below to see the trains between them.
      </p>
    </header>
  )
}
