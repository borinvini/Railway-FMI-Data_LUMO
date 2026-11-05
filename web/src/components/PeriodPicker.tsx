import { useLang } from '../i18n'
import { ALL, type Period } from '../lib/period'

interface PeriodPickerProps {
  years: number[]
  period: Period
  onPeriod: (p: Period) => void
  /** Tailwind grid-columns class for the year chips: "All years" spans two columns, each year one. */
  yearColumns?: string
  /** Tailwind grid-columns class for the twelve month chips. */
  monthColumns?: string
  className?: string
}

/**
 * How the figures are cut (By year / By month), then which one: "All years" plus one chip per
 * year, or one chip per calendar month (all years pooled). Shared by the title card and the "How
 * delays changed" pop-up, so the period can be changed without leaving either. Both modes are two
 * rows of chips, so the card keeps its height when the mode changes.
 */
export default function PeriodPicker({
  years, period, onPeriod, yearColumns = 'grid-cols-5', monthColumns = 'grid-cols-6', className = '',
}: PeriodPickerProps) {
  const { t, f } = useLang()
  const byMonth = period.kind === 'month'
  return (
    <div className={className}>
      <div role="group" aria-label={t.summary.modeGroup} className="mb-2 flex rounded-full border border-[rgba(0,47,108,0.3)] p-[3px]">
        <ModeButton active={!byMonth} onClick={() => byMonth && onPeriod(ALL)}>{t.summary.byYear}</ModeButton>
        <ModeButton active={byMonth} onClick={() => !byMonth && onPeriod({ kind: 'month', month: new Date().getMonth() + 1 })}>
          {t.summary.byMonth}
        </ModeButton>
      </div>
      {byMonth ? (
        <div role="group" aria-label={t.summary.monthGroup} className={`grid gap-x-1 gap-y-1.5 ${monthColumns}`}>
          {f.monthsShort.map((short, i) => (
            <Chip
              key={short}
              active={period.month === i + 1}
              onClick={() => onPeriod({ kind: 'month', month: i + 1 })}
              label={f.months[i]}
              // The condensed face keeps the longest Finnish names ("maalis", "marras") inside a chip.
              className="font-board !px-0 !text-[15px] tracking-[-0.02em]"
            >
              {short}
            </Chip>
          ))}
        </div>
      ) : (
        <div role="group" aria-label={t.summary.yearGroup} className={`grid gap-1.5 ${yearColumns}`}>
          <Chip active={period.kind === 'all'} onClick={() => onPeriod(ALL)} className="col-span-2">{t.summary.allYearsChip}</Chip>
          {years.map((y) => (
            <Chip key={y} active={period.kind === 'year' && period.year === y} onClick={() => onPeriod({ kind: 'year', year: y })}>{y}</Chip>
          ))}
        </div>
      )}
    </div>
  )
}

/** One half of the mode switch: quieter than the chips (smaller, filled only when on). */
function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-9 flex-1 cursor-pointer rounded-full text-[15px] ${
        active ? 'bg-[rgba(0,47,108,0.16)] font-semibold text-(--card-ink)' : 'bg-transparent text-(--card-ink-2) hover:bg-[rgba(0,47,108,0.08)]'
      }`}
    >
      {children}
    </button>
  )
}

function Chip({
  active, onClick, className = '', label, children,
}: { active: boolean; onClick: () => void; className?: string; label?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`min-h-11 cursor-pointer rounded-full border px-1 text-[15px] ${
        active
          ? 'border-(--card-ink) bg-(--card-ink) text-white'
          : 'border-[rgba(0,47,108,0.3)] bg-transparent text-(--card-ink-2) hover:bg-[rgba(0,47,108,0.1)]'
      } ${className}`}
    >
      {children}
    </button>
  )
}
