import type { ReactNode } from 'react'

/**
 * The left column over the map: title + year picker and headline numbers, route finder, station search. A flex
 * column (cards stack by their own height, no hard-coded tops) kept inside the 36% of the width
 * the map reserves for it (LEFT_PANEL_FRACTION in lib/mapStyle.ts). The column itself ignores the
 * pointer so the gaps between cards still pan the map. On a short window it scrolls rather than
 * running off the bottom; its padding leaves room for the cards' shadows inside the scroller.
 */
export default function SideColumn({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute top-3 left-3 z-40 flex max-h-[calc(100vh-24px)] w-[calc(clamp(300px,26vw,400px)+16px)] flex-col gap-3 overflow-y-auto p-2">
      {Array.isArray(children)
        ? children.map((child, i) => <div key={i} className="pointer-events-auto">{child}</div>)
        : <div className="pointer-events-auto">{children}</div>}
    </div>
  )
}
