import { forwardRef, useRef, useState, type ReactNode } from 'react'

interface SheetProps {
  open: boolean
  /** Accessible name of the panel, e.g. "Find a route". */
  label: string
  onClose: () => void
  /** Distance from the bottom of the screen (the dock's height). */
  bottom: number
  /** Tallest it may get, as a CSS length (e.g. "55dvh"); it grows to full height while typing. */
  maxHeight: string
  /** Space above it that must stay free (the top bar's height). */
  top: number
  children: ReactNode
}

/**
 * Phone layout: a panel that slides up from the dock over the lower part of the map. A handle row
 * closes it (tap the chevron, or drag the handle down); its content scrolls on its own. While a text
 * field inside has focus it grows to the full height, so the on-screen keyboard leaves room for the
 * station list. Uses the light card surface, like the desktop cards; `.sheet-body` (index.css) strips
 * the cards inside it of their own frame.
 */
const Sheet = forwardRef<HTMLDivElement, SheetProps>(function Sheet({ open, label, onClose, bottom, maxHeight, top, children }, ref) {
  const [typing, setTyping] = useState(false)
  const [drag, setDrag] = useState(0)
  const startY = useRef<number | null>(null)

  const onPointerDown = (e: React.PointerEvent) => {
    startY.current = e.clientY
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (startY.current !== null) setDrag(Math.max(0, e.clientY - startY.current))
  }
  const onPointerUp = () => {
    if (startY.current !== null && drag > 70) onClose()
    startY.current = null
    setDrag(0)
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      aria-hidden={!open}
      className={`sheet absolute inset-x-0 z-40 flex flex-col rounded-t-2xl border-t border-(--card-line) bg-(--card) text-(--card-ink) shadow-[0_-10px_30px_rgba(0,0,0,0.35)] ${
        drag > 0 ? '' : 'transition-transform duration-200 ease-out'
      } ${open ? '' : 'pointer-events-none invisible'}`}
      style={{
        bottom,
        maxHeight: typing ? `calc(100dvh - ${top + bottom + 8}px)` : maxHeight,
        transform: open ? `translateY(${drag}px)` : 'translateY(calc(100% + 80px))',
      }}
      onFocus={(e) => { if ((e.target as HTMLElement).matches('input, textarea')) setTyping(true) }}
      onBlur={(e) => { if ((e.target as HTMLElement).matches('input, textarea')) setTyping(false) }}
    >
      <div
        className="relative flex h-7 shrink-0 cursor-grab touch-none items-center justify-center"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span className="h-1 w-10 rounded-full bg-[rgba(0,47,108,0.3)]" aria-hidden="true" />
        <button
          type="button"
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Hide ${label.toLowerCase()}`}
          className="absolute top-0 right-1 flex h-11 w-11 cursor-pointer items-center justify-center text-(--card-ink-2)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      <div className="sheet-body relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
    </div>
  )
})

export default Sheet
