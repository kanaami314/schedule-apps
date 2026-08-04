import { describe, expect, it } from 'vitest'
import type { ActivityRecord } from '../types'
import { completedMinutesByTask } from './progress'

const rec = (partial: Partial<ActivityRecord> & Pick<ActivityRecord, 'sourceId' | 'status'>): ActivityRecord => ({
  id: `2026-08-03::${partial.sourceId}`,
  date: '2026-08-03',
  itemId: partial.sourceId,
  createdAt: '2026-08-03T00:00',
  updatedAt: '2026-08-03T00:00',
  ...partial,
})

describe('completedMinutesByTask（複数日の残量算出）', () => {
  it('完了かつ実開始・終了が揃った記録を sourceId 別に合算する', () => {
    const records: ActivityRecord[] = [
      rec({ sourceId: 't1', status: 'completed', actualStart: '2026-08-03T09:00', actualEnd: '2026-08-03T10:00' }),
      rec({ sourceId: 't1', status: 'completed', actualStart: '2026-08-04T09:00', actualEnd: '2026-08-04T09:30' }),
      rec({ sourceId: 't2', status: 'completed', actualStart: '2026-08-03T13:00', actualEnd: '2026-08-03T14:00' }),
    ]
    const map = completedMinutesByTask(records)
    expect(map.get('t1')).toBe(90) // 60 + 30
    expect(map.get('t2')).toBe(60)
  })

  it('未完了や実時間が欠けた記録は集計しない', () => {
    const records: ActivityRecord[] = [
      rec({ sourceId: 't1', status: 'incomplete', actualStart: '2026-08-03T09:00', actualEnd: '2026-08-03T10:00' }),
      rec({ sourceId: 't2', status: 'completed', actualStart: '2026-08-03T09:00' }), // 終了なし
    ]
    const map = completedMinutesByTask(records)
    expect(map.size).toBe(0)
  })
})
