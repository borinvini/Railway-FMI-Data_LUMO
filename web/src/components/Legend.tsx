import { DELAY_RAMP_HEX, ROUTE_BADGE_NO_FIGURE, ROUTE_BADGE_STEPS, rgbCss } from '../lib/colors'

/** Plain-language delay legend, bottom-left over the map (App places it in a row with Reset view). See CLAUDE.md "Map style". Shows the
 *  pin gradient normally, and the three badge colours while a route is highlighted. */
export default function Legend({ routeMode }: { routeMode: boolean }) {
  if (routeMode) {
    return (
      <div className="w-[260px] rounded-[10px] border border-(--line) bg-(--surface) px-[18px] py-4 backdrop-blur-[8px]">
        <div className="mb-2 text-sm text-(--muted)">Typical delay at this stop on the route</div>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm text-(--muted)">
          {[...ROUTE_BADGE_STEPS, ROUTE_BADGE_NO_FIGURE].map((step) => (
            <li key={step.label} className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: rgbCss(step.fill) }} />
              {step.label}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full border-2 border-[#8597ab] bg-transparent" />
            Grey ring: station's usual delay
          </li>
        </ul>
      </div>
    )
  }

  return (
    <div className="w-[260px] rounded-[10px] border border-(--line) bg-(--surface) px-[18px] py-4 backdrop-blur-[8px]">
      <div className="text-sm text-(--muted)">Average delay at this station</div>
      <div
        className="my-2 h-1.5 rounded-full"
        style={{ background: `linear-gradient(90deg, ${DELAY_RAMP_HEX.join(', ')})` }}
      />
      <div className="flex justify-between text-sm text-(--muted)">
        <span>on time</span>
        <span>8+ min late</span>
      </div>
    </div>
  )
}
