import { describe, expect, it } from 'vitest'
import { makeFmt } from '../i18n/format'
import { ALL, defaultPeriod, monthsOfScope, periodLabel, periodShort, samePeriod, scopeOf, type Period } from './period'

const YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]
const jan: Period = { kind: 'month', month: 1 }

describe('scopeOf', () => {
  it('names the period files', () => {
    expect(scopeOf(ALL)).toBe('all')
    expect(scopeOf({ kind: 'year', year: 2021 })).toBe('2021')
    expect(scopeOf(jan)).toBe('m01')
    expect(scopeOf({ kind: 'month', month: 12 })).toBe('m12')
  })
})

describe('periodLabel', () => {
  it('says the month and the years it pools', () => {
    expect(periodLabel(YEARS, jan, makeFmt('en'))).toBe('January, 2018–2025')
    expect(periodLabel(YEARS, jan, makeFmt('fi'))).toBe('tammikuu, 2018–2025')
  })
  it('keeps the year and all-years labels', () => {
    expect(periodLabel(YEARS, ALL, makeFmt('en'))).toBe('2018–2025')
    expect(periodLabel(YEARS, { kind: 'year', year: 2021 }, makeFmt('en'))).toBe('2021')
    expect(periodLabel(null, ALL, makeFmt('en'))).toBeNull()
  })
  it('has a short form for the phone bar', () => {
    expect(periodShort(YEARS, jan, makeFmt('en'))).toBe('Jan, 2018–25')
    expect(periodShort(YEARS, ALL, makeFmt('en'))).toBe('2018–2025')
  })
})

describe('monthsOfScope', () => {
  const months = ['2019-01', '2019-02', '2020-01', '2020-07']
  it('keeps that calendar month of every year for a month scope', () => {
    expect(monthsOfScope(months, 'm01')).toEqual([0, 2])
  })
  it('keeps one year, or everything', () => {
    expect(monthsOfScope(months, '2020')).toEqual([2, 3])
    expect(monthsOfScope(months, 'all')).toEqual([0, 1, 2, 3])
  })
})

describe('defaultPeriod', () => {
  it('opens By month, on the current calendar month', () => {
    expect(defaultPeriod(new Date(2026, 10, 5))).toEqual({ kind: 'month', month: 11 })
    expect(defaultPeriod(new Date(2026, 0, 31))).toEqual({ kind: 'month', month: 1 })
  })
})

describe('samePeriod', () => {
  it('compares by value', () => {
    expect(samePeriod(jan, { kind: 'month', month: 1 })).toBe(true)
    expect(samePeriod(jan, { kind: 'month', month: 2 })).toBe(false)
    expect(samePeriod(ALL, { kind: 'all' })).toBe(true)
  })
})
