import type { StationFeature } from '../lib/types'
import StationCombobox from './StationCombobox'

interface StationSelectProps {
  stations: StationFeature[]
  selected: StationFeature | null
  onSelect: (station: StationFeature | null) => void
}

/**
 * Keyboard/list-accessible alternative to clicking a marker on the map. Picking a station here
 * selects it exactly like a map click -- Map.tsx reacts to the lifted selection by flying the
 * camera there, so this component doesn't need to know about the map instance at all.
 */
export default function StationSelect({ stations, selected, onSelect }: StationSelectProps) {
  return (
    <div className="absolute top-[108px] left-5 z-40 rounded-[10px] border border-[rgba(0,47,108,0.15)] bg-[rgba(190,208,228,0.97)] px-[14px] py-2.5 text-(--flag-blue) shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
      <StationCombobox
        id="station-select"
        label="Jump to a station"
        stations={stations}
        value={selected}
        onChange={onSelect}
      />
    </div>
  )
}
