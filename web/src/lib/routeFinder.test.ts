import { describe, expect, it } from 'vitest'
import { ALL } from './period'
import { findRoutes, pickRandomRoute, trainsIn } from './routeFinder'
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

describe('findRoutes by month', () => {
  it('finds the route in a month its trains run', () => {
    expect(findRoutes([winterOnly], 'HKI', 'OL', { kind: 'month', month: 1 }, YEARS)?.totalTrains).toBe(5)
  })
  it('has no direct train in a month none ran', () => {
    expect(findRoutes([winterOnly], 'HKI', 'OL', { kind: 'month', month: 7 }, YEARS)).toBeNull()
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
