import { describe, expect, it } from 'vitest'
import type { ActivityRecord, ResolvedLoad } from '../types'
import type { PlacedItem } from '../scheduler/placement'
import { computeDailySummary } from './dailySummary'

const HIGH: ResolvedLoad = { focus: 3, mental: 3, physical: 3 } // unit 3.0 → 高負荷
const LOW: ResolvedLoad = { focus: 1, mental: 1, physical: 1 } // unit 1.0 → 低負荷

function item(partial: Partial<PlacedItem> & Pick<PlacedItem, 'id' | 'kind' | 'interval'>): PlacedItem {
  return { movable: false, ...partial }
}

const record = (partial: Partial<ActivityRecord> & Pick<ActivityRecord, 'itemId' | 'status'>): ActivityRecord => ({
  id: `2026-08-03::${partial.itemId}`,
  date: '2026-08-03',
  sourceId: partial.itemId,
  createdAt: '2026-08-03T00:00',
  updatedAt: '2026-08-03T00:00',
  ...partial,
})

describe('computeDailySummary', () => {
  it('予定時間・休憩・自由活動・高負荷を集計する', () => {
    const timeline: PlacedItem[] = [
      item({ id: 'a', kind: 'fixed', interval: { start: 540, end: 600 }, load: HIGH, categoryId: 'c1' }), // 60分 高
      item({ id: 'b', kind: 'flexible', interval: { start: 600, end: 660 }, load: LOW, categoryId: 'c2' }), // 60分 低
      item({ id: 'brk', kind: 'break', interval: { start: 660, end: 675 } }), // 休憩15分
      item({ id: 'f', kind: 'free', interval: { start: 675, end: 720 } }), // 自由45分
    ]
    const s = computeDailySummary(timeline, [])
    expect(s.plannedMinutes).toBe(60 + 60 + 45) // 休憩は除く
    expect(s.breakMinutes).toBe(15)
    expect(s.freeActivityMinutes).toBe(45)
    expect(s.highLoadMinutes).toBe(60)
    expect(s.completedCount).toBe(0)
    expect(s.onTimeStartRatio).toBeNull()
  })

  it('完了・未完了・実績時間・カテゴリ別を集計する', () => {
    const timeline: PlacedItem[] = [
      item({ id: 'a', kind: 'fixed', interval: { start: 540, end: 600 }, categoryId: 'c1' }),
      item({ id: 'b', kind: 'flexible', interval: { start: 600, end: 720 }, categoryId: 'c1' }),
    ]
    const records: ActivityRecord[] = [
      // 実測 09:05–09:50 = 45分、カテゴリ c1
      record({ itemId: 'a', status: 'completed', actualStart: '2026-08-03T09:05', actualEnd: '2026-08-03T09:50' }),
      // 完了だが実測なし → 予定120分、カテゴリ c1
      record({ itemId: 'b', status: 'completed' }),
    ]
    const s = computeDailySummary(timeline, records)
    expect(s.completedCount).toBe(2)
    expect(s.incompleteCount).toBe(0)
    expect(s.actualMinutes).toBe(45 + 120)
    expect(s.byCategory).toEqual([{ categoryId: 'c1', minutes: 165 }])
  })

  it('予定どおり開始できた割合を出す', () => {
    const timeline: PlacedItem[] = [
      item({ id: 'a', kind: 'fixed', interval: { start: 540, end: 600 } }), // 予定09:00
      item({ id: 'b', kind: 'fixed', interval: { start: 600, end: 660 } }), // 予定10:00
    ]
    const records: ActivityRecord[] = [
      record({ itemId: 'a', status: 'started', actualStart: '2026-08-03T09:00' }), // 予定どおり
      record({ itemId: 'b', status: 'started', actualStart: '2026-08-03T10:15' }), // 遅れ
    ]
    const s = computeDailySummary(timeline, records)
    expect(s.onTimeStartRatio).toBe(0.5)
  })

  it('未完了申告を数える', () => {
    const timeline: PlacedItem[] = [item({ id: 'a', kind: 'fixed', interval: { start: 540, end: 600 } })]
    const s = computeDailySummary(timeline, [record({ itemId: 'a', status: 'incomplete' })])
    expect(s.incompleteCount).toBe(1)
    expect(s.completedCount).toBe(0)
  })
})
