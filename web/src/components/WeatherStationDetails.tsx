import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js'
import { useEffect, useRef } from 'react'
import type { EmsWeather, StationEms } from '../lib/types'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip)

// Below this many readings the numbers would say more than the data can support.
const MIN_READINGS = 100

const BLUE = '#002f6c'
const INK = '#243f5e'
const GRID = 'rgba(0, 47, 108, 0.14)'

interface WeatherStationDetailsProps {
  ems: StationEms
  /** The selected train station, for "5 km from Ähtäri". */
  stationName: string
  /** null while ems_weather.json is still loading. */
  weather: EmsWeather | null
  dates: string[]
  loadFailed: boolean
  onClose: () => void
}

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

// A real minus sign, and no "-0": a mean of -0.4 reads "0°C".
const degrees = (t: number) => {
  const r = Math.round(t)
  return `${r < 0 ? '−' : ''}${Math.abs(r)}°C`
}

/**
 * Pop-up in front of the map with one weather station's January weather, from the readings the
 * data matched to it whenever a train was nearby (see scripts/routes_lib.py
 * `ems_weather_summary`). That is not a continuous record: a cold night with no trains is not in
 * it, so the extremes are "at train times" and the pop-up says so. Same shell and Esc handling
 * as RouteDetails.
 */
export default function WeatherStationDetails({ ems, stationName, weather, dates, loadFailed, onClose }: WeatherStationDetailsProps) {
  // Esc closes just this pop-up: capture on window so the page-wide Esc handler (which would
  // also deselect the station) never sees it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const enough = weather !== null && weather.readings >= MIN_READINGS

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(2,6,13,0.55)] p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="weather-station-title"
        onClick={(e) => e.stopPropagation()}
        className="card relative max-h-[90vh] w-[min(760px,100%)] overflow-y-auto !rounded-xl !p-6 !shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-2 right-2 flex h-11 w-11 cursor-pointer items-center justify-center text-lg text-(--card-ink-3) hover:text-(--card-ink)"
        >
          ✕
        </button>

        <h2 id="weather-station-title" className="font-board m-0 pr-10 text-[32px] leading-tight font-semibold">
          {ems.name} weather station
        </h2>
        <p className="m-0 mt-0.5 text-[15px] text-(--card-ink-2)">
          {ems.km.toFixed(1)} km from {stationName}. January 2020, at the times trains were nearby.
        </p>
        {ems.closest && (
          <p className="m-0 mt-1 text-[15px] text-(--card-ink-2)">
            A closer station, {ems.closest.name}
            {ems.closest.km !== null && ` (${ems.closest.km.toFixed(1)} km)`}, has no train readings in the data, so
            this one is used.
          </p>
        )}

        {!weather && (
          <p className="mt-6 mb-2 text-[15px] text-(--card-ink-2)">
            {loadFailed ? 'Could not load the weather. Please try again.' : 'Loading the weather…'}
          </p>
        )}

        {weather && !enough && (
          <p className="mt-6 mb-2 text-[15px] text-(--card-ink-2)">
            Too few train readings in January to summarise: {weather.readings} in the whole month.
          </p>
        )}

        {weather && enough && (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Tile label="Average temperature" value={weather.temp.avg === null ? 'No reading' : degrees(weather.temp.avg)} />
              <Tile
                label="Coldest"
                value={weather.temp.min === null ? 'No reading' : degrees(weather.temp.min)}
                note={weather.temp.minAt ? shortDate(weather.temp.minAt) : undefined}
              />
              <Tile
                label="Warmest"
                value={weather.temp.max === null ? 'No reading' : degrees(weather.temp.max)}
                note={weather.temp.maxAt ? shortDate(weather.temp.maxAt) : undefined}
              />
              <Tile
                label="Deepest snow"
                value={weather.snow.max === null ? 'No reading' : weather.snow.max <= 0 ? 'No snow' : `${weather.snow.max.toFixed(0)} cm`}
                note={weather.snow.maxAt ? shortDate(weather.snow.maxAt) : undefined}
              />
              <Tile
                label="Strongest gust of wind"
                value={weather.gust.max === null ? 'No reading' : `${weather.gust.max.toFixed(0)} m/s`}
                note={weather.gust.max === null ? undefined : `${(weather.gust.max * 3.6).toFixed(0)} km/h${weather.gust.maxAt ? `, ${shortDate(weather.gust.maxAt)}` : ''}`}
              />
              <Tile
                label="Worst visibility"
                value={
                  weather.visibility.min === null
                    ? 'No reading'
                    : weather.visibility.min < 1000
                      ? `${weather.visibility.min.toFixed(0)} m`
                      : `${(weather.visibility.min / 1000).toFixed(1)} km`
                }
                note={weather.visibility.minAt ? shortDate(weather.visibility.minAt) : undefined}
              />
            </div>

            <h3 className="font-board mt-6 mb-1 text-[22px] font-semibold">Temperature day by day</h3>
            <p className="m-0 mb-2 text-[15px] text-(--card-ink-2)">
              Each bar runs from the coldest to the warmest reading that day. Days with no bar had no readings.
            </p>
            <DailyChart dates={dates} daily={weather.daily} />

            <p className="m-0 mt-4 text-sm text-(--card-ink-3)">
              Based on {weather.readings.toLocaleString('en-GB')} readings
              {weather.slotShare !== null && ` (${Math.round(weather.slotShare * 100)}% of the month's 10-minute slots)`},
              taken when trains were nearby. Highs and lows are from those times, so a cold night with no trains is not
              in them. If this station does not measure something, the data takes it from the next closest one.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-(--card-line) bg-[rgba(255,255,255,0.35)] px-3 py-2.5">
      <div className="font-board text-[36px] leading-none font-semibold">{value}</div>
      <div className="mt-1.5 text-[15px] text-(--card-ink-2)">{label}</div>
      {note && <div className="text-sm text-(--card-ink-3)">{note}</div>}
    </div>
  )
}

/** Floating bars (coldest to warmest reading) for each day; a day with no readings is a gap. */
function DailyChart({ dates, daily }: { dates: string[]; daily: EmsWeather['daily'] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: dates.map((d) => d.slice(8).replace(/^0/, '')),
        datasets: [{
          data: daily.map((d) => (d ? [d[0], d[2]] : null)) as unknown as number[],
          backgroundColor: BLUE,
          borderRadius: 2,
          maxBarThickness: 16,
          categoryPercentage: 0.85,
          barPercentage: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 250 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(6,16,31,0.92)',
            callbacks: {
              title: (items) => shortDate(dates[items[0].dataIndex]),
              label: (ctx) => {
                const d = daily[ctx.dataIndex]
                return d ? `${degrees(d[0])} to ${degrees(d[2])}, average ${degrees(d[1])}` : 'No readings'
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: INK, font: { size: 13, family: 'Barlow, system-ui, sans-serif' }, autoSkip: true, maxTicksLimit: 16 },
            title: { display: true, text: 'Day of January', color: INK },
          },
          y: {
            grid: { color: GRID },
            ticks: { color: INK, font: { size: 13, family: 'Barlow, system-ui, sans-serif' } },
            title: { display: true, text: 'Air temperature (°C)', color: INK },
          },
        },
      },
    })
    return () => chart.destroy()
  }, [dates, daily])

  return (
    <div className="relative h-[240px]">
      <canvas ref={canvasRef} role="img" aria-label="Bar chart of the coldest and warmest temperature reading on each day of January" />
    </div>
  )
}
