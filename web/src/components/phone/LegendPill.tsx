import { useState } from 'react'
import { DELAY_RAMP_HEX, ROUTE_BADGE_STEPS, rgbCss } from '../../lib/colors'
import Legend from '../Legend'
import { useLang } from '../../i18n'

interface LegendPillProps {
  routeMode: boolean
  weatherShown: boolean
  bottom: number
  /** Route mode with weather pins: the "Hide weather stations" switch lives in the open legend. */
  weatherToggle: { shown: boolean; onToggle: () => void } | null
}

/** Phone layout: the legend folded into a small pill over the map (the colours only). Tapping it
 *  opens the full legend; tapping again folds it. */
export default function LegendPill({ routeMode, weatherShown, bottom, weatherToggle }: LegendPillProps) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  return (
    <div className="pointer-events-none absolute left-2.5 z-30 flex flex-col items-start gap-2" style={{ bottom }}>
      {open && (
        <div className="pointer-events-auto">
          <Legend routeMode={routeMode} weatherShown={weatherShown} />
          {weatherToggle && (
            <button
              type="button"
              onClick={weatherToggle.onToggle}
              aria-pressed={weatherToggle.shown}
              className="mt-2 flex min-h-11 w-full cursor-pointer items-center justify-center rounded-[10px] border border-(--line) bg-(--surface) px-4 text-[15px] text-(--muted) backdrop-blur-[8px]"
            >
              {weatherToggle.shown ? t.shell.hideWeather : t.shell.showWeather}
            </button>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? t.legend.hide : t.legend.show}
        className="pointer-events-auto flex min-h-11 cursor-pointer items-center gap-2.5 rounded-full border border-(--line) bg-(--surface) px-4 text-[15px] text-(--muted) backdrop-blur-[8px]"
      >
        {routeMode ? (
          <span className="flex gap-1" aria-hidden="true">
            {ROUTE_BADGE_STEPS.map((s) => (
              <span key={s.below} className="h-3 w-3 rounded-full" style={{ background: rgbCss(s.fill) }} />
            ))}
          </span>
        ) : (
          <span className="h-1.5 w-12 rounded-full" style={{ background: `linear-gradient(90deg, ${DELAY_RAMP_HEX.join(', ')})` }} aria-hidden="true" />
        )}
        {open ? t.legend.pillHide : t.legend.pill}
      </button>
    </div>
  )
}
