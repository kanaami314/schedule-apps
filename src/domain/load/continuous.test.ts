import { describe, expect, it } from 'vitest'
import type { ResolvedLoad } from '../types'
import {
  breakRequirement,
  foldLoad,
  foldLoadTrace,
  loadState,
  resolveBreakMinutes,
  type LoadSegment,
} from './continuous'

const load = (f: 1 | 2 | 3, m: 1 | 2 | 3, p: 1 | 2 | 3): ResolvedLoad => ({
  focus: f,
  mental: m,
  physical: p,
})

describe('loadState (§12)', () => {
  it('閾値 4/6/8 で状態が変わる', () => {
    expect(loadState(3.9)).toBe('normal')
    expect(loadState(4.0)).toBe('accumulating')
    expect(loadState(5.9)).toBe('accumulating')
    expect(loadState(6.0)).toBe('high')
    expect(loadState(7.9)).toBe('high')
    expect(loadState(8.0)).toBe('veryHigh')
  })
})

describe('breakRequirement (§12, §12.1)', () => {
  it('4.0未満は休憩不要', () => {
    expect(breakRequirement(3.5)).toBeNull()
  })
  it('4.0〜6.0未満は任意・目標10分', () => {
    expect(breakRequirement(5.0)).toMatchObject({ mandatory: false, targetMinutes: 10 })
  })
  it('6.0〜8.0未満は必須・15分', () => {
    expect(breakRequirement(6.5)).toMatchObject({ mandatory: true, targetMinutes: 15 })
  })
  it('8.0以上は必須・30分', () => {
    expect(breakRequirement(8.5)).toMatchObject({ mandatory: true, targetMinutes: 30 })
  })
})

describe('resolveBreakMinutes (§12 / M-1)', () => {
  it('空きが十分なら目標どおり', () => {
    expect(resolveBreakMinutes(6.5, 60)).toBe(15)
    expect(resolveBreakMinutes(8.5, 60)).toBe(30)
  })
  it('空きが少なければ短縮する', () => {
    expect(resolveBreakMinutes(8.5, 12)).toBe(12)
  })
  it('5分未満しか取れなければ配置しない', () => {
    expect(resolveBreakMinutes(6.5, 4)).toBeNull()
  })
  it('休憩不要なら null', () => {
    expect(resolveBreakMinutes(3.0, 60)).toBeNull()
  })
})

describe('foldLoad / foldLoadTrace (§11.3 + §12 + §13)', () => {
  it('連続する予定の負荷を加算する（§12 の例: 6.0を超える）', () => {
    // 授業 u2.0×1.5h=3.0, 研究 u2.667×1h=2.667, メール u1.667×0.5h=0.833 → 計 ~6.5
    const segments: LoadSegment[] = [
      { type: 'load', load: load(2, 2, 2), minutes: 90 },
      { type: 'load', load: load(3, 3, 2), minutes: 60 },
      { type: 'load', load: load(2, 2, 1), minutes: 30 },
    ]
    const trace = foldLoadTrace(segments)
    expect(trace[0].after.total).toBeCloseTo(3.0, 6)
    expect(trace[1].after.total).toBeCloseTo(5.667, 3) // まだ6.0未満
    expect(trace[2].after.total).toBeGreaterThanOrEqual(6.0) // ここで休憩必要
  })

  it('30分の休憩で連続負荷が0にリセットされる（§13.1）', () => {
    const segments: LoadSegment[] = [
      { type: 'load', load: load(3, 3, 3), minutes: 120 }, // total 6.0
      { type: 'recovery', interval: 'break', minutes: 30 }, // 100%カット
    ]
    expect(foldLoad(segments).total).toBeCloseTo(0, 10)
  })

  it('回復区間を挟むと連続負荷が減る（§13）', () => {
    const segments: LoadSegment[] = [
      { type: 'load', load: load(3, 3, 3), minutes: 60 }, // total 3.0
      { type: 'recovery', interval: 'idle', minutes: 20 }, // 25%カット → 2.25
      { type: 'load', load: load(3, 3, 3), minutes: 60 }, // +3.0 → 5.25
    ]
    expect(foldLoad(segments).total).toBeCloseTo(5.25, 6)
  })

  it('自由活動を時系列に含められる', () => {
    const segments: LoadSegment[] = [
      { type: 'load', load: load(3, 3, 1), minutes: 120 }, // total 4.667
      {
        type: 'free',
        minutes: 60,
        recoveryEffects: [{ effect: 'stressRelief', intensity: 3 }], // 精神を回復
      },
    ]
    const after = foldLoad(segments)
    // stressRelief(3) 1h = 効果量1.5 全て精神へ、上限 mental(6×0.75=4.5)内 → mental 6−1.5=4.5
    expect(after.mental).toBeCloseTo(4.5, 6)
    expect(after.focus).toBeCloseTo(6, 6) // 集中は変化なし
  })

  it('initial を与えると続きから累積する', () => {
    const initial = { focus: 6, mental: 6, physical: 6, total: 6 }
    const segments: LoadSegment[] = [{ type: 'recovery', interval: 'break', minutes: 15 }]
    expect(foldLoad(segments, initial).total).toBeCloseTo(3.0, 6) // 50%カット
  })
})
