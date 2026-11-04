import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js'
import { useEffect, useMemo, useRef } from 'react'
import { useLang } from '../i18n'
import { summarizeRoute, viaStops, type RouteSummary, type StationInfo, type StopPoint } from '../lib/routeStats'
import { combineServices, seasonal } from '../lib/trends'
import type { ConditionDef, RoutePath, RouteStatsFile, RouteTrendsFile, StationFeature } from '../lib/types'
import ConditionList from './ConditionList'
import { MonthlyLine, SeasonBars } from './DelayCharts'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip)

// Chart ink on the light card. Bars use the flag blue, with the latest-running stop picked out
// in crimson; the on-time split uses blue / amber / crimson and always carries text labels, so
// meaning never depends on colour alone.
const BLUE = '#002f6c'
const CRIMSON = '#c1213d'
const AMBER = '#e08a00'
const INK = '#243f5e'
const SOFT = '#3f5873'
const GRID = 'rgba(0, 47, 108, 0.14)'

interface RouteDetailsProps {
  routes: RoutePath[]
  active: number
  onActive: (index: number) => void
  startName: string
  endName: string
  stations: StationFeature[]
  /** null while route_stats.json is still loading. */
  stats: RouteStatsFile | null
  loadFailed: boolean
  /** What the period is called on screen: "2018–2025" or "2021". */
  period: string
  /** The picked year (null = all years); the month-by-month line picks it out. */
  year: number | null
  /** Weather condition names from summary.json; null until it has loaded (the section is then skipped). */
  conditionDefs: ConditionDef[] | null
  /** route_trends.json; null while it loads (the "over the years" section waits). */
  trends: RouteTrendsFile | null
  onClose: () => void
}

const stripAsema = (s: string) => s.replace(/ asema$/, '')

/**
 * Pop-up in front of the map with the saved statistics for one highlighted route: headline
 * numbers, how late trains are at each stop, how arrivals split into on time / a bit late / very
 * late, and a table of the train services that run the route. When several routes are
 * highlighted, tabs switch between them.
 */
export default function RouteDetails({ routes, active, onActive, startName, endName, stations, stats, loadFailed, period, year, conditionDefs, trends, onClose }: RouteDetailsProps) {
  const { t, f } = useLang()
  const info = useMemo(
    () => new Map<string, StationInfo>(stations.map((s) => [s.code, { name: stripAsema(s.name), runs: s.runs, lat: s.lat, lon: s.lon }])),
    [stations],
  )
  const names = useMemo(() => new Map([...info].map(([code, i]) => [code, i.name])), [info])
  const route = routes[active]

  const labels = useMemo(() => {
    const raw = routes.map((r) => {
      const via = viaStops(r, info)
      return via.length === 0 ? t.route.direct : t.route.via(via)
    })
    // Two routes can share the same "via": tell them apart by the train types that run them,
    // and if those match too (they differ only in skipped stops), by their number of stops.
    const types = (r: RoutePath) => Object.entries(r.byType).sort((x, y) => y[1] - x[1]).map(([code]) => code).join(', ')
    const withTypes = raw.map((label, i) => (raw.filter((l) => l === label).length > 1 ? `${label} · ${types(routes[i])}` : label))
    return withTypes.map((label, i) =>
      withTypes.filter((l) => l === label).length > 1 ? `${label}${t.route.stops(routes[i].stops.length)}` : label,
    )
  }, [routes, info, t])

  const summary = useMemo(() => (stats && route ? summarizeRoute(route, stats, names) : null), [stats, route, names])

  // Esc closes just this pop-up: capture on window so the page-wide Esc handler (which would
  // also deselect a station) never sees it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  if (!route) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(2,6,13,0.55)] p-4 max-md:p-0"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="route-details-title"
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[90vh] card w-[min(860px,100%)] overflow-y-auto !rounded-xl !p-6 !shadow-[0_20px_60px_rgba(0,0,0,0.5)] max-md:h-full max-md:max-h-none max-md:w-full max-md:!rounded-none max-md:!px-4 max-md:!pt-[calc(14px+env(safe-area-inset-top))] max-md:!pb-[calc(24px+env(safe-area-inset-bottom))]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t.close}
          className="absolute top-2 right-2 flex h-11 w-11 cursor-pointer items-center justify-center text-lg text-(--card-ink-3) hover:text-(--card-ink) max-md:fixed max-md:top-[calc(6px+env(safe-area-inset-top))] max-md:right-2 max-md:z-10 max-md:rounded-full max-md:bg-(--card) max-md:text-(--card-ink) max-md:shadow-[0_2px_10px_rgba(0,0,0,0.25)]"
        >
          ✕
        </button>

        <h2 id="route-details-title" className="font-board m-0 pr-10 text-[32px] leading-tight font-semibold">
          {startName} → {endName}
        </h2>
        <div className="mt-0.5 text-[15px] text-(--card-ink-2)">
          {routes.length > 1 ? t.route.routeOf(active + 1, routes.length) : ''}
          {labels[active]}, {t.trains(route.trains)}, {period}
        </div>

        {routes.length > 1 && (
          // Phones: one native picker instead of a wall of tabs (up to a dozen routes), so the figures
          // stay near the top of the screen.
          <label className="mt-3 block md:hidden">
            <span className="mb-1 block text-sm text-(--card-ink-2)">{t.route.pickOne(routes.length)}</span>
            <select
              value={active}
              onChange={(e) => onActive(Number(e.target.value))}
              className="min-h-11 w-full cursor-pointer rounded-lg border border-[rgba(0,47,108,0.3)] bg-[rgba(255,255,255,0.35)] px-3 text-[15px] text-(--card-ink)"
            >
              {routes.map((r, i) => (
                <option key={i} value={i}>
                  {t.route.tab(i + 1, labels[i], r.trains)}
                </option>
              ))}
            </select>
          </label>
        )}
        {routes.length > 1 && (
          <div role="tablist" aria-label={t.route.tabsAria} className="mt-3 flex flex-wrap gap-2 max-md:hidden">
            {routes.map((r, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === active}
                onClick={() => onActive(i)}
                className={`cursor-pointer min-h-11 rounded-full border px-4 py-1 text-[15px] ${
                  i === active
                    ? 'border-(--card-ink) bg-(--card-ink) text-white'
                    : 'border-[rgba(0,47,108,0.3)] text-(--card-ink-2) hover:bg-[rgba(0,47,108,0.1)]'
                }`}
              >
                {t.route.tab(i + 1, labels[i], r.trains)}
              </button>
            ))}
          </div>
        )}

        {!summary && (
          <p className="mt-6 mb-2 text-sm text-(--card-ink-2)">
            {loadFailed ? t.route.failed : t.route.loading}
          </p>
        )}

        {summary && (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label={t.route.tileTrains(period)} value={f.int(summary.trains)} />
              <Tile label={t.route.tileLate} value={summary.avgLate === null ? '–' : t.min(summary.avgLate)} />
              <Tile label={t.route.tileOnTime} value={summary.onTimePct === null ? '–' : f.pct(summary.onTimePct, 0)} />
              <Tile label={t.route.tileCancelled} value={summary.cancelledPct === null ? '–' : f.pct(summary.cancelledPct, 1)} />
            </div>

            <h3 className="font-board mt-6 mb-1 text-[22px] font-semibold">{t.route.stopsTitle}</h3>
            <p className="m-0 mb-2 text-[15px] text-(--card-ink-2)">{t.route.stopsIntro(startName, endName)}</p>
            <StopChart stops={summary.stops.filter((s) => s.avg !== null)} />
            {/* The starting station never has arrivals, so it isn't counted as missing. */}
            {summary.stops.slice(1).some((s) => s.avg === null) && (
              <p className="m-0 mt-1 text-sm text-(--card-ink-3)">
                {t.route.stopsShown(summary.stops.filter((s) => s.avg !== null).length, summary.stops.length)}
              </p>
            )}
            {summary.insights.jump && (
              <p className="m-0 mt-1.5 text-[15px] text-(--card-ink)">
                {t.route.insightJump(summary.insights.jump.from, summary.insights.jump.to, summary.insights.jump.by)}
              </p>
            )}
            {summary.insights.latest && (
              <p className="m-0 mt-1.5 text-[15px] text-(--card-ink)">
                {t.route.insightLatest(summary.insights.latest.name, summary.insights.latest.avg)}
              </p>
            )}
            <details className="mt-2 text-[15px] text-(--card-ink-2)">
              <summary className="cursor-pointer">{t.route.stopNumbers}</summary>
              <div className="mt-2 max-h-[200px] overflow-y-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="text-(--card-ink-3)">
                      <th className="py-1 pr-3 font-normal">{t.route.colStop}</th>
                      <th className="py-1 pr-3 text-right font-normal">{t.route.colLate}</th>
                      <th className="py-1 text-right font-normal">{t.route.colTrains}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.stops.map((s) => (
                      <tr key={s.code} className="border-t border-(--card-line)">
                        <td className="py-1 pr-3">{s.name}</td>
                        <td className="py-1 pr-3 text-right">{s.avg === null ? '–' : t.min(s.avg)}</td>
                        <td className="py-1 text-right">{s.trains ? f.int(s.trains) : '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            <h3 className="font-board mt-6 mb-1 text-[22px] font-semibold">{t.route.runTitle}</h3>
            <p className="m-0 mb-2 text-[15px] text-(--card-ink-2)">{t.route.runIntro}</p>
            <ArrivalSplit onTime={summary.onTimePct} minor={summary.minorPct} major={summary.majorPct} />

            {trends && <OverTime trends={trends} route={route} year={year} />}

            {conditionDefs && <WeatherSection weather={summary.weather} defs={conditionDefs} period={period} />}

            <h3 className="font-board mt-6 mb-2 text-[22px] font-semibold">{t.route.servicesTitle}</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-[15px]">
                <thead>
                  <tr className="text-(--card-ink-3)">
                    <th className="py-1 pr-3 font-normal">{t.route.colTrain}</th>
                    <th className="py-1 pr-3 font-normal">{t.route.colJourney}</th>
                    <th className="py-1 pr-3 text-right font-normal">{t.route.colTrains}</th>
                    <th className="py-1 pr-3 text-right font-normal">{t.route.colLate}</th>
                    <th className="py-1 text-right font-normal">{t.route.colOnTime}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.services.map((s) => (
                    <tr key={s.id} className="border-t border-(--card-line)">
                      <td className="py-1.5 pr-3"><span className="font-board mr-1.5 text-lg font-semibold">{s.type}</span>{' '}{t.trainType(s.type)}</td>
                      <td className="py-1.5 pr-3">{s.journey}</td>
                      <td className="py-1.5 pr-3 text-right">{f.int(s.trains)}</td>
                      <td className="py-1.5 pr-3 text-right">{s.avg === null ? '–' : t.min(s.avg)}</td>
                      <td className="py-1.5 text-right">{s.onTime === null ? '–' : f.pct(s.onTime, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details className="mt-2 text-[15px] text-(--card-ink-2)">
              <summary className="min-h-11 cursor-pointer py-2">{t.route.moreNumbers}</summary>
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="text-(--card-ink-3)">
                    <th className="py-1 pr-3 font-normal">{t.route.colTrain}</th>
                    <th className="py-1 pr-3 font-normal">{t.route.colJourney}</th>
                    <th className="py-1 pr-3 text-right font-normal">{t.route.colWorst}</th>
                    <th className="py-1 text-right font-normal">{t.route.colCancelled}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.services.map((s) => (
                    <tr key={s.id} className="border-t border-(--card-line)">
                      <td className="py-1.5 pr-3"><span className="font-board mr-1.5 text-lg font-semibold">{s.type}</span>{' '}{t.trainType(s.type)}</td>
                      <td className="py-1.5 pr-3">{s.journey}</td>
                      <td className="py-1.5 pr-3 text-right">{s.p90 === null ? '–' : t.min(s.p90)}</td>
                      <td className="py-1.5 text-right">{s.cancelled === null ? '–' : f.pct(s.cancelled, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>

            <p className="m-0 mt-4 text-sm text-(--card-ink-3)">
              {t.route.footnote(period)}
              {summary.missingServices > 0 && t.route.missing(summary.missingServices)}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/** "Delay and weather": for each kind of bad weather, how many more of this route's trains than
 *  usual (same station, month and time of day) ran more than 5 min late. */
function WeatherSection({ weather, defs, period }: { weather: RouteSummary['weather']; defs: ConditionDef[]; period: string }) {
  const { t } = useLang()
  const any = defs.some((d) => weather[d.key])
  return (
    <>
      <h3 className="font-board mt-6 mb-1 text-[22px] font-semibold">{t.route.weatherTitle}</h3>
      {!any ? (
        <p className="m-0 text-[15px] text-(--card-ink-2)">{t.route.weatherNone(period)}</p>
      ) : (
        <>
          <p className="m-0 mb-2 text-[15px] text-(--card-ink-2)">{t.route.weatherIntro}</p>
          <ConditionList defs={defs} cells={weather} showCounts />
          <p className="m-0 mt-3 text-sm text-(--card-ink-3)">
            {t.conditions.key} {t.route.weatherSource} {t.conditions.caveat}
          </p>
        </>
      )}
    </>
  )
}

/** "Over the years": this route's delay for every month, and for each calendar month pooled over
 *  the years. Built from the saved month-by-month figures of the services on the route. */
function OverTime({ trends, route, year }: { trends: RouteTrendsFile; route: RoutePath; year: number | null }) {
  const { t } = useLang()
  const series = useMemo(() => combineServices(trends, route.sources), [trends, route])
  const bySeason = useMemo(() => seasonal(trends.months, series, year), [trends, series, year])
  if (series.avg.filter((v) => v !== null).length < 6) return null
  return (
    <>
      <h3 className="font-board mt-6 mb-1 text-[22px] font-semibold">{t.route.overTitle}</h3>
      <p className="m-0 mb-2 text-[15px] text-(--card-ink-2)">{t.route.overIntro(year)}</p>
      <MonthlyLine months={trends.months} avg={series.avg} year={year} height={200} ariaLabel={t.route.overAria} />
      <p className="m-0 mt-3 mb-1 text-[15px] text-(--card-ink-2)">{t.route.seasonIntro(year)}</p>
      <SeasonBars avg={bySeason.avg} height={170} ariaLabel={t.route.seasonAria} />
    </>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[rgba(0,47,108,0.15)] bg-[rgba(255,255,255,0.35)] px-3 py-2.5">
      <div className="font-board text-[40px] leading-none font-semibold">{value}</div>
      <div className="mt-1.5 text-sm text-(--card-ink-2)">{label}</div>
    </div>
  )
}

/** One stacked bar: on time / a bit late / very late, each segment labelled in text. */
function ArrivalSplit({ onTime, minor, major }: { onTime: number | null; minor: number | null; major: number | null }) {
  const { t, f } = useLang()
  if (onTime === null || minor === null || major === null) return <p className="m-0 text-[15px]">{t.route.noArrivals}</p>
  const parts = [
    { label: t.route.onTime, value: onTime, color: BLUE, text: 'text-white' },
    { label: t.route.bitLate, value: minor, color: AMBER, text: 'text-[#2b1b00]' },
    { label: t.route.veryLate, value: major, color: CRIMSON, text: 'text-white' },
  ]
  return (
    <div>
      <div className="flex h-8 w-full gap-0.5 overflow-hidden rounded-md" role="img" aria-label={parts.map((p) => `${p.label}: ${f.pct(p.value, 0)}`).join(', ')}>
        {parts.map((p) => (
          <div
            key={p.label}
            style={{ width: `${p.value}%`, background: p.color }}
            className={`flex items-center justify-center text-sm font-medium ${p.text}`}
          >
            {p.value >= 7 ? f.pct(p.value, 0) : ''}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-(--card-ink)">
        {parts.map((p) => (
          <span key={p.label} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
            {p.label}: {f.pct(p.value, 0)}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Bar chart (Chart.js, called directly like the rest of the map code): one bar per stop. */
function StopChart({ stops }: { stops: StopPoint[] }) {
  const { t, f } = useLang()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const values = stops.map((s) => s.avg)
    const top = Math.max(...values.map((v) => (v === null ? -Infinity : v)))
    const n = stops.length
    // Name only some stops on the axis so labels never overlap on long routes; the tooltip and the
    // table below the chart cover the rest.
    const step = Math.max(1, Math.ceil(n / 12))
    const showTick = (i: number) => i === n - 1 || (i % step === 0 && n - 1 - i >= step / 2)

    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: stops.map((s) => s.name),
        datasets: [{
          data: values,
          backgroundColor: values.map((v) => (v !== null && v === top ? CRIMSON : BLUE)),
          borderRadius: { topLeft: 2, topRight: 2 },
          maxBarThickness: 14,
          categoryPercentage: 0.85,
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
              title: (items) => stops[items[0].dataIndex].name,
              label: (ctx) => {
                const s = stops[ctx.dataIndex]
                return t.route.stopTip(s.avg ?? 0, s.trains)
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              autoSkip: false, minRotation: 50, maxRotation: 50, color: INK, font: { size: 13, family: 'Barlow, system-ui, sans-serif' },
              callback: (_value, index) => (showTick(index) ? stops[index].name : ''),
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: GRID },
            ticks: { color: INK },
            title: { display: true, text: t.charts.minutesLate, color: SOFT },
          },
        },
      },
    })
    return () => chart.destroy()
  }, [stops, t, f])

  return (
    <div className="relative h-[250px]">
      <canvas ref={canvasRef} role="img" aria-label={t.route.stopAria} />
    </div>
  )
}
