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
    <div className="absolute top-5 right-5 w-[290px] rounded-[10px] border border-(--line) bg-(--surface) px-[18px] py-4 backdrop-blur-[8px]">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-[10px] right-[14px] cursor-pointer text-(--muted) hover:text-(--text)"
      >
        ✕
      </button>
      <p className="mt-0 mb-0.5 text-lg font-light">{label(station.name)}</p>
      <div className="mb-3.5 text-[13px] text-(--muted)">January 2020</div>
      <div className="text-[40px] leading-none font-extralight">{station.avgDelay.toFixed(1)}</div>
      <div className="my-0.5 mb-3.5 text-[13px] text-(--muted)">minutes late, on average</div>

      <div className="flex justify-between border-t border-(--line) py-2 text-sm">
        <span className="text-(--muted)">Arrived within 5 min</span>
        <span>{station.onTimePct.toFixed(0)}%</span>
      </div>
      <div className="flex justify-between border-t border-(--line) py-2 text-sm">
        <span className="text-(--muted)">Trains stopping here</span>
        <span>{station.runs}</span>
      </div>
      <div className="flex justify-between border-t border-(--line) py-2 text-sm">
        <span className="text-(--muted)">Routes served</span>
        <span>{station.distinctRoutes}</span>
      </div>
      <div className="flex justify-between border-t border-(--line) py-2 text-sm">
        <span className="text-(--muted)">Cancelled</span>
        <span>{station.cancelledPct.toFixed(0)}%</span>
      </div>
    </div>
  )
}
