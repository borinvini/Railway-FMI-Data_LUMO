import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js'
import { useEffect, useMemo, useRef } from 'react'
import { summarizeRoute, viaLabel, type StationInfo, type StopPoint } from '../lib/routeStats'
import type { RoutePath, RouteStatsFile, StationFeature } from '../lib/types'

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
  onClose: () => void
}

const stripAsema = (s: string) => s.replace(/ asema$/, '')

/**
 * Pop-up in front of the map with the saved statistics for one highlighted route: headline
 * numbers, how late trains are at each stop, how arrivals split into on time / a bit late / very
 * late, and a table of the train services that run the route. When several routes are
 * highlighted, tabs switch between them.
 */
export default function RouteDetails({ routes, active, onActive, startName, endName, stations, stats, loadFailed, onClose }: RouteDetailsProps) {
  const info = useMemo(
    () => new Map<string, StationInfo>(stations.map((s) => [s.code, { name: stripAsema(s.name), runs: s.runs, lat: s.lat, lon: s.lon }])),
    [stations],
  )
  const names = useMemo(() => new Map([...info].map(([code, i]) => [code, i.name])), [info])
  const route = routes[active]

  const labels = useMemo(() => {
    const raw = routes.map((r) => viaLabel(r, info))
    // Two routes can share the same "via": tell them apart by the train types that run them,
    // and if those match too (they differ only in skipped stops), by their number of stops.
    const types = (r: RoutePath) => Object.entries(r.byType).sort((x, y) => y[1] - x[1]).map(([t]) => t).join(', ')
    const withTypes = raw.map((label, i) => (raw.filter((l) => l === label).length > 1 ? `${label} · ${types(routes[i])}` : label))
    return withTypes.map((label, i) =>
      withTypes.filter((l) => l === label).length > 1 ? `${label} (${routes[i].stops.length} stops)` : label,
    )
  }, [routes, info])

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
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(2,6,13,0.55)] p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="route-details-title"
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[90vh] card w-[min(860px,100%)] overflow-y-auto !rounded-xl !p-6 !shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-2 right-2 flex h-11 w-11 cursor-pointer items-center justify-center text-lg text-(--card-ink-3) hover:text-(--card-ink)"
        >
          ✕
        </button>

        <h2 id="route-details-title" className="font-board m-0 pr-10 text-[32px] leading-tight font-semibold">
          {startName} → {endName}
        </h2>
        <div className="mt-0.5 text-[15px] text-(--card-ink-2)">
          {routes.length > 1 ? `Route ${active + 1} of ${routes.length}: ` : ''}
          {labels[active]}, {route.trains} trains in January
        </div>

        {routes.length > 1 && (
          <div role="tablist" aria-label="Routes between these stations" className="mt-3 flex flex-wrap gap-2">
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
                Route {i + 1}: {labels[i]}, {r.trains} trains
              </button>
            ))}
          </div>
        )}

        {!summary && (
          <p className="mt-6 mb-2 text-sm text-(--card-ink-2)">
            {loadFailed ? 'Could not load the statistics. Please try again.' : 'Loading statistics…'}
          </p>
        )}

        {summary && (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="Trains in January" value={String(summary.trains)} />
              <Tile label="Typically late at stops" value={summary.avgLate === null ? '–' : `${summary.avgLate.toFixed(1)} min`} />
              <Tile label="On time (up to 5 min late)" value={summary.onTimePct === null ? '–' : `${summary.onTimePct.toFixed(0)}%`} />
              <Tile label="Cancelled" value={summary.cancelledPct === null ? '–' : `${summary.cancelledPct.toFixed(1)}%`} />
            </div>

            <h3 className="font-board mt-6 mb-1 text-[22px] font-semibold">How late trains are at each stop</h3>
            <p className="m-0 mb-2 text-[15px] text-(--card-ink-2)">
              Typical minutes late when trains arrive at each stop, from {startName} to {endName}.
            </p>
            <StopChart stops={summary.stops.filter((s) => s.avg !== null)} />
            {/* The starting station never has arrivals, so it isn't counted as missing. */}
            {summary.stops.slice(1).some((s) => s.avg === null) && (
              <p className="m-0 mt-1 text-sm text-(--card-ink-3)">
                Showing {summary.stops.filter((s) => s.avg !== null).length} of {summary.stops.length} stops: the rest
                have no saved figures, because these trains usually run a different way.
              </p>
            )}
            {summary.insights.map((line) => (
              <p key={line} className="m-0 mt-1.5 text-[15px] text-(--card-ink)">{line}</p>
            ))}
            <details className="mt-2 text-[15px] text-(--card-ink-2)">
              <summary className="cursor-pointer">Show the stop-by-stop numbers</summary>
              <div className="mt-2 max-h-[200px] overflow-y-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="text-(--card-ink-3)">
                      <th className="py-1 pr-3 font-normal">Stop</th>
                      <th className="py-1 pr-3 text-right font-normal">Typically late</th>
                      <th className="py-1 text-right font-normal">Trains</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.stops.map((s) => (
                      <tr key={s.code} className="border-t border-(--card-line)">
                        <td className="py-1 pr-3">{s.name}</td>
                        <td className="py-1 pr-3 text-right">{s.avg === null ? '–' : `${s.avg.toFixed(1)} min`}</td>
                        <td className="py-1 text-right">{s.trains || '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            <h3 className="font-board mt-6 mb-1 text-[22px] font-semibold">How trains run</h3>
            <p className="m-0 mb-2 text-[15px] text-(--card-ink-2)">
              Share of trains by how late they were on average along their journey.
            </p>
            <ArrivalSplit onTime={summary.onTimePct} minor={summary.minorPct} major={summary.majorPct} />

            <h3 className="font-board mt-6 mb-2 text-[22px] font-semibold">Train services on this route</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-[15px]">
                <thead>
                  <tr className="text-(--card-ink-3)">
                    <th className="py-1 pr-3 font-normal">Train</th>
                    <th className="py-1 pr-3 font-normal">Journey</th>
                    <th className="py-1 pr-3 text-right font-normal">Trains</th>
                    <th className="py-1 pr-3 text-right font-normal">Typically late</th>
                    <th className="py-1 text-right font-normal">On time</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.services.map((s) => (
                    <tr key={s.id} className="border-t border-(--card-line)">
                      <td className="py-1.5 pr-3 font-medium">{s.type}</td>
                      <td className="py-1.5 pr-3">{s.journey}</td>
                      <td className="py-1.5 pr-3 text-right">{s.trains}</td>
                      <td className="py-1.5 pr-3 text-right">{s.avg === null ? '–' : `${s.avg.toFixed(1)} min`}</td>
                      <td className="py-1.5 text-right">{s.onTime === null ? '–' : `${s.onTime.toFixed(0)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details className="mt-2 text-[15px] text-(--card-ink-2)">
              <summary className="min-h-11 cursor-pointer py-2">More numbers</summary>
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="text-(--card-ink-3)">
                    <th className="py-1 pr-3 font-normal">Train</th>
                    <th className="py-1 pr-3 font-normal">Journey</th>
                    <th className="py-1 pr-3 text-right font-normal">Worst 10% of trips late by</th>
                    <th className="py-1 text-right font-normal">Cancelled</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.services.map((s) => (
                    <tr key={s.id} className="border-t border-(--card-line)">
                      <td className="py-1.5 pr-3 font-medium">{s.type}</td>
                      <td className="py-1.5 pr-3">{s.journey}</td>
                      <td className="py-1.5 pr-3 text-right">{s.p90 === null ? '–' : `${s.p90.toFixed(1)} min`}</td>
                      <td className="py-1.5 text-right">{s.cancelled === null ? '–' : `${s.cancelled.toFixed(1)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>

            <p className="m-0 mt-4 text-sm text-(--card-ink-3)">
              January 2020. Headline numbers and the table cover the whole journeys of the trains that
              run this route, which may start before or continue past it; the stop-by-stop figures use
              each stop&apos;s own arrivals.
              {summary.missingServices > 0 && ` ${summary.missingServices} service(s) have no saved statistics.`}
            </p>
          </>
        )}
      </div>
    </div>
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
  if (onTime === null || minor === null || major === null) return <p className="m-0 text-[15px]">No arrival data.</p>
  const parts = [
    { label: 'On time (up to 5 min late)', value: onTime, color: BLUE, text: 'text-white' },
    { label: 'A bit late (5–15 min)', value: minor, color: AMBER, text: 'text-[#2b1b00]' },
    { label: 'Very late (over 15 min)', value: major, color: CRIMSON, text: 'text-white' },
  ]
  return (
    <div>
      <div className="flex h-8 w-full gap-0.5 overflow-hidden rounded-md" role="img" aria-label={parts.map((p) => `${p.label}: ${p.value.toFixed(0)}%`).join(', ')}>
        {parts.map((p) => (
          <div
            key={p.label}
            style={{ width: `${p.value}%`, background: p.color }}
            className={`flex items-center justify-center text-sm font-medium ${p.text}`}
          >
            {p.value >= 7 ? `${p.value.toFixed(0)}%` : ''}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-(--card-ink)">
        {parts.map((p) => (
          <span key={p.label} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
            {p.label}: {p.value.toFixed(0)}%
          </span>
        ))}
      </div>
    </div>
  )
}

/** Bar chart (Chart.js, called directly like the rest of the map code): one bar per stop. */
function StopChart({ stops }: { stops: StopPoint[] }) {
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
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(6,16,31,0.92)',
            callbacks: {
              title: (items) => stops[items[0].dataIndex].name,
              label: (ctx) => {
                const s = stops[ctx.dataIndex]
                return `${(s.avg ?? 0).toFixed(1)} min late · ${s.trains} trains`
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
            title: { display: true, text: 'Minutes late', color: SOFT },
          },
        },
      },
    })
    return () => chart.destroy()
  }, [stops])

  return (
    <div className="relative h-[250px]">
      <canvas ref={canvasRef} role="img" aria-label="Bar chart of the typical minutes late at each stop along the route" />
    </div>
  )
}
