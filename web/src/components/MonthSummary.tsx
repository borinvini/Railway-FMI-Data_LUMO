import type { SummaryFile } from '../lib/types'
import FinnishFlag from './FinnishFlag'

const monthYear = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/**
 * Title card at the top of the left column: what this page is, the month's two headline numbers
 * (set like a departure board) and how much later trains ran in frost and snow. The weather
 * figures are compared within the same stations (see routes_lib.pooled_same_station), so it is
 * not just "the north is colder". Numbers come from summary.json; until it loads the card
 * still shows the title.
 */
export default function MonthSummary({ summary }: { summary: SummaryFile | null }) {
  const temp = summary?.weather?.compare.temp ?? null
  const snow = summary?.weather?.compare.snow ?? null
  return (
    <header className="card">
      <div className="flex items-center gap-3">
        <FinnishFlag className="h-7 w-auto shrink-0 rounded-[2px] ring-1 ring-(--card-line)" />
        <div>
          <h1 className="font-board m-0 text-[26px] leading-tight font-semibold">Long-distance trains in Finland</h1>
          <p className="m-0 text-[15px] text-(--card-ink-2)">
            {summary?.firstDate ? monthYear(summary.firstDate) : 'January 2020'}. Tap any station on the map.
          </p>
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
          {temp && snow && (
            <div className="mt-3 border-t border-(--card-line) pt-3">
              <p className="m-0 text-[15px] text-(--card-ink-2)">Trains more than 5 min late</p>
              <dl className="m-0 mt-1.5 grid grid-cols-2 gap-x-4 gap-y-2">
                <Pair value={temp.harshLatePct} label="in frost" />
                <Pair value={temp.benignLatePct} label="in mild weather" />
                <Pair value={snow.harshLatePct} label="with deep snow" />
                <Pair value={snow.benignLatePct} label="with no snow" />
              </dl>
              <p className="m-0 mt-1.5 text-sm text-(--card-ink-3)">
                Compared at the same stations, one January.
              </p>
            </div>
          )}
        </>
      )}

    </header>
  )
}

/** One weather figure, board numerals over a plain-words label. */
function Pair({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dd className="font-board m-0 text-[28px] leading-none font-semibold">{value.toFixed(0)}%</dd>
      <dt className="text-[15px] text-(--card-ink-2)">{label}</dt>
    </div>
  )
}
