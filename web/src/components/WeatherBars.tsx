export interface WeatherBarRow {
  /** Arrivals in this band, and the share of them more than 5 min late. */
  n: number
  latePct: number
}

interface WeatherBarsProps {
  title: string
  labels: string[]
  /** One row per label; null = too few trains to show a number. */
  rows: (WeatherBarRow | null)[]
  /** The % at which a bar is full, shared between groups so they compare. */
  scaleMax: number
}

/**
 * One group of bars ("Late by temperature"). Plain CSS bars with the number written beside each,
 * so nothing depends on colour or on hovering: three rows don't need a charting library.
 */
export default function WeatherBars({ title, labels, rows, scaleMax }: WeatherBarsProps) {
  return (
    <div className="min-w-0">
      <h4 className="m-0 mb-2 text-[15px] font-medium text-(--card-ink)">{title}</h4>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {labels.map((label, i) => {
          const row = rows[i]
          return (
            <li key={label}>
              <div className="flex items-baseline justify-between gap-3 text-[15px] text-(--card-ink-2)">
                <span>{label}</span>
                {row ? (
                  <span className="shrink-0">
                    <span className="font-board text-[22px] leading-none font-semibold text-(--card-ink)">{row.latePct.toFixed(0)}%</span>
                    <span className="ml-1.5 text-sm text-(--card-ink-3)">{row.n.toLocaleString('en-GB')} arrivals</span>
                  </span>
                ) : (
                  <span className="shrink-0 text-sm text-(--card-ink-3)">Not enough trains</span>
                )}
              </div>
              <div className="mt-1 h-2.5 rounded-full bg-[rgba(0,47,108,0.12)]" aria-hidden="true">
                {row && (
                  <div
                    className="h-full rounded-full bg-(--card-ink)"
                    style={{ width: `${Math.max(2, Math.min(100, (row.latePct / scaleMax) * 100))}%` }}
                  />
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
