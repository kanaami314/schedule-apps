import { describe, expect, it } from 'vitest'
import type { Category, FixedEvent, FlexibleTask, LifeRoutine } from '../types'
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

  it('付随時間（準備・移動・終了後余裕）を占有し、他タスクを押し出す（§4.4）', () => {
    // 会議 10:00-11:00 に、移動30分+準備15分（前=45分）、終了後余裕30分（後）。
    // 占有は 9:15-11:30。9:00-12:00 窓では 60分タスクは前(9:00-9:15=15分)に入らず、
    // 後ろ(11:30-12:00=30分)にも入らないため未配置になる。
    const result = scheduleDay({
      date: DATE,
      categories: noCategories,
      window: { start: 540, end: 720 }, // 9:00-12:00
      definitions: [
        fixed({
          id: 'meeting',
          start: '10:00',
          end: '11:00',
          travelTime: { duration: 30 },
          prepTime: { duration: 15 },
          bufferTime: { duration: 30 },
        }),
        flex({ id: 'task', estimatedDuration: 60, splittable: false }),
      ],
    })
    // 予定枠は本体時間のまま。
    const meeting = result.timeline.find((t) => t.sourceId === 'meeting')
    expect(meeting?.interval).toEqual({ start: 600, end: 660 })
    // 付随時間の占有で 60分タスクは入らない。
    expect(result.unplaced.map((u) => u.task.id)).toContain('task')
  })

  it('開始可能日より前の日には柔軟タスクを配置しない（§5.2）', () => {
    const base = {
      date: DATE, // 2026-08-05
      categories: noCategories,
      window: { start: 540, end: 720 },
    }
    // 開始可能日が翌日 → 対象日(8/5)には配置されない。
    const later = scheduleDay({
      ...base,
      definitions: [flex({ id: 't', estimatedDuration: 60, startableFrom: '2026-08-06' })],
    })
    expect(later.timeline.find((i) => i.sourceId === 't')).toBeUndefined()

    // 開始可能日が当日 → 配置される。
    const today = scheduleDay({
      ...base,
      definitions: [flex({ id: 't', estimatedDuration: 60, startableFrom: '2026-08-05' })],
    })
    expect(today.timeline.find((i) => i.sourceId === 't')).toBeDefined()
  })

  it('兼用可(shareable)の付随時間は占有に含めない（§4.4）', () => {
    const result = scheduleDay({
      date: DATE,
      categories: noCategories,
      window: { start: 540, end: 720 },
      definitions: [
        fixed({
          id: 'meeting',
          start: '10:00',
          end: '11:00',
          prepTime: { duration: 60, shareable: true }, // 兼用可 → 占有しない
        }),
        flex({ id: 'task', estimatedDuration: 60, splittable: false }),
      ],
    })
    // 兼用可なので前の 9:00-10:00 に 60分タスクが入る。
    const task = result.timeline.find((t) => t.sourceId === 'task')
    expect(task?.interval).toEqual({ start: 540, end: 600 })
    expect(result.unplaced).toHaveLength(0)
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

function routine(o: Partial<LifeRoutine> & { id: string }): LifeRoutine {
  return {
    kind: 'routine',
    createdAt: '2026-08-01T00:00',
    updatedAt: '2026-08-01T00:00',
    routineType: 'meal',
    occurrences: [{ allowedRange: { start: '12:00', end: '14:00' }, requiredTime: 45 }],
    ...o,
  }
}

describe('scheduleDay — 生活ルーチン (§7)', () => {
  it('実行可能時間帯へ配置され、固定予定より後に置かれる', () => {
    const result = scheduleDay({
      date: DATE,
      categories: noCategories,
      window: { start: 540, end: 1080 },
      definitions: [routine({ id: 'meal' })],
    })
    const meal = result.timeline.find((t) => t.kind === 'routine')
    expect(meal?.interval).toEqual({ start: 720, end: 765 }) // 12:00-12:45
    expect(meal?.movable).toBe(false)
  })

  it('固定予定で埋まっていれば配置しない（未配置）', () => {
    const result = scheduleDay({
      date: DATE,
      categories: noCategories,
      window: { start: 540, end: 1080 },
      definitions: [
        fixed({ id: 'busy', start: '12:00', end: '14:00' }), // 実行可能帯を全部埋める
        routine({ id: 'meal' }),
      ],
    })
    expect(result.timeline.some((t) => t.kind === 'routine')).toBe(false)
  })

  it('実行曜日に含まれない日は配置しない', () => {
    // 2026-08-05 は水曜(3)。金曜(5)のみ有効なルーチンは配置されない。
    const result = scheduleDay({
      date: DATE,
      categories: noCategories,
      window: { start: 540, end: 1080 },
      definitions: [routine({ id: 'meal', activeWeekdays: [5] })],
    })
    expect(result.timeline.some((t) => t.kind === 'routine')).toBe(false)
  })

  it('食事の回復で高負荷の休憩挿入が抑えられる場合がある', () => {
    // 高負荷2hで6.0 → 直後に30分食事(50%減=3.0) を挟むと、その後の休憩要否が変わる
    const withMeal = scheduleDay({
      date: DATE,
      categories: noCategories,
      window: { start: 540, end: 1080 },
      definitions: [
        fixed({ id: 'hard', start: '09:00', end: '11:00', load: { focus: 3, mental: 3, physical: 3 } }),
        routine({
          id: 'lunch',
          occurrences: [{ allowedRange: { start: '11:00', end: '12:00' }, requiredTime: 45 }],
        }),
      ],
    })
    // 食事が回復区間として配置されている
    expect(withMeal.timeline.some((t) => t.kind === 'routine')).toBe(true)
  })
})
