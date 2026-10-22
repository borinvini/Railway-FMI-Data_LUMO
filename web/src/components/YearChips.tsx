interface YearChipsProps {
  years: number[]
  /** The picked year; null = all years. */
  year: number | null
  onYear: (year: number | null) => void
  /** Tailwind grid-columns class: "All years" spans two columns, each year one. */
  columns?: string
  className?: string
}

/** "All years" plus one chip per year. Shared by the title card and the "How delays changed" pop-up,
 *  so the year can be changed without leaving either. */
export default function YearChips({ years, year, onYear, columns = 'grid-cols-5', className = '' }: YearChipsProps) {
  return (
    <div role="group" aria-label="Year" className={`grid gap-1.5 ${columns} ${className}`}>
      <Chip active={year === null} onClick={() => onYear(null)} className="col-span-2">All years</Chip>
      {years.map((y) => (
        <Chip key={y} active={year === y} onClick={() => onYear(y)}>{y}</Chip>
      ))}
    </div>
  )
}

function Chip({
  active, onClick, className = '', children,
}: { active: boolean; onClick: () => void; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
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
