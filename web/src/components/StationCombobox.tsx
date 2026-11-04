import { useEffect, useMemo, useRef, useState } from 'react'
import { useLang } from '../i18n'
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
  id, label, placeholder: placeholderProp, stations, value, onChange, excludeCode, labelAction,
}: StationComboboxProps) {
  const { t } = useLang()
  const placeholder = placeholderProp ?? t.combobox.placeholder
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
        <label htmlFor={id} className="text-[15px] font-medium text-(--card-ink-2)">
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
          className="min-h-11 w-full rounded-lg border border-[rgba(0,47,108,0.25)] bg-[rgba(255,255,255,0.35)] px-3 py-2 text-base text-(--card-ink) placeholder:text-(--card-ink-3) focus:border-(--card-ink)"
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
            className="absolute top-full left-0 z-10 mt-1 max-h-[min(300px,40dvh)] w-full overflow-y-auto rounded-lg border border-[rgba(0,47,108,0.25)] bg-[#d6e2f0] py-1 text-base shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
          >
            {matches.length === 0 && <li className="px-3 py-2.5 text-(--card-ink-3)">{t.combobox.none}</li>}
            {matches.map((s, i) => (
              <li
                key={s.code}
                role="option"
                aria-selected={s.code === value?.code}
                // mousedown (not click) so it fires before the input's blur closes the list.
                onMouseDown={(e) => { e.preventDefault(); choose(s) }}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer px-3 py-2.5 ${i === active ? 'bg-[rgba(0,47,108,0.14)]' : ''} ${s.code === value?.code ? 'font-medium' : ''}`}
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
