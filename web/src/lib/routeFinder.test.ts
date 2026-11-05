import { describe, expect, it } from 'vitest'
import { ALL } from './period'
import { findRoutes, pathForType, pickRandomRoute, trainsIn } from './routeFinder'
import type { RoutePattern } from './types'

const YEARS = [2019, 2020]
const winterOnly: RoutePattern = {
  stops: ['HKI', 'TPE', 'OL'],
  runsByType: { IC: [3, 2] },
  runsByMonth: { IC: [5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
}

describe('trainsIn', () => {
  it('counts a calendar month over all years', () => {
    expect(trainsIn(winterOnly, 'IC', { kind: 'month', month: 1 }, YEARS)).toBe(5)
    expect(trainsIn(winterOnly, 'IC', { kind: 'month', month: 7 }, YEARS)).toBe(0)
  })
  it('counts a year, and all years', () => {
    expect(trainsIn(winterOnly, 'IC', { kind: 'year', year: 2020 }, YEARS)).toBe(2)
    expect(trainsIn(winterOnly, 'IC', ALL, YEARS)).toBe(5)
  })
})

const NO_COORDS = new Map<string, [number, number]>()

describe('findRoutes by month', () => {
  it('finds the route in a month its trains run', () => {
    expect(findRoutes([winterOnly], 'HKI', 'OL', { kind: 'month', month: 1 }, YEARS, NO_COORDS)?.totalTrains).toBe(5)
  })
  it('has no direct train in a month none ran', () => {
    expect(findRoutes([winterOnly], 'HKI', 'OL', { kind: 'month', month: 7 }, YEARS, NO_COORDS)).toBeNull()
  })
})

describe('findRoutes merges stop sequences on the same track', () => {
  // A north-south line A..E (about 11 km between stops), W1 a waypoint on it, and X a stop on a
  // detour about 40 km east of C.
  const coords = new Map<string, [number, number]>([
    ['A', [25, 60]], ['W1', [25, 60.05]], ['B', [25, 60.1]], ['C', [25, 60.2]],
    ['D', [25, 60.3]], ['E', [25, 60.4]], ['X', [25.75, 60.2]],
  ])
  const pat = (stops: string[], runs: Record<string, number>): RoutePattern => ({
    stops,
    runsByType: Object.fromEntries(Object.entries(runs).map(([t, n]) => [t, [n, 0]])),
    runsByMonth: {},
  })

  it('treats skipped waypoints and stops as one route', () => {
    const r = findRoutes(
      [pat(['A', 'B', 'C', 'D', 'E'], { IC: 10 }), pat(['A', 'W1', 'B', 'D', 'E'], { S: 4 }), pat(['A', 'C', 'E'], { IC: 2 })],
      'A', 'E', ALL, YEARS, coords,
    )!
    expect(r.paths).toHaveLength(1)
    const p = r.paths[0]
    expect(p.stops).toEqual(['A', 'W1', 'B', 'C', 'D', 'E'])
    expect(p.trains).toBe(16)
    expect(p.byType).toEqual({ IC: 12, S: 4 })
    expect(p.sources).toEqual([{ id: 'A-E-IC', trains: 12 }, { id: 'A-E-S', trains: 4 }])
  })

  it('keeps a detour as its own route', () => {
    const r = findRoutes(
      [pat(['A', 'B', 'C', 'D', 'E'], { IC: 10 }), pat(['A', 'B', 'X', 'D', 'E'], { IC: 3 })],
      'A', 'E', ALL, YEARS, coords,
    )!
    expect(r.paths.map((p) => p.trains)).toEqual([10, 3])
  })

  it('narrows a route to one train type', () => {
    const r = findRoutes([pat(['A', 'C', 'E'], { IC: 7, S: 3 })], 'A', 'E', ALL, YEARS, coords)!
    const s = pathForType(r.paths[0], 'S')
    expect(s.trains).toBe(3)
    expect(s.sources).toEqual([{ id: 'A-E-S', trains: 3 }])
    expect(s.stops).toEqual(['A', 'C', 'E'])
  })
})

describe('pickRandomRoute by month', () => {
  it('never picks a pattern with no trains that month', () => {
    const stations = new Map([
      ['HKI', { lat: 60.17, lon: 24.94 }],
      ['TPE', { lat: 61.5, lon: 23.77 }],
      ['OL', { lat: 65.01, lon: 25.47 }],
    ])
    expect(pickRandomRoute([winterOnly], stations, null, { kind: 'month', month: 7 }, YEARS)).toBeNull()
    expect(pickRandomRoute([winterOnly], stations, null, { kind: 'month', month: 1 }, YEARS)).not.toBeNull()
  })
})
