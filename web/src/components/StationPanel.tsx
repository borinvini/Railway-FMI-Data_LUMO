import type { StationFeature } from '../lib/types'

interface StationPanelProps {
  station: StationFeature
  onClose: () => void
}

/**
 * Delay detail panel for the selected station. Numbers are the station's own stats across
 * every train that stops there, any route/train type -- see scripts/routes_lib.py
 * `station_summary`, not scoped to a single route.
 */
export default function StationPanel({ station, onClose }: StationPanelProps) {
  const label = (s: string) => s.replace(/ asema$/, '')

  return (
    <div className="card absolute top-5 right-5 z-50 w-[300px]">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-1 right-1 flex h-11 w-11 cursor-pointer items-center justify-center text-lg text-(--card-ink-2) hover:text-(--card-ink)"
      >
        ✕
      </button>
      <p className="font-board mt-0 mb-0.5 pr-8 text-[26px] leading-tight font-semibold">{label(station.name)}</p>
      <div className="mb-3.5 text-[15px] text-(--card-ink-2)">January 2020</div>
      <div className="font-board text-[56px] leading-none font-semibold">{station.avgDelay.toFixed(1)}</div>
      <div className="my-1 mb-3.5 text-[15px] text-(--card-ink-2)">minutes late, on average</div>

      <div className="flex justify-between border-t border-(--card-line) py-2 text-[15px]">
        <span className="text-(--card-ink-2)">Arrived within 5 min</span>
        <span>{station.onTimePct.toFixed(0)}%</span>
      </div>
      <div className="flex justify-between border-t border-(--card-line) py-2 text-[15px]">
        <span className="text-(--card-ink-2)">Trains stopping here</span>
        <span>{station.runs}</span>
      </div>
      <div className="flex justify-between border-t border-(--card-line) py-2 text-[15px]">
        <span className="text-(--card-ink-2)">Routes served</span>
        <span>{station.distinctRoutes}</span>
      </div>
      <div className="flex justify-between border-t border-(--card-line) py-2 text-[15px]">
        <span className="text-(--card-ink-2)">Cancelled</span>
        <span>{station.cancelledPct.toFixed(0)}%</span>
      </div>
    </div>
  )
}
