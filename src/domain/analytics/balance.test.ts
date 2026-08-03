import { describe, expect, it } from 'vitest'
import type { Category, FixedEvent, Id } from '../types'
import { computeBalance, periodDates } from './balance'

// 2026-08-03 は月曜。
const monday = new Date(2026, 7, 3)

describe('periodDates', () => {
  it('今日は当日のみ', () => {
    expect(periodDates('today', monday)).toEqual(['2026-08-03'])
  })

  it('今週は月曜〜日曜の7日', () => {
    expect(periodDates('thisWeek', monday)).toEqual([
      '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09',
    ])
  })

  it('週の途中(木曜)でも同じ週を返す', () => {
    expect(periodDates('thisWeek', new Date(2026, 7, 6))[0]).toBe('2026-08-03')
  })

  it('先週は前週の月曜〜日曜', () => {
    expect(periodDates('lastWeek', monday)[0]).toBe('2026-07-27')
    expect(periodDates('lastWeek', monday)).toHaveLength(7)
  })

  it('今月は月初〜月末', () => {
    const dates = periodDates('thisMonth', monday)
    expect(dates[0]).toBe('2026-08-01')
    expect(dates).toHaveLength(31)
  })
})

const category = (id: string, name: string, parentId?: string): Category => ({ id, name, parentId })

const fixed = (id: string, date: string, start: string, end: string, categoryId?: string): FixedEvent => ({
  id,
  kind: 'fixed',
  createdAt: '2026-08-01T00:00',
  updatedAt: '2026-08-01T00:00',
  name: id,
  date,
  time: { start, end },
  categoryId,
})

describe('computeBalance', () => {
  it('最上位カテゴリ別に予定時間を積み上げる', () => {
    const categories = new Map<Id, Category>([
      ['top', category('top', '研究')],
      ['child', category('child', '実験', 'top')],
    ])
    const defs: FixedEvent[] = [
      fixed('a', '2026-08-03', '09:00', '10:00', 'child'), // 子→最上位 top に集約, 60分
      fixed('b', '2026-08-03', '10:00', '11:30', 'top'), // 90分
    ]
    const result = computeBalance('today', monday, defs, categories, [])
    expect(result.totalPlanned).toBe(150)
    expect(result.categories).toEqual([{ categoryId: 'top', plannedMinutes: 150, actualMinutes: 0 }])
  })

  it('負荷分析（§20.7）: 配置予定の時間重み付き平均を区分にする', () => {
    const categories = new Map<Id, Category>([['top', category('top', '研究')]])
    // 高負荷(3,3,3) の固定予定 → 各軸「高」。
    const defs: FixedEvent[] = [
      { ...fixed('a', '2026-08-03', '09:00', '10:00', 'top'), load: { focus: 3, mental: 3, physical: 3 } },
    ]
    const result = computeBalance('today', monday, defs, categories, [])
    expect(result.load).toEqual({ total: 'high', focus: 'high', mental: 'high', physical: 'high' })
  })

  it('負荷を持つ予定が無ければ負荷分析は null', () => {
    const result = computeBalance('today', monday, [], new Map(), [])
    expect(result.load).toEqual({ total: null, focus: null, mental: null, physical: null })
  })

  it('完了記録から実績時間を積み上げる', () => {
    const categories = new Map<Id, Category>([['top', category('top', '研究')]])
    const defs: FixedEvent[] = [fixed('a', '2026-08-03', '09:00', '10:00', 'top')]
    const records = [
      {
        id: '2026-08-03::a',
        date: '2026-08-03',
        itemId: 'a',
        sourceId: 'a',
        status: 'completed' as const,
        createdAt: '2026-08-03T00:00',
        updatedAt: '2026-08-03T00:00',
      },
    ]
    const result = computeBalance('today', monday, defs, categories, records)
    expect(result.totalActual).toBe(60)
    expect(result.categories[0]).toEqual({ categoryId: 'top', plannedMinutes: 60, actualMinutes: 60 })
  })
})
