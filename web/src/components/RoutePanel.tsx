import type { RouteFeature } from '../lib/types'

interface RoutePanelProps {
  route: RouteFeature
  onClose: () => void
}

/**
 * Delay detail panel for the selected route. Weather section is not built yet — see
 * CLAUDE.md "Data contract" for the route_detail/<OD>.json this will eventually read.
 */
export default function RoutePanel({ route, onClose }: RoutePanelProps) {
  const label = (s: string) => s.replace(/ asema$/, '')

  return (
    <div className="absolute top-5 right-5 z-50 w-[290px] rounded-[10px] border border-(--line) bg-(--surface) px-[18px] py-4 backdrop-blur-[8px]">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-[10px] right-[14px] cursor-pointer text-(--muted) hover:text-(--text)"
      >
        ✕
      </button>
      <p className="mt-0 mb-0.5 text-lg font-light">
        {label(route.from_)} → {label(route.to)}
      </p>
      <div className="mb-3.5 text-[13px] text-(--muted)">January 2020</div>
      <div className="text-[40px] leading-none font-extralight">{route.avgDelay.toFixed(1)}</div>
      <div className="my-0.5 mb-3.5 text-[13px] text-(--muted)">minutes late, on average</div>

      <div className="flex justify-between border-t border-(--line) py-2 text-sm">
        <span className="text-(--muted)">Arrived within 5 min</span>
        <span>{route.onTimePct}%</span>
      </div>
      <div className="flex justify-between border-t border-(--line) py-2 text-sm">
        <span className="text-(--muted)">Trips in the month</span>
        <span>{route.runs}</span>
      </div>
      <div className="flex justify-between border-t border-(--line) py-2 text-sm">
        <span className="text-(--muted)">Stops on the way</span>
        <span>{route.path.length}</span>
      </div>
    </div>
  )
}
