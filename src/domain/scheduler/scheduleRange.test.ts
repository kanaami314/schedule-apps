import { describe, expect, it } from 'vitest'
import type { Category, FlexibleTask, Id } from '../types'
import { scheduleRange } from './scheduleRange'

const noCategories = new Map<Id, Category>()

function flex(o: Partial<FlexibleTask> & { id: string; estimatedDuration: number }): FlexibleTask {
  return {
    kind: 'flexible',
    createdAt: '2026-08-01T00:00',
    updatedAt: '2026-08-01T00:00',
    name: o.id,
    deadline: '2026-08-31T09:00',
    ...o,
  }
}

/** 対象タスクの、その日の配置合計（分）。 */
function placedMinutes(result: Map<string, { timeline: { kind: string; sourceId?: string; interval: { start: number; end: number } }[] }>, date: string, taskId: string): number {
  const day = result.get(date)
  if (!day) return 0
  return day.timeline
    .filter((i) => i.kind === 'flexible' && i.sourceId === taskId)
    .reduce((s, i) => s + (i.interval.end - i.interval.start), 0)
}

describe('scheduleRange（複数日配分）', () => {
  it('1日で終わるタスクは初日にだけ配置し、翌日以降は重複しない', () => {
    const result = scheduleRange({
      dates: ['2026-08-05', '2026-08-06', '2026-08-07'],
      categories: noCategories,
      window: { start: 540, end: 720 }, // 9:00-12:00
      definitions: [flex({ id: 't', estimatedDuration: 60 })],
    })
    expect(placedMinutes(result, '2026-08-05', 't')).toBe(60) // 初日に配置
    expect(placedMinutes(result, '2026-08-06', 't')).toBe(0) // 重複しない
    expect(placedMinutes(result, '2026-08-07', 't')).toBe(0)
  })

  it('1日の容量を超える分割可能タスクは複数日に分散する', () => {
    // 300分・分割可能(最短60)。窓 9:00-12:00=180分/日 → 180 + 120 に分散。
    const result = scheduleRange({
      dates: ['2026-08-05', '2026-08-06'],
      categories: noCategories,
      window: { start: 540, end: 720 },
      definitions: [flex({ id: 'big', estimatedDuration: 300, splittable: true, minChunk: 60 })],
    })
    expect(placedMinutes(result, '2026-08-05', 'big')).toBe(180)
    expect(placedMinutes(result, '2026-08-06', 'big')).toBe(120)
  })
})
