import { Chart, Filler, LinearScale, LineController, LineElement, PointElement } from 'chart.js'
import { useEffect, useRef } from 'react'
import { rgbCss, routeBadgeStep, ROUTE_BADGE_STEPS } from '../lib/colors'
import { liveCursor } from '../lib/liveCursor'
import { delayUpTo, type DelayProfile, type ProfilePoint } from '../lib/liveProfile'
import { subscribeLiveKm } from '../lib/liveStore'

Chart.register(LineController, LineElement, PointElement, LinearScale, Filler)

const MUTED = '#8597ab'
const GRID = 'rgba(156, 195, 232, 0.12)'
const FONT = "'Barlow Condensed', Barlow, system-ui, sans-serif"

/** The thresholds between the three delay colours, minutes (see ROUTE_BADGE_STEPS). */
const LEVELS = [2, 5]

const levelColor = (minutes: number) => rgbCss(routeBadgeStep(minutes).fill)

/**
 * The delay chart for a Live run: the monthly average delay at each station, as a line that grows with
 * the train. Colour keeps meaning delay: each segment of the line takes the colour of its level (blue
 * under 2 min, amber 2-5, crimson over 5, the same as the delay badges on the map used to be), and the
 * area under it is banded in the same three colours, so the thresholds are visible at a glance. Axes
 * are fixed from the whole route.
 */
export default function LiveDelayChart({ profile }: { profile: DelayProfile }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const chart = new Chart<'line', ProfilePoint[]>(canvas, {
      type: 'line',
      plugins: [liveCursor],
      data: {
        datasets: [{
          label: 'Delay', data: [] as ProfilePoint[], parsing: false, tension: 0, spanGaps: true,
          borderWidth: 3, borderColor: levelColor(0),
          // Each stretch of the line is coloured by its own level.
          segment: { borderColor: (c) => levelColor(((c.p0.parsed.y ?? 0) + (c.p1.parsed.y ?? 0)) / 2) },
          fill: 'origin',
          // The area under the line is banded at the thresholds, hard-edged, in the same colours.
          backgroundColor: (c) => {
            const { chart: ch } = c
            const area = ch.chartArea
            const y = ch.scales.y
            if (!area || !y) return 'transparent'
            const g = ch.ctx.createLinearGradient(0, area.bottom, 0, area.top)
            const at = (v: number) => Math.min(1, Math.max(0, (area.bottom - y.getPixelForValue(v)) / (area.bottom - area.top)))
            const band = (minutes: number) => {
              const [r, gr, b] = routeBadgeStep(minutes).fill
              return `rgba(${r}, ${gr}, ${b}, 0.34)`
            }
            g.addColorStop(0, band(0))
            g.addColorStop(at(LEVELS[0]), band(0))
            g.addColorStop(at(LEVELS[0]), band(3))
            g.addColorStop(at(LEVELS[1]), band(3))
            g.addColorStop(at(LEVELS[1]), band(8))
            g.addColorStop(1, band(8))
            return g
          },
          // A dot at the head, in the colour of the level the train is at.
          pointRadius: (c) => (c.dataIndex === c.dataset.data.length - 1 ? 5 : 0),
          pointBackgroundColor: (c) => levelColor((c.raw as ProfilePoint | undefined)?.y ?? 0),
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        events: [],
        layout: { padding: { top: 4, left: 2, right: 6 } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: {
            type: 'linear', min: 0, max: profile.totalKm,
            grid: { display: false },
            border: { color: GRID },
            ticks: {
              color: MUTED, font: { size: 12, family: FONT }, maxRotation: 0, autoSkip: false,
              callback: (value) => {
                const v = Number(value)
                if (v === 0) return profile.startName
                if (Math.abs(v - profile.totalKm) < 1e-6) return profile.endName
                return ''
              },
              stepSize: profile.totalKm,
            },
          },
          y: {
            min: 0, max: profile.max,
            border: { display: false },
            grid: { color: GRID },
            ticks: { color: MUTED, font: { size: 13, family: FONT }, stepSize: profile.step, callback: (v) => `${v} min` },
          },
        },
      },
    })

    const unsubscribe = subscribeLiveKm((km) => {
      chart.data.datasets[0].data = delayUpTo(profile, km)
      chart.update('none')
    })
    return () => {
      unsubscribe()
      chart.destroy()
    }
  }, [profile])

  return (
    <div className="pointer-events-auto rounded-[10px] border border-(--line) bg-(--surface) px-[18px] pt-3 pb-2.5 backdrop-blur-[8px]">
      <div className="text-sm text-(--muted)">Delay at each station, monthly average</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm text-(--muted)">
        {ROUTE_BADGE_STEPS.map((step) => (
          <span key={step.label} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: rgbCss(step.fill) }} />
            {step.label}
          </span>
        ))}
      </div>
      <div className="relative mt-2 h-[150px]">
        <canvas ref={canvasRef} role="img" aria-label="Line chart of the average delay at each station along the route, drawn as the train moves" />
      </div>
    </div>
  )
}
