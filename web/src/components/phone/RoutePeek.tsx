import { forwardRef } from 'react'

interface RoutePeekProps {
  startName: string
  endName: string
  /** How many distinct paths the trains take (more than one: the details pop-up has tabs). */
  paths: number
  bottom: number
  onExpand: () => void
  onDetails: () => void
  onPlay: () => void
}

/** Phone layout: once a route is found the route sheet drops to this bar, so the route and its
 *  badges are visible on the map. The names reopen the sheet; Details and Play act directly. */
const RoutePeek = forwardRef<HTMLDivElement, RoutePeekProps>(function RoutePeek({ startName, endName, paths, bottom, onExpand, onDetails, onPlay }, ref) {
  return (
    <div
      ref={ref}
      className="absolute inset-x-0 z-40 rounded-t-2xl border-t border-(--card-line) bg-(--card) px-2 pt-1.5 pb-2 text-(--card-ink) shadow-[0_-10px_30px_rgba(0,0,0,0.35)]"
      style={{ bottom }}
    >
      <button
        type="button"
        onClick={onExpand}
        aria-label="Show the route finder"
        className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left"
      >
        <span className="font-board min-w-0 flex-1 truncate text-[21px] leading-tight font-semibold">
          {startName} → {endName}
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0 text-(--card-ink-2)" aria-hidden="true">
          <path d="M6 15l6-6 6 6" />
        </svg>
      </button>
      <div className="mt-1 grid grid-cols-2 gap-2 px-1">
        <button
          type="button"
          onClick={onDetails}
          className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg bg-(--card-ink) text-[15px] font-medium text-white"
        >
          {paths > 1 ? `Details (${paths} ways)` : 'Details'}
        </button>
        <button
          type="button"
          onClick={onPlay}
          className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[rgba(0,47,108,0.25)] text-[15px] text-(--card-ink-2)"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-current" aria-hidden="true" />
          Play the journey
        </button>
      </div>
    </div>
  )
})

export default RoutePeek
