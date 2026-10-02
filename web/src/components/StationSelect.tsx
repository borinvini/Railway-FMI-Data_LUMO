import { useEffect, useMemo, useRef, useState } from 'react'
import type { StationFeature } from '../lib/types'

interface StationSelectProps {
  stations: StationFeature[]
  selected: StationFeature | null
  onSelect: (station: StationFeature | null) => void
}

const label = (s: string) => s.replace(/ asema$/, '')

/** Lowercase and strip accents so "jyvaskyla" finds "Jyväskylä". */
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Type-to-search station picker (combobox), the keyboard/list-accessible alternative to clicking
 * a marker on the map. Picking a station here selects it exactly like a map click -- Map.tsx reacts
 * to the lifted selection by flying the camera there, so this component doesn't need to know about
 * the map instance at all.
 */
export default function StationSelect({ stations, selected, onSelect }: StationSelectProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const sorted = useMemo(
    () => [...stations].sort((a, b) => label(a.name).localeCompare(label(b.name))),
    [stations],
  )
  const matches = useMemo(() => {
    const q = normalize(query.trim())
    return q ? sorted.filter((s) => normalize(label(s.name)).includes(q)) : sorted
  }, [sorted, query])

  // While the list is closed the box shows the current selection (which can also change from
  // a map click); while open it shows what the visitor is typing.
  const shown = open ? query : selected ? label(selected.name) : ''

  // Keep the highlighted row scrolled into view for arrow-key navigation.
  useEffect(() => {
    if (!open) return
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  function choose(station: StationFeature) {
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
    onSelect(station)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) { setOpen(true); setQuery('') }
      else setActive((i) => Math.min(i + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && matches[active]) { e.preventDefault(); choose(matches[active]) }
    } else if (e.key === 'Escape' && open) {
      // Close just the list -- don't let the page-wide Esc handler deselect the station too.
      e.stopPropagation()
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div className="absolute top-[108px] left-5 z-40 rounded-[10px] border border-[rgba(0,47,108,0.15)] bg-[rgba(190,208,228,0.97)] px-[14px] py-2.5 text-(--flag-blue) shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
      <label htmlFor="station-select" className="mb-1 block text-[13px] font-normal text-[#243f5e]">
        Jump to a station
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id="station-select"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="station-select-list"
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          placeholder="Select or type a station…"
          className="w-[220px] rounded-md border border-[rgba(0,47,108,0.2)] bg-transparent px-2 py-1.5 text-sm text-(--flag-blue) outline-none placeholder:text-[#3f5873] focus:border-[rgba(0,47,108,0.5)]"
          value={shown}
          onFocus={(e) => { setOpen(true); setQuery(''); setActive(0); e.currentTarget.select() }}
          onBlur={() => { setOpen(false); setQuery('') }}
          onChange={(e) => { setOpen(true); setQuery(e.target.value); setActive(0) }}
          onKeyDown={onKeyDown}
        />
        {open && (
          <ul
            ref={listRef}
            id="station-select-list"
            role="listbox"
            className="absolute top-full left-0 mt-1 max-h-[260px] w-full overflow-y-auto rounded-md border border-[rgba(0,47,108,0.2)] bg-[#d6e2f0] py-1 text-sm shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
          >
            {matches.length === 0 && <li className="px-2 py-1.5 text-[#3f5873]">No station found</li>}
            {matches.map((s, i) => (
              <li
                key={s.code}
                role="option"
                aria-selected={s.code === selected?.code}
                // mousedown (not click) so it fires before the input's blur closes the list.
                onMouseDown={(e) => { e.preventDefault(); choose(s) }}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer px-2 py-1.5 ${i === active ? 'bg-[rgba(0,47,108,0.14)]' : ''} ${s.code === selected?.code ? 'font-medium' : ''}`}
              >
                {label(s.name)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
