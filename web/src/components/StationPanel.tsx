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
    <div className="absolute top-5 right-5 z-50 w-[290px] rounded-[10px] border border-[rgba(0,47,108,0.15)] bg-[rgba(241,246,251,0.96)] px-[18px] py-4 text-(--flag-blue) shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-[10px] right-[14px] cursor-pointer text-[#5d7189] hover:text-(--flag-blue)"
      >
        ✕
      </button>
      <p className="mt-0 mb-0.5 text-lg font-light">{label(station.name)}</p>
      <div className="mb-3.5 text-[13px] text-[#5d7189]">January 2020</div>
      <div className="text-[40px] leading-none font-extralight">{station.avgDelay.toFixed(1)}</div>
      <div className="my-0.5 mb-3.5 text-[13px] text-[#5d7189]">minutes late, on average</div>

      <div className="flex justify-between border-t border-[rgba(0,47,108,0.12)] py-2 text-sm">
        <span className="text-[#5d7189]">Arrived within 5 min</span>
        <span>{station.onTimePct.toFixed(0)}%</span>
      </div>
      <div className="flex justify-between border-t border-[rgba(0,47,108,0.12)] py-2 text-sm">
        <span className="text-[#5d7189]">Trains stopping here</span>
        <span>{station.runs}</span>
      </div>
      <div className="flex justify-between border-t border-[rgba(0,47,108,0.12)] py-2 text-sm">
        <span className="text-[#5d7189]">Routes served</span>
        <span>{station.distinctRoutes}</span>
      </div>
      <div className="flex justify-between border-t border-[rgba(0,47,108,0.12)] py-2 text-sm">
        <span className="text-[#5d7189]">Cancelled</span>
        <span>{station.cancelledPct.toFixed(0)}%</span>
      </div>
    </div>
  )
}
