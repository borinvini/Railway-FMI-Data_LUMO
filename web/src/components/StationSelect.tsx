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
    <section className="card">
      <StationCombobox
        id="station-select"
        label="Jump to a station"
        stations={stations}
        value={selected}
        onChange={onSelect}
      />
    </section>
  )
}
