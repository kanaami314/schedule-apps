import { describe, expect, it } from 'vitest'
import { occursOn, weekdayOf } from './repeat'

// 2026-08-03 は月曜。
describe('weekdayOf', () => {
  it('曜日を返す（0=日〜6=土）', () => {
    expect(weekdayOf('2026-08-03')).toBe(1) // 月
    expect(weekdayOf('2026-08-08')).toBe(6) // 土
    expect(weekdayOf('2026-08-09')).toBe(0) // 日
  })
})

describe('occursOn', () => {
  const base = '2026-08-03' // 月曜

  it('基準日より前は出現しない', () => {
    expect(occursOn(base, undefined, '2026-08-02')).toBe(false)
    expect(occursOn(base, { kind: 'daily' }, '2026-08-02')).toBe(false)
  })

  it('none/未設定は基準日のみ', () => {
    expect(occursOn(base, undefined, '2026-08-03')).toBe(true)
    expect(occursOn(base, { kind: 'none' }, '2026-08-03')).toBe(true)
    expect(occursOn(base, undefined, '2026-08-04')).toBe(false)
  })

  it('daily は基準日以降の毎日', () => {
    expect(occursOn(base, { kind: 'daily' }, '2026-08-03')).toBe(true)
    expect(occursOn(base, { kind: 'daily' }, '2026-08-20')).toBe(true)
  })

  it('weekly は指定曜日のみ', () => {
    const repeat = { kind: 'weekly', weekdays: [1, 3] } as const // 月・水
    expect(occursOn(base, repeat, '2026-08-03')).toBe(true) // 月
    expect(occursOn(base, repeat, '2026-08-05')).toBe(true) // 水
    expect(occursOn(base, repeat, '2026-08-04')).toBe(false) // 火
    expect(occursOn(base, repeat, '2026-08-10')).toBe(true) // 翌週の月
  })

  it('biweekly は指定曜日かつ基準週から偶数週', () => {
    const repeat = { kind: 'biweekly', weekdays: [1], anchorDate: '2026-08-03' } as const // 月・隔週
    expect(occursOn(base, repeat, '2026-08-03')).toBe(true) // 0週
    expect(occursOn(base, repeat, '2026-08-10')).toBe(false) // 1週
    expect(occursOn(base, repeat, '2026-08-17')).toBe(true) // 2週
    expect(occursOn(base, repeat, '2026-08-18')).toBe(false) // 火（曜日不一致）
  })

  it('monthly は毎月の指定日', () => {
    const repeat = { kind: 'monthly', dayOfMonth: 3 } as const
    expect(occursOn(base, repeat, '2026-08-03')).toBe(true)
    expect(occursOn(base, repeat, '2026-09-03')).toBe(true)
    expect(occursOn(base, repeat, '2026-09-04')).toBe(false)
  })
})
