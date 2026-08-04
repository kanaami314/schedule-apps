import { describe, expect, it } from 'vitest'
import type { ResolvedLoad } from '../types'
import { insertBreaks, type TimelineEntry } from './breakInsertion'
import type { Interval } from './intervals'

const iv = (start: number, end: number): Interval => ({ start, end })
const load = (f: 1 | 2 | 3, m: 1 | 2 | 3, p: 1 | 2 | 3): ResolvedLoad => ({
  focus: f,
  mental: m,
  physical: p,
})

const day = iv(0, 1440)

describe('insertBreaks (§12 / C-4)', () => {
  it('負荷が6.0以上になった予定の直後の空きに休憩を挿入する', () => {
    // (3,3,3)×120分 = 総合6.0。直後に30分の空き → 15分休憩
    const entries: TimelineEntry[] = [
      { interval: iv(0, 120), segment: { type: 'load', load: load(3, 3, 3), minutes: 120 } },
      { interval: iv(150, 210), segment: { type: 'load', load: load(2, 2, 2), minutes: 60 } },
    ]
    const { breaks } = insertBreaks(entries, day)
    expect(breaks).toHaveLength(1)
    expect(breaks[0].interval).toEqual(iv(120, 135)) // 直後に15分
    expect(breaks[0].kind).toBe('break')
  })

  it('8.0以上では30分の休憩', () => {
    // (3,3,3)×160分 = 総合8.0
    const entries: TimelineEntry[] = [
      { interval: iv(0, 160), segment: { type: 'load', load: load(3, 3, 3), minutes: 160 } },
    ]
    const { breaks } = insertBreaks(entries, day)
    expect(breaks[0].interval).toEqual(iv(160, 190)) // 30分
  })

  it('負荷が閾値未満なら休憩を入れない', () => {
    const entries: TimelineEntry[] = [
      { interval: iv(0, 60), segment: { type: 'load', load: load(2, 2, 2), minutes: 60 } }, // 総合2.0
    ]
    expect(insertBreaks(entries, day).breaks).toHaveLength(0)
  })

  it('直後の空きが5分未満なら休憩を配置しない', () => {
    // 6.0以上だが、稼働窓の終端まで3分しかない → 配置しない
    const entries: TimelineEntry[] = [
      { interval: iv(0, 120), segment: { type: 'load', load: load(3, 3, 3), minutes: 120 } },
    ]
    expect(insertBreaks(entries, iv(0, 123)).breaks).toHaveLength(0)
  })

  it('休憩後は連続負荷がリセットされ、後続で再び蓄積する', () => {
    // item1 総合6.0 → 15分休憩(50%減→3.0) → 30分空き(idle 50%減→1.5) → item2 +3.0 = 4.5
    const entries: TimelineEntry[] = [
      { interval: iv(0, 120), segment: { type: 'load', load: load(3, 3, 3), minutes: 120 } },
      { interval: iv(165, 225), segment: { type: 'load', load: load(3, 3, 3), minutes: 60 } },
    ]
    const { breaks, finalLoad } = insertBreaks(entries, day)
    expect(breaks).toHaveLength(1)
    expect(breaks[0].interval).toEqual(iv(120, 135))
    // 6.0×0.5(休憩15分)=3.0 → 空き 135..165=30分 idle 50%減 →1.5 → +3.0 =4.5
    expect(finalLoad.total).toBeCloseTo(4.5, 6)
  })

  it('空き時間が少なければ取れる最大時間で休憩を配置する', () => {
    // 6.0以上だが直後の空きは10分のみ → 10分休憩（目標15分を短縮）
    const entries: TimelineEntry[] = [
      { interval: iv(0, 120), segment: { type: 'load', load: load(3, 3, 3), minutes: 120 } },
      { interval: iv(130, 190), segment: { type: 'load', load: load(2, 2, 2), minutes: 60 } },
    ]
    const { breaks } = insertBreaks(entries, day)
    expect(breaks[0].interval).toEqual(iv(120, 130)) // 10分
  })

  it('直後に空きが無くても、可動予定を後ろへずらして休憩を確保する（§3 / I-1）', () => {
    // 6.0の固定直後に隙間なく可動な柔軟タスク。後方は空いている → 柔軟を後ろへ動かし15分休憩。
    const entries: TimelineEntry[] = [
      { interval: iv(0, 120), segment: { type: 'load', load: load(3, 3, 3), minutes: 120 }, movable: false },
      { interval: iv(120, 180), segment: { type: 'load', load: load(2, 2, 2), minutes: 60 }, movable: true, id: 't1' },
    ]
    const { breaks, moved } = insertBreaks(entries, day)
    expect(breaks[0].interval).toEqual(iv(120, 135)) // 直後に15分休憩
    expect(moved.get('t1')).toEqual(iv(135, 195)) // 柔軟タスクは15分後ろへ
  })

  it('壁（固定予定）までの範囲で確保できる最大時間に短縮する（§3 / C-4）', () => {
    // 固定→柔軟(可動)→固定(壁, 185開始)。壁まで容量5分 → 5分休憩＋柔軟を185直前まで移動。
    const entries: TimelineEntry[] = [
      { interval: iv(0, 120), segment: { type: 'load', load: load(3, 3, 3), minutes: 120 }, movable: false },
      { interval: iv(120, 180), segment: { type: 'load', load: load(2, 2, 2), minutes: 60 }, movable: true, id: 't1' },
      { interval: iv(185, 245), segment: { type: 'load', load: load(2, 2, 2), minutes: 60 }, movable: false },
    ]
    const { breaks, moved } = insertBreaks(entries, day)
    expect(breaks[0].interval).toEqual(iv(120, 125)) // 5分
    expect(moved.get('t1')).toEqual(iv(125, 185)) // 壁の直前まで
  })

  it('可動予定を動かしても稼働終了までに5分すら確保できなければ休憩を配置しない', () => {
    // 固定→柔軟(可動)で稼働窓が 182 で終わる → 容量2分 → 配置せず移動もしない。
    const entries: TimelineEntry[] = [
      { interval: iv(0, 120), segment: { type: 'load', load: load(3, 3, 3), minutes: 120 }, movable: false },
      { interval: iv(120, 180), segment: { type: 'load', load: load(2, 2, 2), minutes: 60 }, movable: true, id: 't1' },
    ]
    const { breaks, moved } = insertBreaks(entries, iv(0, 182))
    expect(breaks).toHaveLength(0)
    expect(moved.size).toBe(0)
  })
})
