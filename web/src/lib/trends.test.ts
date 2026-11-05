import { describe, expect, it } from 'vitest'
import { ALL } from './period'
import { monthMarks, seasonal } from './trends'

const months = ['2019-01', '2019-02', '2019-07', '2020-01', '2020-07']
const series = { avg: [4, 2, 6, 8, 10], n: [10, 10, 10, 10, 10] }

describe('seasonal', () => {
  it('pools every year for a month pick, like all years', () => {
    expect(seasonal(months, series, { kind: 'month', month: 1 })).toEqual(seasonal(months, series, ALL))
    expect(seasonal(months, series, ALL).avg[0]).toBe(6) // (4 + 8) / 2
  })
  it('uses only the picked year', () => {
    const s = seasonal(months, series, { kind: 'year', year: 2019 })
    expect(s.avg[0]).toBe(4)
    expect(s.avg[6]).toBe(6)
  })
})

describe('monthMarks', () => {
  it('marks that month in every year', () => {
    expect(monthMarks(months, { kind: 'month', month: 1 })).toEqual([true, false, false, true, false])
  })
  it('marks nothing for a year or all years', () => {
    expect(monthMarks(months, ALL)).toEqual([false, false, false, false, false])
    expect(monthMarks(months, { kind: 'year', year: 2019 })).toEqual([false, false, false, false, false])
  })
})
