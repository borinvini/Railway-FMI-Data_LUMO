import {
  BarController, BarElement, CategoryScale, Chart, LineController, LineElement, LinearScale, PointElement, Tooltip,
} from 'chart.js'
import { useEffect, useRef } from 'react'
import { MONTH_NAMES, MONTH_SHORT, monthTitle } from '../lib/trends'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, LineController, LineElement, PointElement, Tooltip)

// Chart ink on the light card (same palette as RouteDetails): flag blue, the latest months in red.
const BLUE = '#002f6c'
const LIGHT_RED: [number, number, number] = [0xf2, 0xaa, 0xb2]
const DARK_RED: [number, number, number] = [0xc1, 0x21, 0x3d]
/** Minutes late at the light end and the crimson end of the red scale. */
const RED_LOW = 5.0
const RED_HIGH = 13.8

/** Red for a delay in minutes: light red at RED_LOW, crimson at RED_HIGH, linear between, clamped. */
const redFor = (minutes: number) => {
  const t = Math.min(1, Math.max(0, (minutes - RED_LOW) / (RED_HIGH - RED_LOW)))
  const [r, g, b] = LIGHT_RED.map((c, k) => Math.round(c + (DARK_RED[k] - c) * t))
  return `rgb(${r}, ${g}, ${b})`
}
const INK = '#243f5e'
const SOFT = '#3f5873'
const FADED = 'rgba(0, 47, 108, 0.28)'
const GRID = 'rgba(0, 47, 108, 0.14)'
const FONT = 'Barlow, system-ui, sans-serif'

/** Segments of the line outside the picked year are drawn faint, so the year stands out. */
const segmentColor = (months: string[], year: number | null) => (ctx: { p1DataIndex: number }) =>
  year === null || months[ctx.p1DataIndex].startsWith(String(year)) ? BLUE : FADED

interface MonthlyLineProps {
  months: string[]
  /** Average minutes late per month; null = no trains that month (a gap in the line). */
  avg: (number | null)[]
  /** The picked year, drawn strong while the others fade; null draws everything strong. */
  year: number | null
  ariaLabel: string
  height?: number
}

/** The delay of every month as one line. Chart.js is called directly, like the other charts. */
export function MonthlyLine({ months, avg, year, ariaLabel, height = 220 }: MonthlyLineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const multiYear = new Set(months.map((m) => m.slice(0, 4))).size > 1
    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: months,
        datasets: [{
          data: avg,
          borderColor: BLUE,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: BLUE,
          tension: 0.25,
          spanGaps: false,
          segment: { borderColor: segmentColor(months, year) },
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 250 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(6,16,31,0.92)',
            callbacks: {
              title: (items) => monthTitle(months[items[0].dataIndex]),
              label: (ctx) => (ctx.parsed.y === null ? 'No trains' : `${ctx.parsed.y.toFixed(1)} min late on average`),
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              autoSkip: false, maxRotation: 0, color: INK, font: { size: 13, family: FONT },
              // A label at each January (the year); for a single year, a short month name instead.
              callback: (_v, i) =>
                multiYear ? (months[i].endsWith('-01') ? months[i].slice(0, 4) : '') : MONTH_SHORT[Number(months[i].slice(5, 7)) - 1],
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: GRID },
            ticks: { color: INK, font: { size: 13, family: FONT } },
            title: { display: true, text: 'Minutes late', color: SOFT },
          },
        },
      },
    })
    return () => chart.destroy()
  }, [months, avg, year])

  return (
    <div className="relative" style={{ height }}>
      <canvas ref={canvasRef} role="img" aria-label={ariaLabel} />
    </div>
  )
}

interface SeasonBarsProps {
  /** Average minutes late for January...December, pooled over the years; null = no trains. */
  avg: (number | null)[]
  ariaLabel: string
  height?: number
}

/** Twelve bars, one per calendar month: when in the year trains run later. The four latest months
 *  are picked out in a red scale (5.0 min = light red, 13.8 min = crimson); below 5.0 min, and all other months, stay blue. */
export function SeasonBars({ avg, ariaLabel, height = 200 }: SeasonBarsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // The four latest months get a red from the scale (light red at RED_LOW minutes up to crimson at
    // RED_HIGH, clamped), so the shade tells the size of the delay; the other months stay blue.
    const topMonths = new Set(
      avg
        .flatMap((v, i) => (v === null ? [] : [{ v, i }]))
        .sort((a, b) => b.v - a.v)
        .slice(0, 4)
        .map((m) => m.i),
    )
    const colors = avg.map((v, i) => (v !== null && v >= RED_LOW && topMonths.has(i) ? redFor(v) : BLUE))
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: MONTH_SHORT,
        datasets: [{
          data: avg,
          backgroundColor: colors,
          borderRadius: { topLeft: 2, topRight: 2 },
          maxBarThickness: 36,
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
              title: (items) => MONTH_NAMES[items[0].dataIndex],
              label: (ctx) => (ctx.parsed.y === null ? 'No trains' : `${ctx.parsed.y.toFixed(1)} min late on average`),
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: INK, font: { size: 13, family: FONT } } },
          y: {
            beginAtZero: true,
            grid: { color: GRID },
            ticks: { color: INK, font: { size: 13, family: FONT } },
            title: { display: true, text: 'Minutes late', color: SOFT },
          },
        },
      },
    })
    return () => chart.destroy()
  }, [avg])

  return (
    <div className="relative" style={{ height }}>
      <canvas ref={canvasRef} role="img" aria-label={ariaLabel} />
    </div>
  )
}

/** A tiny, axis-free version of the monthly line for the title card. Not interactive itself: the
 *  card wraps it in a button that opens the full charts. */
export function Sparkline({ months, avg, year }: { months: string[]; avg: (number | null)[]; year: number | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: months,
        datasets: [{
          data: avg,
          borderColor: BLUE,
          borderWidth: 1.75,
          pointRadius: 0,
          tension: 0.25,
          segment: { borderColor: segmentColor(months, year) },
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        events: [],
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false, beginAtZero: true } },
      },
    })
    return () => chart.destroy()
  }, [months, avg, year])

  return (
    <div className="relative h-11">
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  )
}
