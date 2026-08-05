import { describe, expect, it } from 'vitest'
import type { Category, FixedEvent, FlexibleTask, FreeActivity, LifeRoutine } from '../types'
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

function free(o: Partial<FreeActivity> & { id: string; duration: number }): FreeActivity {
  return {
    kind: 'free',
    createdAt: '2026-08-01T00:00',
    updatedAt: '2026-08-01T00:00',
    name: o.id,
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

  it('実行可能曜日に含まれない日は柔軟タスクを配置しない（§5.2）', () => {
    // 2026-08-05 は水曜(3)。allowedWeekdays に水を含まなければ未配置。
    const base = { date: DATE, categories: noCategories, window: { start: 540, end: 720 } }
    const excluded = scheduleDay({
      ...base,
      definitions: [flex({ id: 't', estimatedDuration: 60, allowedWeekdays: [1, 2] })], // 月火のみ
    })
    expect(excluded.timeline.find((i) => i.sourceId === 't')).toBeUndefined()

    const included = scheduleDay({
      ...base,
      definitions: [flex({ id: 't', estimatedDuration: 60, allowedWeekdays: [3] })], // 水
    })
    expect(included.timeline.find((i) => i.sourceId === 't')).toBeDefined()
  })

  it('実行可能時間帯の範囲内にだけ柔軟タスクを配置する（§5.2）', () => {
    // 窓 8:00-18:00、実行可能時間帯 13:00-14:00 のみ → その中に60分配置。
    const result = scheduleDay({
      date: DATE,
      categories: noCategories,
      window: { start: 480, end: 1080 },
      definitions: [
        flex({
          id: 't',
          estimatedDuration: 60,
          splittable: false,
          allowedTimeRanges: [{ start: '13:00', end: '14:00' }],
        }),
      ],
    })
    const task = result.timeline.find((i) => i.sourceId === 't')
    expect(task?.interval).toEqual({ start: 780, end: 840 }) // 13:00-14:00
  })

  it('実行可能時間帯に収まらなければ未配置（§5.2）', () => {
    const result = scheduleDay({
      date: DATE,
      categories: noCategories,
      window: { start: 480, end: 1080 },
      definitions: [
        flex({
          id: 't',
          estimatedDuration: 90, // 60分枠に入らない
          splittable: false,
          allowedTimeRanges: [{ start: '13:00', end: '14:00' }],
        }),
      ],
    })
    expect(result.timeline.find((i) => i.sourceId === 't')).toBeUndefined()
    expect(result.unplaced.map((u) => u.task.id)).toContain('t')
  })

  it('関連固定予定「開始前に実行」で固定の前にだけ配置する（§5.4）', () => {
    // 固定 13:00-14:00、タスクは開始前(doBeforeStart)条件 → 13:00 より前に配置。
    const result = scheduleDay({
      date: DATE,
      categories: noCategories,
      window: { start: 480, end: 1080 }, // 8:00-18:00
      definitions: [
        fixed({ id: 'meeting', start: '13:00', end: '14:00' }),
        flex({
          id: 't',
          estimatedDuration: 60,
          splittable: false,
          relatedFixed: { fixedEventId: 'meeting', condition: 'doBeforeStart' },
        }),
      ],
    })
    const task = result.timeline.find((i) => i.sourceId === 't')
    expect(task).toBeDefined()
    expect(task!.interval.end).toBeLessThanOrEqual(780) // 13:00 まで
  })

  it('関連固定予定「終了後に実行」で固定の後にだけ配置する（§5.4）', () => {
    const result = scheduleDay({
      date: DATE,
      categories: noCategories,
      window: { start: 480, end: 1080 },
      definitions: [
        fixed({ id: 'meeting', start: '09:00', end: '10:00' }),
        flex({
          id: 't',
          estimatedDuration: 60,
          splittable: false,
          relatedFixed: { fixedEventId: 'meeting', condition: 'doAfterEnd' },
        }),
      ],
    })
    const task = result.timeline.find((i) => i.sourceId === 't')
    expect(task).toBeDefined()
    expect(task!.interval.start).toBeGreaterThanOrEqual(600) // 10:00 以降
  })

  it('期限日を過ぎたタスクは配置しない（期限打ち切り）', () => {
    // DATE=2026-08-05。期限が前日のタスク → 配置しない。
    const result = scheduleDay({
      date: DATE,
      categories: noCategories,
      window: { start: 540, end: 720 },
      definitions: [flex({ id: 't', estimatedDuration: 60, deadline: '2026-08-04T09:00' })],
    })
    expect(result.timeline.find((i) => i.sourceId === 't')).toBeUndefined()
  })

  it('実績(completedByTask)を差し引いた残量で配置する', () => {
    // 推定120分、実績60分完了 → 残り60分だけ配置。
    const result = scheduleDay({
      date: DATE,
      categories: noCategories,
      window: { start: 540, end: 720 },
      definitions: [flex({ id: 't', estimatedDuration: 120, splittable: false })],
      completedByTask: new Map([['t', 60]]),
    })
    const task = result.timeline.find((i) => i.sourceId === 't')
    expect(task).toBeDefined()
    expect(task!.interval.end - task!.interval.start).toBe(60)
  })

  it('自由活動を残りの空きへ配置する（§3 の4番目）', () => {
    // 固定 9:00-10:00 の後、残り空きへ自由活動60分を配置。
    const result = scheduleDay({
      date: DATE,
      categories: noCategories,
      window: { start: 540, end: 720 }, // 9:00-12:00
      definitions: [fixed({ id: 'f', start: '09:00', end: '10:00' }), free({ id: 'game', duration: 60 })],
    })
    const g = result.timeline.find((i) => i.sourceId === 'game')
    expect(g?.kind).toBe('free')
    expect(g?.interval).toEqual({ start: 600, end: 660 }) // 10:00-11:00
  })

  it('自動配置オフの自由活動は配置しない（会話ログ）', () => {
    const result = scheduleDay({
      date: DATE,
      categories: noCategories,
      window: { start: 540, end: 720 },
      definitions: [free({ id: 'game', duration: 60, autoPlace: false })],
    })
    expect(result.timeline.find((i) => i.sourceId === 'game')).toBeUndefined()
  })

  it('実行可能曜日でない自由活動は配置しない（§5.2 相当）', () => {
    // DATE=2026-08-05 は水曜(3)。月火のみ許可 → 配置しない。
    const result = scheduleDay({
      date: DATE,
      categories: noCategories,
      window: { start: 540, end: 720 },
      definitions: [free({ id: 'game', duration: 60, allowedWeekdays: [1, 2] })],
    })
    expect(result.timeline.find((i) => i.sourceId === 'game')).toBeUndefined()
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

  it('休憩確保のため柔軟タスクを後ろへ動かして休憩を挿入する（§3 / I-1）', () => {
    // 窓 9:00-14:00。高負荷固定 9:00-11:00(6.0) の直後に柔軟60分が貪欲配置される。
    // 直後に空きが無いので柔軟を後ろへずらし、11:00 直後に休憩を確保する。
    const result = scheduleDay({
      date: DATE,
      categories: noCategories,
      window: { start: 540, end: 840 }, // 9:00-14:00
      definitions: [
        fixed({ id: 'hard', start: '09:00', end: '11:00', load: { focus: 3, mental: 3, physical: 3 } }),
        flex({ id: 't', estimatedDuration: 60, splittable: false }),
      ],
    })
    const brk = result.timeline.find((i) => i.kind === 'break')
    const task = result.timeline.find((i) => i.sourceId === 't')
    expect(brk?.interval).toEqual({ start: 660, end: 675 }) // 11:00 直後に15分休憩
    expect(task?.interval).toEqual({ start: 675, end: 735 }) // 柔軟タスクは休憩の後ろへ
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

describe('scheduleDay — 日をまたぐ設定（固定予定・生活ルーチン）', () => {
  const FULL = { start: 0, end: 1440 }

  it('日をまたぐ固定予定は当日=夜間・翌日=早朝に分割して占有する', () => {
    const night = fixed({ id: 'night', start: '23:00', end: '01:00' }) // date=2026-08-05
    // 当日(8/5): 夜間 23:00-24:00 のみ。
    const d1 = scheduleDay({ date: '2026-08-05', categories: noCategories, window: FULL, definitions: [night] })
    const ev = d1.timeline.filter((t) => t.sourceId === 'night')
    expect(ev).toHaveLength(1)
    expect(ev[0].interval).toEqual({ start: 1380, end: 1440 })
    // 翌日(8/6): 早朝 00:00-01:00 のみ。
    const d2 = scheduleDay({ date: '2026-08-06', categories: noCategories, window: FULL, definitions: [night] })
    const am = d2.timeline.filter((t) => t.sourceId === 'night')
    expect(am).toHaveLength(1)
    expect(am[0].interval).toEqual({ start: 0, end: 60 })
  })

  it('日をまたぐ固定予定の早朝占有で、翌日の早朝には柔軟タスクを置かない', () => {
    const night = fixed({ id: 'night', start: '23:00', end: '02:00' }) // 8/5 → 翌 02:00
    const d2 = scheduleDay({
      date: '2026-08-06',
      categories: noCategories,
      window: FULL,
      definitions: [
        night,
        flex({
          id: 't',
          estimatedDuration: 60,
          splittable: false,
          allowedTimeRanges: [{ start: '00:00', end: '02:00' }],
        }),
      ],
    })
    expect(d2.timeline.find((i) => i.sourceId === 't')).toBeUndefined()
  })

  it('日をまたぐ睡眠ルーチンは夜間と早朝の2ブロックに分割される', () => {
    const sleep = routine({
      id: 'sleep',
      routineType: 'sleep',
      occurrences: [{ allowedRange: { start: '23:00', end: '07:00' }, requiredTime: 480 }],
    })
    const d = scheduleDay({ date: '2026-08-05', categories: noCategories, window: FULL, definitions: [sleep] })
    const blocks = d.timeline
      .filter((t) => t.kind === 'routine')
      .map((t) => t.interval)
      .sort((a, b) => a.start - b.start)
    // 前夜からの早朝 00:00-07:00 と、当夜の 23:00-24:00。
    expect(blocks).toEqual([
      { start: 0, end: 420 },
      { start: 1380, end: 1440 },
    ])
  })

  it('日をまたぐ睡眠の早朝占有で、早朝には柔軟タスクを置かない', () => {
    const sleep = routine({
      id: 'sleep',
      routineType: 'sleep',
      occurrences: [{ allowedRange: { start: '23:00', end: '07:00' }, requiredTime: 480 }],
    })
    const d = scheduleDay({
      date: '2026-08-05',
      categories: noCategories,
      window: FULL,
      definitions: [
        sleep,
        flex({
          id: 't',
          estimatedDuration: 60,
          splittable: false,
          allowedTimeRanges: [{ start: '05:00', end: '06:30' }],
        }),
      ],
    })
    expect(d.timeline.find((i) => i.sourceId === 't')).toBeUndefined()
  })
})
