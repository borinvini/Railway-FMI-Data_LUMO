import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLang } from '../i18n'
import { monthsOfScope } from '../lib/period'
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
  /** "all", the picked year ("2021") or month ("m01"): which period's tiles and months to show. */
  scope: string
  /** What the period is called on screen: "2018–2025", "2021" or "January, 2018–2025". */
  period: string
  loadFailed: boolean
  /** One line tying a route pin's number to this pop-up's period-wide tiles; undefined otherwise. */
  routeNote?: string
  onClose: () => void
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
  const { t, f } = useLang()
  const w = t.weather
  const shortDate = f.date
  const degrees = f.temp
  const [view, setView] = useState<View>('temp')
  const weather = file?.scopes[scope] ?? null

  // The months to draw: every month for all years, the twelve of a picked year, or a picked
  // calendar month in each year (one bar per year).
  const shownMonths = useMemo(() => {
    if (!file) return []
    return monthsOfScope(file.months, scope).map((i) => ({ m: file.months[i], i }))
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
    { id: 'temp', label: w.tabs.temp },
    ...(hasSnow ? [{ id: 'snow' as const, label: w.tabs.snow }] : []),
    ...(hasWind ? [{ id: 'wind' as const, label: w.tabs.wind }] : []),
  ]
  const shown: View = tabs.some((t) => t.id === view) ? view : 'temp'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(2,6,13,0.55)] p-4 max-md:p-0" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="weather-station-title"
        onClick={(e) => e.stopPropagation()}
        className="card relative max-h-[90vh] w-[min(760px,100%)] overflow-y-auto !rounded-xl !p-6 !shadow-[0_20px_60px_rgba(0,0,0,0.5)] max-md:h-full max-md:max-h-none max-md:w-full max-md:!rounded-none max-md:!px-4 max-md:!pt-[calc(14px+env(safe-area-inset-top))] max-md:!pb-[calc(24px+env(safe-area-inset-bottom))]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t.close}
          className="absolute top-2 right-2 flex h-11 w-11 cursor-pointer items-center justify-center text-lg text-(--card-ink-3) hover:text-(--card-ink) max-md:fixed max-md:top-[calc(6px+env(safe-area-inset-top))] max-md:right-2 max-md:z-10 max-md:rounded-full max-md:bg-(--card) max-md:text-(--card-ink) max-md:shadow-[0_2px_10px_rgba(0,0,0,0.25)]"
        >
          ✕
        </button>

        <h2 id="weather-station-title" className="font-board m-0 pr-10 text-[32px] leading-tight font-semibold">
          {w.title(ems.name)}
        </h2>
        <p className="m-0 mt-0.5 text-[15px] text-(--card-ink-2)">{w.intro(ems.km, stationName, period)}</p>
        {routeNote && <p className="m-0 mt-1 text-[15px] font-medium text-(--card-ink)">{routeNote}</p>}
        {ems.closest && <p className="m-0 mt-1 text-[15px] text-(--card-ink-2)">{w.closer(ems.closest.name, ems.closest.km)}</p>}

        {!file && (
          <p className="mt-6 mb-2 text-[15px] text-(--card-ink-2)">{loadFailed ? w.failed : w.loading}</p>
        )}

        {file && !weather && (
          <p className="mt-6 mb-2 text-[15px] text-(--card-ink-2)">{w.none(period === t.allYears ? null : period)}</p>
        )}

        {weather && !enough && (
          <p className="mt-6 mb-2 text-[15px] text-(--card-ink-2)">{w.tooFew(period, weather.readings)}</p>
        )}

        {weather && enough && (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Tile label={w.avgTemp} value={weather.temp.avg === null ? w.noReading : degrees(weather.temp.avg)} />
              <Tile
                label={w.coldest}
                value={weather.temp.min === null ? w.noReading : degrees(weather.temp.min)}
                note={weather.temp.minAt ? shortDate(weather.temp.minAt) : undefined}
              />
              <Tile
                label={w.warmest}
                value={weather.temp.max === null ? w.noReading : degrees(weather.temp.max)}
                note={weather.temp.maxAt ? shortDate(weather.temp.maxAt) : undefined}
              />
              <Tile
                label={w.deepestSnow}
                value={weather.snow.max === null ? w.noReading : weather.snow.max <= 0 ? w.noSnow : `${f.dec(weather.snow.max, 0)} cm`}
                note={weather.snow.maxAt ? shortDate(weather.snow.maxAt) : undefined}
              />
              <Tile
                label={w.strongestGust}
                value={weather.gust.max === null ? w.noReading : `${f.dec(weather.gust.max, 0)} m/s`}
                note={weather.gust.max === null ? undefined : `${f.dec(weather.gust.max * 3.6, 0)} km/h${weather.gust.maxAt ? `, ${shortDate(weather.gust.maxAt)}` : ''}`}
              />
              <Tile
                label={w.worstVisibility}
                value={
                  weather.visibility.min === null
                    ? w.noReading
                    : weather.visibility.min < 1000
                      ? `${f.dec(weather.visibility.min, 0)} m`
                      : `${f.dec(weather.visibility.min / 1000, 1)} km`
                }
                note={weather.visibility.minAt ? shortDate(weather.visibility.minAt) : undefined}
              />
            </div>

            <div role="tablist" aria-label={w.tabsAria} className="mt-6 flex flex-wrap gap-2">
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
                <p className="m-0 mt-3 mb-2 text-[15px] text-(--card-ink-2)">{w.tempIntro}</p>
                <MonthChart
                  months={months}
                  values={tempRanges}
                  yTitle={w.tempAxis}
                  ariaLabel={w.tempAria}
                  tooltip={(i) => {
                    const d = file!.monthly.temp[shownMonths[i].i]
                    return d ? w.tempTip(d[0], d[1], d[2]) : w.noReadings
                  }}
                />
              </>
            )}

            {shown === 'snow' && (
              <>
                <p className="m-0 mt-3 mb-2 text-[15px] text-(--card-ink-2)">{w.snowIntro(weather.snow.daysWithSnow, weather.days)}</p>
                <MonthChart
                  months={months}
                  values={snowMonthly}
                  yTitle={w.snowAxis}
                  beginAtZero
                  ariaLabel={w.snowAria}
                  tooltip={(i) => {
                    const v = snowMonthly[i]
                    return v === null ? w.noReadings : v <= 0 ? w.noSnow : w.snowTip(v)
                  }}
                />
              </>
            )}

            {shown === 'wind' && (
              <>
                <p className="m-0 mt-3 mb-2 text-[15px] text-(--card-ink-2)">{w.windIntro}</p>
                <MonthChart
                  months={months}
                  values={gustMonthly}
                  yTitle={w.windAxis}
                  beginAtZero
                  ariaLabel={w.windAria}
                  tooltip={(i) => {
                    const v = gustMonthly[i]
                    return v === null ? w.noReadings : w.windTip(v)
                  }}
                />
              </>
            )}

            <p className="m-0 mt-4 text-sm text-(--card-ink-3)">
              {w.footnote(weather.readings, weather.slotShare === null ? null : Math.round(weather.slotShare * 100), period)}
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
  const { f } = useLang()
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
        locale: f.chartLocale,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(6,16,31,0.92)',
            callbacks: {
              title: (items) => f.monthTitle(months[items[0].dataIndex]),
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
                multiYear ? (months[i].endsWith('-01') ? months[i].slice(0, 4) : '') : f.monthsShort[Number(months[i].slice(5, 7)) - 1],
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
  }, [months, values, yTitle, beginAtZero, f])

  return (
    <div className="relative h-[240px]">
      <canvas ref={canvasRef} role="img" aria-label={ariaLabel} />
    </div>
  )
}
