import { useLang } from '../i18n'
import type { ConditionDef, Conditions } from '../lib/types'

/** "+8", "−1" (a real minus sign) or "0": extra late trains per 100, rounded. */
export function signed(v: number): string {
  const r = Math.round(v)
  return r > 0 ? `+${r}` : r < 0 ? `−${Math.abs(r)}` : '0'
}

interface ConditionListProps {
  defs: ConditionDef[]
  /** The conditions with enough arrivals (see build_data `condition_cells`); null = none. */
  cells: Conditions | null
  /** Show only the N conditions that stand out most. */
  limit?: number
  /** Per condition: [years later than usual, years with data] (all-years view only). */
  yearsAbove?: Record<string, [number, number]> | null
  /** Add the number of arrivals behind each figure. */
  showCounts?: boolean
}

/**
 * "Late trains in bad weather": for each weather condition, how many MORE trains per 100 ran more
 * than 5 minutes late than is usual at the same station, in the same month and time of day. The
 * baseline is local, so the cold north or a busy winter cannot produce the gap by itself. Plain
 * rows with the number written out, so nothing depends on colour (colour means delay on the map).
 * The names come from summary.json (English); other languages name them by key in i18n.
 */
export default function ConditionList({ defs, cells, limit, yearsAbove, showCounts }: ConditionListProps) {
  const { t } = useLang()
  let rows = defs.flatMap((d) => {
    const c = cells?.[d.key]
    return c ? [{ def: d, n: c[0], latePct: c[1], excess: c[2] }] : []
  })
  if (limit !== undefined) rows = [...rows].sort((a, b) => b.excess - a.excess).slice(0, limit)
  if (rows.length === 0) return null

  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {rows.map(({ def, n, latePct, excess }) => {
        const years = yearsAbove?.[def.key]
        const name = t.conditions.names[def.key] ?? def
        return (
          <li key={def.key} className="flex items-baseline justify-between gap-3 border-t border-(--card-line) py-1.5 first:border-t-0">
            <div className="min-w-0 text-[15px] leading-snug text-(--card-ink)">
              {name.label}
              <span className="block text-sm text-(--card-ink-3)">
                {name.detail}
                {showCounts && t.conditions.counts(n, latePct)}
                {years && years[1] > 1 && t.conditions.yearsAbove(years[0], years[1])}
              </span>
            </div>
            <div className="shrink-0 text-right" aria-label={t.conditions.aria(signed(excess))}>
              <span className="font-board text-[28px] leading-none font-semibold text-(--card-ink)">{signed(excess)}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
