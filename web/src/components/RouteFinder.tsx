import type { RouteResult } from '../lib/routeFinder'
import type { StationFeature } from '../lib/types'
import StationCombobox, { stationLabel } from './StationCombobox'

interface RouteFinderProps {
  stations: StationFeature[]
  start: StationFeature | null
  end: StationFeature | null
  /** Direct-train result for the chosen pair; null = none found (only meaningful with both set). */
  result: RouteResult | null
  onStart: (station: StationFeature) => void
  onEnd: (station: StationFeature) => void
  onSwap: () => void
  onRandom: () => void
  onClear: () => void
}

const ghostButton =
  'flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[rgba(0,47,108,0.25)] text-[15px] text-(--card-ink-2) hover:bg-[rgba(0,47,108,0.1)] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent'

/**
 * "Find a route": pick a start and an end station and the map highlights every direct train
 * route between them (Map.tsx draws it from the `routeHighlight` App derives from `result`).
 * Direct trains only -- a train that stops at the start station and later at the end station.
 */
export default function RouteFinder({ stations, start, end, result, onStart, onEnd, onSwap, onRandom, onClear }: RouteFinderProps) {
  const both = start !== null && end !== null

  return (
    <section className="card" aria-labelledby="route-finder-title">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 id="route-finder-title" className="font-board m-0 text-[22px] leading-none font-semibold">Find a route</h2>
        {(start || end) && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear route"
            className="-mr-2 flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-lg text-(--card-ink-3) hover:text-(--card-ink)"
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <StationCombobox id="route-from" label="From" placeholder="Start station…" stations={stations} value={start} onChange={onStart} excludeCode={end?.code} />
        <StationCombobox
          id="route-to" label="To" placeholder="End station…" stations={stations} value={end} onChange={onEnd} excludeCode={start?.code}
          labelAction={
            // Trains are counted per direction (they must stop at "From" first), so this flips
            // the pair to see the opposite direction's trains.
            <button
              type="button"
              onClick={onSwap}
              disabled={!start && !end}
              aria-label="Swap direction"
              title="Swap direction"
              className={`${ghostButton} -my-1.5 h-11 w-11`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M7 4v16" /><path d="M3 8l4-4 4 4" />
                <path d="M17 20V4" /><path d="M13 16l4 4 4-4" />
              </svg>
            </button>
          }
        />
      </div>

      <button type="button" onClick={onRandom} className={`${ghostButton} mt-3 w-full`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8" cy="8" r="1" fill="currentColor" /><circle cx="16" cy="8" r="1" fill="currentColor" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
          <circle cx="8" cy="16" r="1" fill="currentColor" /><circle cx="16" cy="16" r="1" fill="currentColor" />
        </svg>
        Random route
      </button>

      <div className="mt-3 border-t border-(--card-line) pt-2.5 text-[15px] text-(--card-ink-2)">
        {!both && 'Pick two stations to see which trains connect them.'}
        {both && !result && 'No direct train between these stations.'}
        {both && result && (
          <>
            <ul className="m-0 list-none p-0">
              {result.byType.map((t) => (
                <li key={t.type} className="flex justify-between py-0.5">
                  <span className="font-board text-lg font-semibold text-(--card-ink)">{t.type}</span>
                  <span>{t.trains} trains in January</span>
                </li>
              ))}
            </ul>
            <div className="mt-1.5 text-sm text-(--card-ink-3)">
              Direct trains running from {stationLabel(start!.name)} to {stationLabel(end!.name)}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
