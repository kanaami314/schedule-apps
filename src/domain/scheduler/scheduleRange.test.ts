import { describe, expect, it } from 'vitest'
import type { Category, FlexibleTask, FreeActivity, Id } from '../types'
import { scheduleRange } from './scheduleRange'

function free(o: Partial<FreeActivity> & { id: string; duration: number }): FreeActivity {
  return { kind: 'free', createdAt: '2026-08-01T00:00', updatedAt: '2026-08-01T00:00', name: o.id, ...o }
}

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

  it('実績(completedByTask)を差し引いて残量を配分する', () => {
    // 推定300分・分割可、実績180分完了 → 残り120分。窓180分/日 → 初日に120、翌日0。
    const result = scheduleRange({
      dates: ['2026-08-05', '2026-08-06'],
      categories: noCategories,
      window: { start: 540, end: 720 },
      definitions: [flex({ id: 'big', estimatedDuration: 300, splittable: true, minChunk: 60 })],
      completedByTask: new Map([['big', 180]]),
    })
    expect(placedMinutes(result, '2026-08-05', 'big')).toBe(120)
    expect(placedMinutes(result, '2026-08-06', 'big')).toBe(0)
  })

  it('notBefore より前（過去日）には柔軟タスクを配置せず、当日以降の空きへ配分する', () => {
    // 今日=08-05。週(月〜日)を渡しても過去日(03,04)には置かず、当日(05)へ配置する。
    const dates = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07']
    const result = scheduleRange({
      dates,
      categories: noCategories,
      window: { start: 540, end: 720 },
      definitions: [flex({ id: 't', estimatedDuration: 60 })],
      notBefore: '2026-08-05',
    })
    expect(placedMinutes(result, '2026-08-03', 't')).toBe(0) // 過去日は空
    expect(placedMinutes(result, '2026-08-04', 't')).toBe(0)
    expect(placedMinutes(result, '2026-08-05', 't')).toBe(60) // 当日に配置
  })

  it('過去日で容量を消費しないため、当日以降にちょうど残量ぶん配分できる', () => {
    // 300分・分割可(最短60)。窓180分/日。過去日(04)は置かず、05→180・06→120。
    const dates = ['2026-08-04', '2026-08-05', '2026-08-06']
    const result = scheduleRange({
      dates,
      categories: noCategories,
      window: { start: 540, end: 720 },
      definitions: [flex({ id: 'big', estimatedDuration: 300, splittable: true, minChunk: 60 })],
      notBefore: '2026-08-05',
    })
    expect(placedMinutes(result, '2026-08-04', 'big')).toBe(0)
    expect(placedMinutes(result, '2026-08-05', 'big')).toBe(180)
    expect(placedMinutes(result, '2026-08-06', 'big')).toBe(120)
  })

  it('自由活動の希望頻度（週N回）を守る', () => {
    // 週2回の自由活動。同週の月〜金5日 → 2日だけ配置される。
    const dates = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07'] // 月〜金
    const result = scheduleRange({
      dates,
      categories: noCategories,
      window: { start: 540, end: 720 },
      definitions: [free({ id: 'game', duration: 60, frequency: { count: 2, unit: 'week' } })],
    })
    const placedDays = dates.filter((d) =>
      result.get(d)?.timeline.some((i) => i.kind === 'free' && i.sourceId === 'game'),
    )
    expect(placedDays).toHaveLength(2)
  })
})
