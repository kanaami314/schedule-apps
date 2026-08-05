import { describe, expect, it } from 'vitest'
import type { FlexibleTask } from '../types'
import type { Interval } from './intervals'
import { placeFlexibleTasks, type PlaceOptions } from './placement'

const iv = (start: number, end: number): Interval => ({ start, end })

function task(o: Partial<FlexibleTask> & { id: string; estimatedDuration: number }): FlexibleTask {
  return {
    kind: 'flexible',
    createdAt: '2026-08-01T00:00',
    updatedAt: '2026-08-01T00:00',
    name: o.id,
    deadline: '2026-08-10T09:00',
    ...o,
  }
}

// 稼働窓 9:00-18:00 = 540..1080
const window = iv(540, 1080)

describe('placeFlexibleTasks — 分割不可', () => {
  it('連続空きに前詰めで配置する', () => {
    const opts: PlaceOptions = {
      window,
      busy: [],
      tasks: [task({ id: 't1', estimatedDuration: 120 })],
    }
    const { placements, unplaced } = placeFlexibleTasks(opts)
    expect(unplaced).toHaveLength(0)
    expect(placements).toHaveLength(1)
    expect(placements[0].interval).toEqual(iv(540, 660)) // 9:00-11:00
    expect(placements[0].sourceId).toBe('t1')
  })

  it('複数タスクを順に前詰めする', () => {
    const opts: PlaceOptions = {
      window,
      busy: [],
      tasks: [
        task({ id: 'a', estimatedDuration: 60 }),
        task({ id: 'b', estimatedDuration: 90 }),
      ],
    }
    const { placements } = placeFlexibleTasks(opts)
    expect(placements.map((p) => p.interval)).toEqual([iv(540, 600), iv(600, 690)])
  })

  it('連続時間が足りなければ noContiguousBlock', () => {
    // 空きは 60分ずつに分断、合計は足りるが連続では足りない
    const opts: PlaceOptions = {
      window,
      busy: [iv(600, 1020)], // 10:00-17:00 を埋める → 空きは 540-600(60) と 1020-1080(60)
      tasks: [task({ id: 'big', estimatedDuration: 90, splittable: false })],
    }
    const { placements, unplaced } = placeFlexibleTasks(opts)
    expect(placements).toHaveLength(0)
    expect(unplaced[0].reason).toBe('noContiguousBlock')
  })

  it('総空き時間が足りなければ insufficientFreeTime', () => {
    const opts: PlaceOptions = {
      window: iv(540, 600), // 60分しかない
      busy: [],
      tasks: [task({ id: 'big', estimatedDuration: 120, splittable: false })],
    }
    expect(placeFlexibleTasks(opts).unplaced[0].reason).toBe('insufficientFreeTime')
  })
})

describe('placeFlexibleTasks — 分割可能', () => {
  it('複数の空きへ分割配置する', () => {
    // 10:00-11:00 を埋め、9:00-10:00(60) と 11:00-... が空き。180分・最短30を分割配置
    const opts: PlaceOptions = {
      window,
      busy: [iv(600, 660)],
      tasks: [task({ id: 's', estimatedDuration: 180, splittable: true, minChunk: 30 })],
    }
    const { placements, unplaced } = placeFlexibleTasks(opts)
    expect(unplaced).toHaveLength(0)
    // 合計180分が配置されている
    const total = placements.reduce((s, p) => s + (p.interval.end - p.interval.start), 0)
    expect(total).toBe(180)
    // 最初のセッションは 9:00-10:00 の空きを使う
    expect(placements[0].interval).toEqual(iv(540, 600))
  })

  it('preferredChunk を1セッションの上限として尊重しつつ詰める', () => {
    const opts: PlaceOptions = {
      window: iv(0, 120),
      busy: [],
      tasks: [
        task({ id: 'p', estimatedDuration: 90, splittable: true, minChunk: 30, preferredChunk: 30 }),
      ],
    }
    const { placements } = placeFlexibleTasks(opts)
    const total = placements.reduce((s, p) => s + (p.interval.end - p.interval.start), 0)
    expect(total).toBe(90)
  })

  it('最短作業時間を満たせない断片しか残らなければ minChunkNotMet', () => {
    // 空きが 20分の2枠のみ、最短30 → 配置不可（合計は足りるが最短を満たせない）
    const opts: PlaceOptions = {
      window: iv(0, 100),
      busy: [iv(20, 40), iv(60, 80)], // 空き: 0-20, 40-60, 80-100 の 20分×3
      tasks: [task({ id: 'x', estimatedDuration: 40, splittable: true, minChunk: 30 })],
    }
    const { placements, unplaced } = placeFlexibleTasks(opts)
    expect(placements).toHaveLength(0)
    expect(unplaced[0].reason).toBe('minChunkNotMet')
  })
})

describe('placeFlexibleTasks — 実行可能時間帯（日またぎ）', () => {
  it('日をまたぐ許可範囲（22:00〜02:00）の夜間側に配置できる', () => {
    // 早朝が埋まっており、夜間 22:00-24:00 のみ空く状況。
    const opts: PlaceOptions = {
      window: iv(0, 1440),
      busy: [iv(0, 1320)], // 00:00-22:00 を占有 → 空きは 1320-1440 のみ
      tasks: [
        task({
          id: 'night',
          estimatedDuration: 90,
          allowedTimeRanges: [{ start: '22:00', end: '02:00' }],
        }),
      ],
    }
    const { placements, unplaced } = placeFlexibleTasks(opts)
    expect(unplaced).toHaveLength(0)
    // 夜間 1320-1440 に前詰め（22:00-23:30）される
    expect(placements[0].interval).toEqual(iv(1320, 1410))
  })

  it('日またぎ範囲で夜間が埋まっていれば早朝へ回る', () => {
    const opts: PlaceOptions = {
      window: iv(0, 1440),
      busy: [iv(60, 1440)], // 01:00-24:00 を占有 → 空きは 0-60 のみ
      tasks: [
        task({
          id: 'night',
          estimatedDuration: 45,
          allowedTimeRanges: [{ start: '22:00', end: '02:00' }],
        }),
      ],
    }
    const { placements, unplaced } = placeFlexibleTasks(opts)
    expect(unplaced).toHaveLength(0)
    expect(placements[0].interval).toEqual(iv(0, 45)) // 00:00-00:45（早朝側）
  })
})

describe('placeFlexibleTasks — 優先度の高いタスクが先に空きを取る', () => {
  it('整列順に前詰めされ、後続は残りに入る', () => {
    const opts: PlaceOptions = {
      window: iv(0, 120),
      busy: [],
      tasks: [
        task({ id: 'first', estimatedDuration: 90, splittable: false }),
        task({ id: 'second', estimatedDuration: 60, splittable: false }),
      ],
    }
    const { placements, unplaced } = placeFlexibleTasks(opts)
    expect(placements[0].interval).toEqual(iv(0, 90))
    // 残り 90-120 の30分では second(60) は入らない
    expect(unplaced.map((u) => u.task.id)).toEqual(['second'])
  })
})
