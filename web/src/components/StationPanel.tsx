import { useLang } from '../i18n'
import type { ConditionDef, StationFeature } from '../lib/types'
import ConditionList from './ConditionList'

interface StationPanelProps {
  station: StationFeature
  onClose: () => void
  /** Open the weather pop-up for this station's weather station. */
  onShowWeather: () => void
  /** What the period is called on screen: "2018–2025" or "2021". */
  period: string
  /** Weather condition names from summary.json; null until it has loaded. */
  conditionDefs: ConditionDef[] | null
  /** Open the AI model pop-up; only given for the stations with a trained model. */
  onAskModel?: () => void
}

/**
 * Delay detail panel for the selected station. Numbers are the station's own stats across
 * every train that stops there, any route/train type -- see scripts/routes_lib.py
 * `station_summary`, not scoped to a single route.
 */
export default function StationPanel({ station, onClose, onShowWeather, period, conditionDefs, onAskModel }: StationPanelProps) {
  const { t, f } = useLang()
  const label = (s: string) => s.replace(/ asema$/, '')
  const weather = station.weather

  return (
    <div className="card absolute top-5 right-5 z-50 w-[300px]">
      <button
        type="button"
        onClick={onClose}
        aria-label={t.close}
        className="absolute top-1 right-1 flex h-11 w-11 cursor-pointer items-center justify-center text-lg text-(--card-ink-2) hover:text-(--card-ink)"
      >
        ✕
      </button>
      <p className="font-board mt-0 mb-0.5 pr-8 text-[26px] leading-tight font-semibold">{label(station.name)}</p>
      <div className="mb-3.5 text-[15px] text-(--card-ink-2)">{period}</div>
      <div className="font-board text-[56px] leading-none font-semibold">{f.dec(station.avgDelay, 1)}</div>
      <div className="my-1 mb-3.5 text-[15px] text-(--card-ink-2)">{t.station.minutesLate}</div>

      <div className="flex justify-between border-t border-(--card-line) py-2 text-[15px]">
        <span className="text-(--card-ink-2)">{t.station.within5}</span>
        <span>{f.pct(station.onTimePct, 0)}</span>
      </div>
      <div className="flex justify-between border-t border-(--card-line) py-2 text-[15px]">
        <span className="text-(--card-ink-2)">{t.station.stopping}</span>
        <span>{f.int(station.runs)}</span>
      </div>
      <div className="flex justify-between border-t border-(--card-line) py-2 text-[15px]">
        <span className="text-(--card-ink-2)">{t.station.routes}</span>
        <span>{station.distinctRoutes}</span>
      </div>
      <div className="flex justify-between border-t border-(--card-line) py-2 text-[15px]">
        <span className="text-(--card-ink-2)">{t.station.cancelled}</span>
        <span>{f.pct(station.cancelledPct, 0)}</span>
      </div>

      {onAskModel && (
        <button
          type="button"
          onClick={onAskModel}
          className="mt-1 mb-1 flex min-h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-(--card-ink) text-[15px] font-medium text-white hover:opacity-90"
        >
          {t.station.askModel}
        </button>
      )}

      {station.ems && (
        <div className="mt-1 border-t border-(--card-line) pt-2.5 text-[15px] text-(--card-ink-2)">
          <p className="m-0">{t.station.weatherStation(station.ems.name, station.ems.km)}</p>
          <button
            type="button"
            onClick={onShowWeather}
            className="mt-2 flex min-h-11 w-full cursor-pointer items-center justify-center rounded-lg border border-[rgba(0,47,108,0.25)] text-[15px] text-(--card-ink) hover:bg-[rgba(0,47,108,0.1)]"
          >
            {t.station.seeWeather}
          </button>
        </div>
      )}

      {weather && (
        <div className="mt-1 border-t border-(--card-line) pt-2.5 text-[15px] text-(--card-ink-2)">
          {weather.avgTemp !== null && <p className="m-0 mb-1.5">{t.station.weatherHere(weather.avgTemp, weather.avgSnow)}</p>}
          {conditionDefs && weather.conditions && (
            <>
              <p className="m-0 mt-2 mb-0.5 font-medium text-(--card-ink)">{t.station.badWeather}</p>
              <ConditionList defs={conditionDefs} cells={weather.conditions} />
              <p className="m-0 mt-1 text-sm text-(--card-ink-3)">{t.conditions.key}</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
