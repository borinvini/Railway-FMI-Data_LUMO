import { useEffect, useState } from 'react'
import MapView from './components/Map'
import Legend from './components/Legend'
import RoutePanel from './components/RoutePanel'
import type { FinlandGeoJSON, RouteFeature } from './lib/types'

export default function App() {
  const [routes, setRoutes] = useState<RouteFeature[]>([])
  const [finland, setFinland] = useState<FinlandGeoJSON | null>(null)
  const [selected, setSelected] = useState<RouteFeature | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('data/routes.json').then((r) => r.json() as Promise<RouteFeature[]>),
      fetch('data/finland.geojson').then((r) => r.json() as Promise<FinlandGeoJSON>),
    ]).then(([routesData, finlandData]) => {
      if (cancelled) return
      setRoutes(routesData)
      setFinland(finlandData)
    })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <MapView routes={routes} finland={finland} selected={selected} onSelect={setSelected} />

      <div className="absolute top-5 left-5 rounded-[10px] border border-(--line) bg-(--surface) px-[18px] py-4 backdrop-blur-[8px]">
        <h1 className="m-0 text-lg font-light tracking-wide">Finnish railways · January 2020</h1>
        <p className="mt-0.5 mb-0 text-[13px] text-(--muted)">Click a route to see how late it ran</p>
      </div>

      <Legend />

      {selected && <RoutePanel route={selected} onClose={() => setSelected(null)} />}

      <div className="absolute bottom-6 right-5 max-w-[260px] rounded-[10px] border border-(--line) bg-(--surface) px-[14px] py-[10px] text-xs text-(--muted) backdrop-blur-[8px]">
        Route delays are real (parquet, arrival at destination); weather panel not built yet.
      </div>
    </div>
  )
}
