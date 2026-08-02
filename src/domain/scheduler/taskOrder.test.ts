import { describe, expect, it } from 'vitest'
import type { FlexibleTask } from '../types'
import {
  compareFlexibleTasks,
  deadlineBucket,
  orderFlexibleTasks,
  type TaskOrderContext,
} from './taskOrder'

const ctx: TaskOrderContext = { referenceTime: '2026-08-02T09:00' }

function task(o: Partial<FlexibleTask> & { id: string }): FlexibleTask {
  return {
    kind: 'flexible',
    createdAt: '2026-08-01T00:00',
    updatedAt: '2026-08-01T00:00',
    name: o.id,
    deadline: '2026-08-10T09:00',
    estimatedDuration: 60,
    ...o,
  }
}

describe('deadlineBucket (C-3)', () => {
  it('期限超過・当日は 0', () => {
    expect(deadlineBucket(task({ id: 'a', deadline: '2026-08-01T09:00' }), ctx)).toBe(0)
    expect(deadlineBucket(task({ id: 'b', deadline: '2026-08-02T20:00' }), ctx)).toBe(0)
  })
  it('3日以内は 1（〆切間近）', () => {
    expect(deadlineBucket(task({ id: 'c', deadline: '2026-08-04T09:00' }), ctx)).toBe(1)
  })
  it('それ以降は 2（通常）', () => {
    expect(deadlineBucket(task({ id: 'd', deadline: '2026-08-10T09:00' }), ctx)).toBe(2)
  })
})

describe('compareFlexibleTasks — キー優先順', () => {
  it('締切区分が優先度より先に効く', () => {
    // 期限は先(通常)だが高優先度 vs 間近だが低優先度 → 間近が先
    const nearLow = task({ id: 'near', deadline: '2026-08-03T09:00', priority: 'low' })
    const farHigh = task({ id: 'far', deadline: '2026-08-20T09:00', priority: 'high' })
    expect(orderFlexibleTasks([farHigh, nearLow], ctx).map((t) => t.id)).toEqual(['near', 'far'])
  })

  it('同じ締切区分では優先度が高い順', () => {
    const hi = task({ id: 'hi', priority: 'high' })
    const lo = task({ id: 'lo', priority: 'low' })
    expect(orderFlexibleTasks([lo, hi], ctx).map((t) => t.id)).toEqual(['hi', 'lo'])
  })

  it('同優先度では期限の厳しさ（厳守が先）', () => {
    const strict = task({ id: 'strict', deadlineStrictness: 'strict' })
    const loose = task({ id: 'loose', deadlineStrictness: 'loose' })
    expect(orderFlexibleTasks([loose, strict], ctx).map((t) => t.id)).toEqual(['strict', 'loose'])
  })

  it('同厳しさでは残り時間が短い順（期限が早い順）', () => {
    const early = task({ id: 'early', deadline: '2026-08-08T09:00' })
    const late = task({ id: 'late', deadline: '2026-08-09T09:00' })
    expect(orderFlexibleTasks([late, early], ctx).map((t) => t.id)).toEqual(['early', 'late'])
  })

  it('分割しにくいタスクを優先（不可 > 可、可の中は最短作業が長い順）', () => {
    const base = { deadline: '2026-08-09T09:00' as const }
    const noSplit = task({ id: 'no', ...base, splittable: false })
    const splitLong = task({ id: 'long', ...base, splittable: true, minChunk: 60 })
    const splitShort = task({ id: 'short', ...base, splittable: true, minChunk: 15 })
    expect(orderFlexibleTasks([splitShort, splitLong, noSplit], ctx).map((t) => t.id)).toEqual([
      'no',
      'long',
      'short',
    ])
  })

  it('同条件では所要時間が短い順、最後に登録が古い順', () => {
    const base = { deadline: '2026-08-09T09:00' as const, splittable: false }
    const shortDur = task({ id: 'shortDur', ...base, estimatedDuration: 30 })
    const longDur = task({ id: 'longDur', ...base, estimatedDuration: 120 })
    expect(orderFlexibleTasks([longDur, shortDur], ctx).map((t) => t.id)).toEqual([
      'shortDur',
      'longDur',
    ])

    const old = task({ id: 'old', ...base, estimatedDuration: 60, createdAt: '2026-07-01T00:00' })
    const recent = task({
      id: 'recent',
      ...base,
      estimatedDuration: 60,
      createdAt: '2026-07-20T00:00',
    })
    expect(orderFlexibleTasks([recent, old], ctx).map((t) => t.id)).toEqual(['old', 'recent'])
  })

  it('完全同一なら0（順序を入れ替えない）', () => {
    const a = task({ id: 'a', splittable: false })
    const b = task({ id: 'b', splittable: false })
    expect(compareFlexibleTasks(a, b, ctx)).toBe(0)
  })
})
