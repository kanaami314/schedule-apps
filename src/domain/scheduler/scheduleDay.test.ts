import { describe, expect, it } from 'vitest'
import type { Category, FixedEvent, FlexibleTask } from '../types'
import { scheduleDay } from './scheduleDay'

const DATE = '2026-08-05'
const noCategories = new Map<string, Category>()

function fixed(o: Partial<FixedEvent> & { id: string; start: string; end: string }): FixedEvent {
  return {
    kind: 'fixed',
    createdAt: '2026-08-01T00:00',
    updatedAt: '2026-08-01T00:00',
    name: o.id,
    date: DATE,
    time: { start: o.start, end: o.end },
    ...o,
  }
}

function flex(
  o: Partial<FlexibleTask> & { id: string; estimatedDuration: number },
): FlexibleTask {
  return {
    kind: 'flexible',
    createdAt: '2026-08-01T00:00',
    updatedAt: '2026-08-01T00:00',
    name: o.id,
    deadline: '2026-08-06T09:00',
    ...o,
  }
}

describe('scheduleDay', () => {
  it('固定予定を占有として扱い、柔軟タスクを空きへ配置する', () => {
    const result = scheduleDay({
      date: DATE,
      categories: noCategories,
      window: { start: 540, end: 720 }, // 9:00-12:00
      definitions: [
        fixed({ id: 'meeting', start: '10:00', end: '11:00' }),
        flex({ id: 'task', estimatedDuration: 60 }),
      ],
    })
    expect(result.unplaced).toHaveLength(0)
    // 固定は 10:00-11:00、タスクは前の空き 9:00-10:00 に入る
    const task = result.timeline.find((t) => t.sourceId === 'task')
    expect(task?.interval).toEqual({ start: 540, end: 600 })
    // タイムラインは start 昇順
    const starts = result.timeline.map((t) => t.interval.start)
    expect(starts).toEqual([...starts].sort((a, b) => a - b))
  })

  it('高負荷が連続すると休憩が挿入される', () => {
    // (3,3,3) の固定2時間 + 高負荷タスクで 6.0 を超え、直後の空きに休憩
    const result = scheduleDay({
      date: DATE,
      categories: noCategories,
      window: { start: 0, end: 1440 },
      definitions: [
        fixed({
          id: 'hard',
          start: '09:00',
          end: '11:00',
          load: { focus: 3, mental: 3, physical: 3 },
        }),
        flex({
          id: 'more',
          estimatedDuration: 60,
          splittable: false,
          load: { focus: 3, mental: 3, physical: 3 },
        }),
      ],
    })
    expect(result.timeline.some((t) => t.kind === 'break')).toBe(true)
  })

  it('空きに収まらない柔軟タスクは未配置として理由付きで返す', () => {
    const result = scheduleDay({
      date: DATE,
      categories: noCategories,
      window: { start: 540, end: 600 }, // 60分しかない
      definitions: [flex({ id: 'big', estimatedDuration: 120, splittable: false })],
    })
    expect(result.unplaced).toHaveLength(1)
    expect(result.unplaced[0].reason).toBe('insufficientFreeTime')
  })

  it('別日の固定予定は対象日に含めない', () => {
    const other = fixed({ id: 'other', start: '10:00', end: '11:00' })
    other.date = '2026-08-06'
    const result = scheduleDay({
      date: DATE,
      categories: noCategories,
      definitions: [other],
    })
    expect(result.timeline).toHaveLength(0)
  })
})
