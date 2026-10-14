import type { Plugin } from 'chart.js'
import { getLiveKm } from './liveStore'

/**
 * A thin dashed vertical line at the train's current distance, drawn on every Live chart so the
 * charts read as one timeline with the train on it. Chart.js plugin; the charts redraw it each frame
 * because their data update (lib/liveStore.ts) triggers a draw.
 */
export const liveCursor: Plugin = {
  id: 'liveCursor',
  afterDatasetsDraw(chart) {
    const x = chart.scales.x?.getPixelForValue(getLiveKm())
    const { top, bottom, left, right } = chart.chartArea
    if (x === undefined || Number.isNaN(x) || x < left || x > right) return
    const ctx = chart.ctx
    ctx.save()
    ctx.strokeStyle = 'rgba(234, 241, 248, 0.5)'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(x, top)
    ctx.lineTo(x, bottom)
    ctx.stroke()
    ctx.restore()
  },
}
