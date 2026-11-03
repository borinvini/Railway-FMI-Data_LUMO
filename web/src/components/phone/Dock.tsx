import { forwardRef, type ReactNode } from 'react'

export type PhoneSheetName = 'route' | 'station' | 'overview'

interface DockProps {
  open: PhoneSheetName | null
  onOpen: (sheet: PhoneSheetName | null) => void
  /** A route / station is on the map: a small dot on its tab says so while its sheet is closed. */
  routeActive: boolean
  stationActive: boolean
}

const ICON = 'h-[22px] w-[22px]'
const TABS: { name: PhoneSheetName; label: string; icon: ReactNode }[] = [
  {
    name: 'route',
    label: 'Route',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={ICON}>
        <circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="6" r="2.5" />
        <path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5" />
      </svg>
    ),
  },
  {
    name: 'station',
    label: 'Station',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={ICON}>
        <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" />
      </svg>
    ),
  },
  {
    name: 'overview',
    label: 'Overview',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={ICON}>
        <path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" />
      </svg>
    ),
  },
]

/** Phone layout: the three tabs at the bottom, like the board at a station. Each opens its sheet;
 *  tapping the open one closes it again. */
const Dock = forwardRef<HTMLElement, DockProps>(function Dock({ open, onOpen, routeActive, stationActive }, ref) {
  return (
    <nav
      ref={ref}
      aria-label="Panels"
      className="absolute inset-x-0 bottom-0 z-40 border-t border-(--line) bg-(--surface) backdrop-blur-[8px]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="m-0 grid h-16 list-none grid-cols-3 p-0">
        {TABS.map((t) => {
          const active = open === t.name
          const dot = !active && ((t.name === 'route' && routeActive) || (t.name === 'station' && stationActive))
          return (
            <li key={t.name}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onOpen(active ? null : t.name)}
                className={`relative flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1 ${active ? 'text-(--text)' : 'text-(--muted)'}`}
              >
                {/* The open tab is marked by an ice line on the dock's top edge. */}
                <span className={`absolute inset-x-6 top-0 h-[2px] rounded-full bg-(--ice) transition-opacity duration-150 ${active ? 'opacity-100' : 'opacity-0'}`} />
                <span className="relative">
                  {t.icon}
                  {dot && <span className="absolute -top-0.5 -right-1.5 h-2 w-2 rounded-full bg-(--ice)" aria-hidden="true" />}
                </span>
                <span className="font-board text-[15px] leading-none tracking-[0.02em]">{t.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
})

export default Dock
