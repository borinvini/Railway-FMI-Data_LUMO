import { useLayoutEffect, useState, type RefObject } from 'react'

/** The rendered height of an element (0 while it isn't mounted), kept up to date as it resizes. The
 *  phone layout uses it to tell the map how much of the screen the bars and sheets cover. */
export function useElementHeight(ref: RefObject<HTMLElement | null>, active = true): number {
  const [height, setHeight] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !active) {
      setHeight(0)
      return
    }
    const update = () => setHeight(Math.round(el.getBoundingClientRect().height))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, active])
  return height
}
