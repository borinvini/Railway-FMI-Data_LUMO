import type { StationBand, StationFeature } from '../lib/types'

// Round first: a mean of -0.4 is "0°C", not "−0°C".
const formatTemp = (t: number) => {
  const r = Math.round(t)
  return `${r < 0 ? '−' : ''}${Math.abs(r)}°C`
}

/** "Late in frost  25%": the share of this station's arrivals more than 5 min late in a band. */
function LateRow({ label, band }: { label: string; band: StationBand }) {
  return (
    <div className="flex justify-between py-0.5">
      <span>{label}</span>
      <span className="font-board text-lg font-semibold text-(--card-ink)">{band.latePct.toFixed(0)}%</span>
    </div>
  )
}

interface StationPanelProps {
  station: StationFeature
  onClose: () => void
  /** Open the January weather pop-up for this station's weather station. */
  onShowWeather: () => void
}

/**
 * Delay detail panel for the selected station. Numbers are the station's own stats across
 * every train that stops there, any route/train type -- see scripts/routes_lib.py
 * `station_summary`, not scoped to a single route.
 */
export default function StationPanel({ station, onClose, onShowWeather }: StationPanelProps) {
  const label = (s: string) => s.replace(/ asema$/, '')
  const weather = station.weather

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

      {station.ems && (
        <div className="mt-1 border-t border-(--card-line) pt-2.5 text-[15px] text-(--card-ink-2)">
          <p className="m-0">
            Weather station: {station.ems.name}, {station.ems.km.toFixed(1)} km away
          </p>
          <button
            type="button"
            onClick={onShowWeather}
            className="mt-2 flex min-h-11 w-full cursor-pointer items-center justify-center rounded-lg border border-[rgba(0,47,108,0.25)] text-[15px] text-(--card-ink) hover:bg-[rgba(0,47,108,0.1)]"
          >
            See January weather
          </button>
        </div>
      )}

      {weather && (
        <div className="mt-1 border-t border-(--card-line) pt-2.5 text-[15px] text-(--card-ink-2)">
          {weather.avgTemp !== null && (
            <p className="m-0 mb-1.5">
              January weather here: {formatTemp(weather.avgTemp)} on average
              {weather.avgSnow !== null && (weather.avgSnow >= 0.5 ? `, ${weather.avgSnow.toFixed(0)} cm of snow` : ', no snow')}.
            </p>
          )}
          {weather.frost && weather.mild && (
            <>
              <LateRow label="Late in frost" band={weather.frost} />
              <LateRow label="Late in mild weather" band={weather.mild} />
            </>
          )}
          {weather.snow && weather.noSnow && (
            <>
              <LateRow label="Late with 10+ cm of snow" band={weather.snow} />
              <LateRow label="Late with no snow" band={weather.noSnow} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
