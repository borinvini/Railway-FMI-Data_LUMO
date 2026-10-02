import { useEffect, useState } from 'react'
import MapView from './components/Map'
import FinnishFlag from './components/FinnishFlag'
import Legend from './components/Legend'
import StationPanel from './components/StationPanel'
import StationSelect from './components/StationSelect'
import type { ConnectionFeature, FinlandGeoJSON, StationFeature } from './lib/types'

export default function App() {
  const [stations, setStations] = useState<StationFeature[]>([])
  const [connections, setConnections] = useState<ConnectionFeature[]>([])
  const [finland, setFinland] = useState<FinlandGeoJSON | null>(null)
  const [selected, setSelected] = useState<StationFeature | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('data/stations.json').then((r) => r.json() as Promise<StationFeature[]>),
      fetch('data/connections.json').then((r) => r.json() as Promise<ConnectionFeature[]>),
      fetch('data/finland.geojson').then((r) => r.json() as Promise<FinlandGeoJSON>),
    ]).then(([stationsData, connectionsData, finlandData]) => {
      if (cancelled) return
      setStations(stationsData)
      setConnections(connectionsData)
      setFinland(finlandData)
    })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <MapView
        stations={stations}
        connections={connections}
        finland={finland}
        selected={selected}
        onSelect={setSelected}
      />

      <div className="absolute top-5 left-5 flex items-center gap-3.5 rounded-[10px] border border-(--line) bg-(--surface) px-[18px] py-4 backdrop-blur-[8px]">
        <FinnishFlag className="h-[26px] w-auto shrink-0 rounded-[2px] ring-1 ring-(--line)" />
        <div>
          <h1 className="m-0 text-lg font-light tracking-wide">Finnish railways · January 2020</h1>
          <p className="mt-0.5 mb-0 text-[13px] text-(--muted)">Click a station to see how late it runs</p>
        </div>
      </div>

      <StationSelect stations={stations} selected={selected} onSelect={setSelected} />

      <Legend />

      {selected && <StationPanel station={selected} onClose={() => setSelected(null)} />}

      <div className="absolute bottom-6 right-5 max-w-[260px] rounded-[10px] border border-(--line) bg-(--surface) px-[14px] py-[10px] text-xs text-(--muted) backdrop-blur-[8px]">
        Station delays are real (parquet, arrival at that station); weather panel not built yet.
      </div>
    </div>
  )
}
