// Shared sizing for the two Play the journey charts (LiveDelayChart, LiveChart). On desktop they
// grow with the screen; on phones they keep a fixed height.

const FONT = "'Barlow Condensed', Barlow, system-ui, sans-serif"

/** Axis type for the journey charts: grows with the chart's width (12 px on a 380 px card, up to
 *  18 px on a wide screen), plus `extra` for the value axes. A Chart.js scriptable font. */
export const liveTickFont = (extra = 0) => (c: { chart: { width: number } }) => ({
  size: Math.round(Math.min(18, Math.max(12, c.chart.width / 30))) + extra,
  family: FONT,
})

/** Where the chart sits in its card: a fixed height, or (`grow`) the rest of a flex column. */
export function chartBox(grow: boolean, chartHeight: number) {
  return grow
    ? { className: 'relative mt-2 min-h-[110px] flex-1', style: undefined }
    : { className: 'relative mt-2', style: { height: chartHeight } }
}

/** The chart card's surface; `grow` makes it take its share of the column's height. */
export const liveCardClass = (grow: boolean) =>
  `pointer-events-auto rounded-[10px] border border-(--line) bg-(--surface) px-(--live-pad) pt-3 pb-2.5 backdrop-blur-[8px]${grow ? ' flex min-h-0 flex-1 flex-col' : ''}`
