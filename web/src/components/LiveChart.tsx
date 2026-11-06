import { Chart, Filler, LinearScale, LineController, LineElement, PointElement } from 'chart.js'
import { useEffect, useRef } from 'react'
import { liveCursor } from '../lib/liveCursor'
import { subscribeLiveKm } from '../lib/liveStore'
import { profileUpTo, type LiveProfile, type ProfilePoint } from '../lib/liveProfile'
import { useLang } from '../i18n'
import { chartBox, liveCardClass, liveTickFont } from '../lib/liveChartStyle'

Chart.register(LineController, LineElement, PointElement, LinearScale, Filler)

// Colours on the weather chart are chosen to stay clear of the delay colours (blue, amber, crimson on
// the delay chart): a mint-teal line for temperature, ice blue for the snow.
const TEMP = '#5eead4'
const SNOW = '#9cc3e8'
const MUTED = '#8597ab'
const GRID = 'rgba(156, 195, 232, 0.12)'

/**
 * The weather chart for a Live run: temperature and snow depth along the route, drawn as the train
 * runs. Axes are fixed from the whole route so nothing rescales while it fills in; the data is
 * pushed straight into Chart.js from the animation loop's distance (lib/liveStore.ts), never through
 * React state. Averages at each stop, not readings.
 */
export default function LiveChart({ profile, chartHeight = 170, title = true, grow = false }: { profile: LiveProfile; chartHeight?: number; title?: boolean; grow?: boolean }) {
  // Only the words around the chart change with the language; the axes hold numbers and names.
  const { t } = useLang()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const chart = new Chart<'line', ProfilePoint[]>(canvas, {
      type: 'line',
      plugins: [liveCursor],
      data: {
        datasets: [
          {
            label: 'Temperature', data: [] as ProfilePoint[], yAxisID: 'yTemp', parsing: false,
            borderColor: TEMP, backgroundColor: TEMP, borderWidth: 2.5, tension: 0, spanGaps: true,
            pointRadius: (c) => (c.dataIndex === c.dataset.data.length - 1 ? 4.5 : 0), pointBackgroundColor: TEMP,
          },
          {
            label: 'Snow depth', data: [] as ProfilePoint[], yAxisID: 'ySnow', parsing: false,
            borderColor: SNOW, backgroundColor: 'rgba(156, 195, 232, 0.28)', borderWidth: 1.5, tension: 0, spanGaps: true,
            fill: 'origin', pointRadius: (c) => (c.dataIndex === c.dataset.data.length - 1 ? 3.5 : 0), pointBackgroundColor: SNOW,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        events: [],
        layout: { padding: { top: 4, right: 2 } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: {
            type: 'linear', min: 0, max: profile.totalKm,
            grid: { display: false },
            border: { color: GRID },
            ticks: {
              color: MUTED, font: liveTickFont(), maxRotation: 0, autoSkip: false,
              // Only the two ends are labelled, with the station names.
              callback: (value) => {
                const v = Number(value)
                if (v === 0) return profile.startName
                if (Math.abs(v - profile.totalKm) < 1e-6) return profile.endName
                return ''
              },
              stepSize: profile.totalKm,
            },
          },
          yTemp: {
            position: 'left', min: profile.tempMin, max: profile.tempMax,
            border: { display: false },
            grid: {
              // 0 °C (frost / thaw) is the one line that is emphasised.
              color: (ctx) => (ctx.tick.value === 0 ? 'rgba(94, 234, 212, 0.55)' : GRID),
              lineWidth: (ctx) => (ctx.tick.value === 0 ? 1.5 : 1),
            },
            ticks: { color: TEMP, font: liveTickFont(1), stepSize: profile.tempStep, callback: (v) => `${v}°` },
          },
          ySnow: {
            position: 'right', min: 0, max: profile.snowMax,
            border: { display: false },
            grid: { drawOnChartArea: false },
            ticks: { color: SNOW, font: liveTickFont(1), stepSize: profile.snowStep, callback: (v) => `${v} cm` },
          },
        },
      },
    })

    const unsubscribe = subscribeLiveKm((km) => {
      const { temp, snow } = profileUpTo(profile, km)
      chart.data.datasets[0].data = temp
      chart.data.datasets[1].data = snow
      chart.update('none')
    })
    return () => {
      unsubscribe()
      chart.destroy()
    }
  }, [profile])

  const box = chartBox(grow, chartHeight)
  return (
    <div className={liveCardClass(grow)}>
      {title && <div className="text-(length:--live-small) text-(--muted)">{t.live.weatherTitle}</div>}
      <div className="mt-1 flex items-center gap-4 text-(length:--live-small) text-(--muted)">
        <span className="flex shrink-0 items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: TEMP }} />
            {t.live.temperature}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: 'rgba(156,195,232,0.45)', borderTop: `2px solid ${SNOW}` }} />
            {t.live.snowDepth}
          </span>
        </span>
      </div>
      <div className={box.className} style={box.style}>
        <canvas ref={canvasRef} role="img" aria-label={t.live.weatherAria} />
      </div>
    </div>
  )
}
