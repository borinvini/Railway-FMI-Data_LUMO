import { useEffect, useMemo, useRef, useState } from 'react'
import type { StationFeature } from '../lib/types'

interface StationComboboxProps {
  /** Unique per instance -- used for the input and its list (label/aria wiring). */
  id: string
  label: string
  placeholder?: string
  stations: StationFeature[]
  value: StationFeature | null
  onChange: (station: StationFeature) => void
  /** A station to leave out of the list (e.g. the route's start in the "To" picker). */
  excludeCode?: string
  /** Optional control shown at the right end of the label row (e.g. the route finder's swap button). */
  labelAction?: React.ReactNode
}

export const stationLabel = (s: string) => s.replace(/ asema$/, '')

/** Lowercase and strip accents so "jyvaskyla" finds "Jyväskylä". */
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/**
 * Type-to-search station picker (combobox): click to see the whole alphabetical list, type to
 * filter it, arrow keys + Enter or a click to pick. Esc closes just the list. Shared by the
 * "Jump to a station" box and the route finder's From/To pickers.
 */
export default function StationCombobox({
  id, label, placeholder = 'Select or type a station…', stations, value, onChange, excludeCode, labelAction,
}: StationComboboxProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const sorted = useMemo(
    () => stations
      .filter((s) => s.code !== excludeCode)
      .sort((a, b) => stationLabel(a.name).localeCompare(stationLabel(b.name))),
    [stations, excludeCode],
  )
  const matches = useMemo(() => {
    const q = normalize(query.trim())
    return q ? sorted.filter((s) => normalize(stationLabel(s.name)).includes(q)) : sorted
  }, [sorted, query])

  // While the list is closed the box shows the current value (which can also change from
  // outside, e.g. a map click); while open it shows what the visitor is typing.
  const shown = open ? query : value ? stationLabel(value.name) : ''

  // Keep the highlighted row scrolled into view for arrow-key navigation.
  useEffect(() => {
    if (!open) return
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  function choose(station: StationFeature) {
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
    onChange(station)
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
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label htmlFor={id} className="text-[13px] font-normal text-[#243f5e]">
          {label}
        </label>
        {labelAction}
      </div>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
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
            id={`${id}-list`}
            role="listbox"
            className="absolute top-full left-0 z-10 mt-1 max-h-[260px] w-full overflow-y-auto rounded-md border border-[rgba(0,47,108,0.2)] bg-[#d6e2f0] py-1 text-sm shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
          >
            {matches.length === 0 && <li className="px-2 py-1.5 text-[#3f5873]">No station found</li>}
            {matches.map((s, i) => (
              <li
                key={s.code}
                role="option"
                aria-selected={s.code === value?.code}
                // mousedown (not click) so it fires before the input's blur closes the list.
                onMouseDown={(e) => { e.preventDefault(); choose(s) }}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer px-2 py-1.5 ${i === active ? 'bg-[rgba(0,47,108,0.14)]' : ''} ${s.code === value?.code ? 'font-medium' : ''}`}
              >
                {stationLabel(s.name)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
