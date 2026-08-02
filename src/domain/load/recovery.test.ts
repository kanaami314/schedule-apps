import { describe, expect, it } from 'vitest'
import { applyRecovery, recoveryRatio } from './recovery'
import type { CumulativeLoad } from './score'

const cum = (total: number): CumulativeLoad => ({
  focus: total,
  mental: total,
  physical: total,
  total,
})

describe('recoveryRatio (§13)', () => {
  it('休憩 §13.1', () => {
    expect(recoveryRatio('break', 4)).toBe(0)
    expect(recoveryRatio('break', 5)).toBe(0.25)
    expect(recoveryRatio('break', 14)).toBe(0.25)
    expect(recoveryRatio('break', 15)).toBe(0.5)
    expect(recoveryRatio('break', 29)).toBe(0.5)
    expect(recoveryRatio('break', 30)).toBe(1.0)
  })

  it('睡眠 §13.2', () => {
    expect(recoveryRatio('sleep', 29)).toBe(0.25)
    expect(recoveryRatio('sleep', 30)).toBe(0.5)
    expect(recoveryRatio('sleep', 119)).toBe(0.5)
    expect(recoveryRatio('sleep', 120)).toBe(1.0)
  })

  it('食事 §13.3（最終確定: 30分以上=50%）', () => {
    expect(recoveryRatio('meal', 14)).toBe(0.1)
    expect(recoveryRatio('meal', 15)).toBe(0.25)
    expect(recoveryRatio('meal', 29)).toBe(0.25)
    expect(recoveryRatio('meal', 30)).toBe(0.5)
    expect(recoveryRatio('meal', 90)).toBe(0.5)
  })

  it('入浴 §13.4（30分以上=40%）', () => {
    expect(recoveryRatio('bath', 14)).toBe(0.1)
    expect(recoveryRatio('bath', 15)).toBe(0.25)
    expect(recoveryRatio('bath', 30)).toBe(0.4)
  })

  it('予定未配置区間 §13.5', () => {
    expect(recoveryRatio('idle', 4)).toBe(0)
    expect(recoveryRatio('idle', 5)).toBe(0.1)
    expect(recoveryRatio('idle', 14)).toBe(0.1)
    expect(recoveryRatio('idle', 15)).toBe(0.25)
    expect(recoveryRatio('idle', 30)).toBe(0.5)
    expect(recoveryRatio('idle', 59)).toBe(0.5)
    expect(recoveryRatio('idle', 60)).toBe(1.0)
  })
})

describe('applyRecovery (§13)', () => {
  it('15分休憩は累積を半減（6.0 → 3.0）', () => {
    expect(applyRecovery(cum(6), 'break', 15).total).toBeCloseTo(3.0, 10)
  })

  it('30分入浴は40%カット（6.0 → 3.6）', () => {
    expect(applyRecovery(cum(6), 'bath', 30).total).toBeCloseTo(3.6, 10)
  })

  it('20分未配置は25%カット（6.0 → 4.5）', () => {
    expect(applyRecovery(cum(6), 'idle', 20).total).toBeCloseTo(4.5, 10)
  })

  it('30分以上の休憩は完全リセット（0）', () => {
    const r = applyRecovery(cum(8), 'break', 30)
    expect(r).toEqual({ focus: 0, mental: 0, physical: 0, total: 0 })
  })

  it('各軸を同じ割合で減らす', () => {
    const before: CumulativeLoad = { focus: 4, mental: 8, physical: 2, total: (4 + 8 + 2) / 3 }
    const after = applyRecovery(before, 'break', 15) // 50%カット
    expect(after.focus).toBe(2)
    expect(after.mental).toBe(4)
    expect(after.physical).toBe(1)
  })

  it('連続する回復区間は逐次適用（掛け合わせ）', () => {
    // 食事30分(50%カット) → 未配置20分(25%カット): 6.0 × 0.5 × 0.75 = 2.25
    const afterMeal = applyRecovery(cum(6), 'meal', 30)
    const afterIdle = applyRecovery(afterMeal, 'idle', 20)
    expect(afterIdle.total).toBeCloseTo(2.25, 10)
  })
})
