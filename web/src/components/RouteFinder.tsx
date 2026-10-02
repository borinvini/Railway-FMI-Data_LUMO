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

/**
 * "Find a route": pick a start and an end station and the map highlights every direct train
 * route between them (Map.tsx draws it from the `routeHighlight` App derives from `result`).
 * Direct trains only -- a train that stops at the start station and later at the end station.
 */
export default function RouteFinder({ stations, start, end, result, onStart, onEnd, onSwap, onRandom, onClear }: RouteFinderProps) {
  const both = start !== null && end !== null

  return (
    <div className="absolute top-[204px] left-5 z-40 w-[252px] rounded-[10px] border border-[rgba(0,47,108,0.15)] bg-[rgba(190,208,228,0.97)] px-[14px] py-2.5 text-(--flag-blue) shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">Find a route</span>
        {(start || end) && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear route"
            className="cursor-pointer text-[#3f5873] hover:text-(--flag-blue)"
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
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
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-[rgba(0,47,108,0.2)] text-[#243f5e] hover:bg-[rgba(0,47,108,0.1)] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                <path d="M7 4v16" /><path d="M3 8l4-4 4 4" />
                <path d="M17 20V4" /><path d="M13 16l4 4 4-4" />
              </svg>
            </button>
          }
        />
      </div>

      <button
        type="button"
        onClick={onRandom}
        className="mt-2.5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-[rgba(0,47,108,0.2)] px-2 py-1.5 text-[13px] text-[#243f5e] hover:bg-[rgba(0,47,108,0.1)]"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8" cy="8" r="1" fill="currentColor" /><circle cx="16" cy="8" r="1" fill="currentColor" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
          <circle cx="8" cy="16" r="1" fill="currentColor" /><circle cx="16" cy="16" r="1" fill="currentColor" />
        </svg>
        Random route
      </button>

      <div className="mt-2.5 border-t border-[rgba(0,47,108,0.12)] pt-2 text-[13px] text-[#243f5e]">
        {!both && 'Pick two stations to see which trains connect them.'}
        {both && !result && 'No direct train between these stations.'}
        {both && result && (
          <>
            <ul className="m-0 list-none p-0">
              {result.byType.map((t) => (
                <li key={t.type} className="flex justify-between py-0.5">
                  <span className="font-medium text-(--flag-blue)">{t.type}</span>
                  <span>{t.trains} trains in January</span>
                </li>
              ))}
            </ul>
            <div className="mt-1 text-xs text-[#3f5873]">
              Direct trains running from {stationLabel(start!.name)} to {stationLabel(end!.name)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
