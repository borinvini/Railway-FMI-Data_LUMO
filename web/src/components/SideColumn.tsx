import type { ReactNode } from 'react'

/**
 * The left column over the map: title + month numbers, route finder, station search. A flex
 * column (cards stack by their own height, no hard-coded tops) kept inside the 36% of the width
 * the map reserves for it (LEFT_PANEL_FRACTION in lib/mapStyle.ts). The column itself ignores the
 * pointer so the gaps between cards still pan the map.
 */
export default function SideColumn({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute top-5 left-5 z-40 flex w-[clamp(300px,26vw,400px)] flex-col gap-3">
      {Array.isArray(children)
        ? children.map((child, i) => <div key={i} className="pointer-events-auto">{child}</div>)
        : <div className="pointer-events-auto">{children}</div>}
    </div>
  )
}
