import type { StationFeature } from '../lib/types'

interface StationSelectProps {
  stations: StationFeature[]
  selected: StationFeature | null
  onSelect: (station: StationFeature | null) => void
}

/**
 * Keyboard/list-accessible alternative to clicking a dot on the map. Picking a station here
 * selects it exactly like a map click -- Map.tsx reacts to the lifted selection by flying the
 * camera there, so this component doesn't need to know about the map instance at all.
 */
export default function StationSelect({ stations, selected, onSelect }: StationSelectProps) {
  const sorted = [...stations].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="absolute top-[108px] left-5 rounded-[10px] border border-(--line) bg-(--surface) px-[14px] py-2.5 backdrop-blur-[8px]">
      <label htmlFor="station-select" className="mb-1 block text-xs text-(--muted)">
        Jump to a station
      </label>
      <select
        id="station-select"
        className="w-[220px] rounded-md border border-(--line) bg-transparent px-2 py-1.5 text-sm text-(--text) outline-none"
        value={selected?.code ?? ''}
        onChange={(e) => {
          const station = stations.find((s) => s.code === e.target.value) ?? null
          onSelect(station)
        }}
      >
        <option value="" disabled>
          Select a station…
        </option>
        {sorted.map((s) => (
          <option key={s.code} value={s.code}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  )
}
