import { forwardRef } from 'react'
import FinnishFlag from '../FinnishFlag'

interface PhoneTopBarProps {
  /** "2018–2025" or a picked year; tapping it opens the Overview sheet (where the years are). */
  period: string
  onPeriod: () => void
  /** The camera has moved, or something is selected: offer Reset view. */
  showReset: boolean
  onReset: () => void
}

/** Phone layout: the one bar at the top. What the page is, the picked period, and Reset view. */
const PhoneTopBar = forwardRef<HTMLElement, PhoneTopBarProps>(function PhoneTopBar({ period, onPeriod, showReset, onReset }, ref) {
  return (
    <header
      ref={ref}
      className="absolute inset-x-0 top-0 z-40 flex items-center gap-2.5 border-b border-(--line) bg-(--surface) pr-1.5 pl-3 backdrop-blur-[8px]"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <FinnishFlag className="h-[18px] w-auto shrink-0 rounded-[2px]" />
      <h1 className="font-board m-0 min-w-0 truncate py-3.5 text-[17px] leading-none font-semibold text-(--text) min-[360px]:text-[19px] min-[375px]:text-[21px]">Trains in Finland</h1>
      <button
        type="button"
        onClick={onPeriod}
        aria-label={`Period shown: ${period}. Change it in Overview`}
        className="font-board flex min-h-9 shrink-0 cursor-pointer items-center rounded-full border border-(--line) px-2.5 text-[15px] leading-none text-(--muted) min-[375px]:px-3 min-[375px]:text-[16px]"
      >
        {period}
      </button>
      <span className="min-h-11 flex-1" />
      {showReset && (
        <button
          type="button"
          onClick={onReset}
          aria-label="Reset view"
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-(--text)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v5h5" />
          </svg>
        </button>
      )}
    </header>
  )
})

export default PhoneTopBar
