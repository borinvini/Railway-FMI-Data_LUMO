import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { count } from '../lib/period'
import { MONTH_SHORT, monthTitle } from '../lib/trends'
import type { EmsStationFile, StationEms } from '../lib/types'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip)

// Below this many readings the numbers would say more than the data can support.
const MIN_READINGS = 100

const BLUE = '#002f6c'
const INK = '#243f5e'
const GRID = 'rgba(0, 47, 108, 0.14)'
const FONT = 'Barlow, system-ui, sans-serif'

interface WeatherStationDetailsProps {
  ems: StationEms
  /** The selected train station, for "5 km from Ähtäri". */
  stationName: string
  /** This weather station's file (data/ems/<file>.json); null while it is still loading. */
  file: EmsStationFile | null
  /** "all" or the picked year, e.g. "2021": which period's tiles and months to show. */
  scope: string
  /** What the period is called on screen: "2018–2025" or "2021". */
  period: string
  loadFailed: boolean
  /** One line tying a route pin's number to this pop-up's period-wide tiles; undefined otherwise. */
  routeNote?: string
  onClose: () => void
}

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

// A real minus sign, and no "-0": a mean of -0.4 reads "0°C".
const degrees = (t: number) => {
  const r = Math.round(t)
  return `${r < 0 ? '−' : ''}${Math.abs(r)}°C`
}

type View = 'temp' | 'snow' | 'wind'

/**
 * Pop-up in front of the map with one weather station's weather over the picked period, from the
 * readings the data matched to it whenever a train was nearby (see scripts/routes_lib.py
 * `ems_weather_summary`). That is not a continuous record: a cold night with no trains is not in
 * it, so the extremes are "at train times" and the pop-up says so. Same shell and Esc handling
 * as RouteDetails. One chart at a time, one bar per month, switched by tabs, so the pop-up stays short.
 */
export default function WeatherStationDetails({ ems, stationName, file, scope, period, loadFailed, routeNote, onClose }: WeatherStationDetailsProps) {
  const [view, setView] = useState<View>('temp')
  const weather = file?.scopes[scope] ?? null

  // The months to draw: every month for all years, or the twelve of the picked year.
  const shownMonths = useMemo(() => {
    if (!file) return []
    return file.months.flatMap((m, i) => (scope === 'all' || m.startsWith(scope) ? [{ m, i }] : []))
  }, [file, scope])
  const months = useMemo(() => shownMonths.map((x) => x.m), [shownMonths])
  // Stable identities, so a chart is only redrawn when the data (or the tab) changes.
  const tempRanges = useMemo(
    () => shownMonths.map(({ i }): [number, number] | null => (file?.monthly.temp[i] ? [file.monthly.temp[i]![0], file.monthly.temp[i]![2]] : null)),
    [file, shownMonths],
  )
  const snowMonthly = useMemo(() => shownMonths.map(({ i }) => file?.monthly.snow[i] ?? null), [file, shownMonths])
  const gustMonthly = useMemo(() => shownMonths.map(({ i }) => file?.monthly.gust[i] ?? null), [file, shownMonths])

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
  const hasSnow = snowMonthly.some((v) => v !== null)
  const hasWind = gustMonthly.some((v) => v !== null)
  // A tab only appears when it has something to draw; fall back to temperature otherwise.
  const tabs: { id: View; label: string }[] = [
    { id: 'temp', label: 'Temperature' },
    ...(hasSnow ? [{ id: 'snow' as const, label: 'Snow' }] : []),
    ...(hasWind ? [{ id: 'wind' as const, label: 'Wind' }] : []),
  ]
  const shown: View = tabs.some((t) => t.id === view) ? view : 'temp'

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
          {ems.km.toFixed(1)} km from {stationName}. {period}, at the times trains were nearby.
        </p>
        {routeNote && <p className="m-0 mt-1 text-[15px] font-medium text-(--card-ink)">{routeNote}</p>}
        {ems.closest && (
          <p className="m-0 mt-1 text-[15px] text-(--card-ink-2)">
            A closer station, {ems.closest.name}
            {ems.closest.km !== null && ` (${ems.closest.km.toFixed(1)} km)`}, has no train readings in the data, so
            this one is used.
          </p>
        )}

        {!file && (
          <p className="mt-6 mb-2 text-[15px] text-(--card-ink-2)">
            {loadFailed ? 'Could not load the weather. Please try again.' : 'Loading the weather…'}
          </p>
        )}

        {file && !weather && (
          <p className="mt-6 mb-2 text-[15px] text-(--card-ink-2)">No train readings at this weather station {period === 'all years' ? 'at all' : `in ${period}`}.</p>
        )}

        {weather && !enough && (
          <p className="mt-6 mb-2 text-[15px] text-(--card-ink-2)">
            Too few train readings to summarise {period}: {count(weather.readings)} in total.
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

            <div role="tablist" aria-label="Weather by month" className="mt-6 flex flex-wrap gap-2">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={t.id === shown}
                  onClick={() => setView(t.id)}
                  className={`min-h-11 cursor-pointer rounded-full border px-5 py-1 text-[15px] ${
                    t.id === shown
                      ? 'border-(--card-ink) bg-(--card-ink) text-white'
                      : 'border-[rgba(0,47,108,0.3)] text-(--card-ink-2) hover:bg-[rgba(0,47,108,0.1)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {shown === 'temp' && (
              <>
                <p className="m-0 mt-3 mb-2 text-[15px] text-(--card-ink-2)">
                  Each bar runs from the coldest to the warmest reading in that month. Months with no bar had no readings.
                </p>
                <MonthChart
                  months={months}
                  values={tempRanges}
                  yTitle="Air temperature (°C)"
                  ariaLabel="Bar chart of the coldest and warmest temperature reading in each month"
                  tooltip={(i) => {
                    const d = file!.monthly.temp[shownMonths[i].i]
                    return d ? `${degrees(d[0])} to ${degrees(d[2])}, average ${degrees(d[1])}` : 'No readings'
                  }}
                />
              </>
            )}

            {shown === 'snow' && (
              <>
                <p className="m-0 mt-3 mb-2 text-[15px] text-(--card-ink-2)">
                  The deepest snow measured in each month.
                  {weather.snow.daysWithSnow > 0
                    ? ` Snow lay on the ground on ${count(weather.snow.daysWithSnow)} of the ${count(weather.days)} days with readings.`
                    : ' There was no snow on the ground at any reading.'}
                </p>
                <MonthChart
                  months={months}
                  values={snowMonthly}
                  yTitle="Snow on the ground (cm)"
                  beginAtZero
                  ariaLabel="Bar chart of the deepest snow measured in each month"
                  tooltip={(i) => {
                    const v = snowMonthly[i]
                    return v === null ? 'No readings' : v <= 0 ? 'No snow' : `${v.toFixed(0)} cm of snow`
                  }}
                />
              </>
            )}

            {shown === 'wind' && (
              <>
                <p className="m-0 mt-3 mb-2 text-[15px] text-(--card-ink-2)">
                  The strongest gust of wind measured in each month, in metres per second (1 m/s is 3.6 km/h).
                </p>
                <MonthChart
                  months={months}
                  values={gustMonthly}
                  yTitle="Strongest gust (m/s)"
                  beginAtZero
                  ariaLabel="Bar chart of the strongest gust of wind measured in each month"
                  tooltip={(i) => {
                    const v = gustMonthly[i]
                    return v === null ? 'No readings' : `${v.toFixed(0)} m/s (${(v * 3.6).toFixed(0)} km/h)`
                  }}
                />
              </>
            )}

            <p className="m-0 mt-4 text-sm text-(--card-ink-3)">
              Based on {count(weather.readings)} readings
              {weather.slotShare !== null && ` (${Math.round(weather.slotShare * 100)}% of the 10-minute slots in ${period})`},
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

interface MonthChartProps {
  /** "YYYY-MM", one bar each. */
  months: string[]
  /** One entry per month: a value, a [low, high] range (floating bar), or null for a gap. */
  values: (number | [number, number] | null)[]
  yTitle: string
  ariaLabel: string
  /** Plain-language text for a month's tooltip, by index. */
  tooltip: (index: number) => string
  beginAtZero?: boolean
}

/** One bar per month (Chart.js called directly, like the rest of the charts); a month with no
 *  readings is a gap, not a zero. Over several years the axis names the years, not every month. */
function MonthChart({ months, values, yTitle, ariaLabel, tooltip, beginAtZero }: MonthChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const multiYear = new Set(months.map((m) => m.slice(0, 4))).size > 1
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [{
          data: values as unknown as number[],
          backgroundColor: BLUE,
          borderRadius: 2,
          maxBarThickness: 22,
          categoryPercentage: 0.9,
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
              title: (items) => monthTitle(months[items[0].dataIndex]),
              label: (ctx) => tooltip(ctx.dataIndex),
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: INK, font: { size: 13, family: FONT }, autoSkip: false, maxRotation: 0,
              // A label at each January (the year) over several years; the month name for one year.
              callback: (_v, i) =>
                multiYear ? (months[i].endsWith('-01') ? months[i].slice(0, 4) : '') : MONTH_SHORT[Number(months[i].slice(5, 7)) - 1],
            },
          },
          y: {
            beginAtZero,
            grid: { color: GRID },
            ticks: { color: INK, font: { size: 13, family: FONT } },
            title: { display: true, text: yTitle, color: INK },
          },
        },
      },
    })
    return () => chart.destroy()
    // `tooltip` is rebuilt every render; the data it reads is what `values` already tracks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months, values, yTitle, beginAtZero])

  return (
    <div className="relative h-[240px]">
      <canvas ref={canvasRef} role="img" aria-label={ariaLabel} />
    </div>
  )
}
