import { describe, expect, it } from 'vitest'
import { applyFreeActivity, computeFreeActivityDelta } from './freeActivity'
import type { CumulativeLoad } from './score'

const cumul = (focus: number, mental: number, physical: number): CumulativeLoad => ({
  focus,
  mental,
  physical,
  total: (focus + mental + physical) / 3,
})

describe('自由活動の効果計算 (§6 / C-5)', () => {
  it('効果量 = 強度 × 時間 × 0.5 を配分（リラックス強い1h）', () => {
    // relax(3) 1h → 効果量 1.5、配分 集中25%/精神75% → focus0.375, mental1.125
    const before = cumul(6, 6, 2)
    const { recovery } = computeFreeActivityDelta(before, {
      durationMinutes: 60,
      recoveryEffects: [{ effect: 'relax', intensity: 3 }],
    })
    expect(recovery.focus).toBeCloseTo(0.375, 6)
    expect(recovery.mental).toBeCloseTo(1.125, 6)
  })

  it('複数効果を合算し、身体は回復しない', () => {
    // refresh(3):1.5(50/50)=f0.75,m0.75  achievement(2):1.0(25/75)=f0.25,m0.75
    const before = cumul(6, 6, 2)
    const { recovery } = computeFreeActivityDelta(before, {
      durationMinutes: 60,
      recoveryEffects: [
        { effect: 'refresh', intensity: 3 },
        { effect: 'achievement', intensity: 2 },
      ],
    })
    expect(recovery.focus).toBeCloseTo(1.0, 6)
    expect(recovery.mental).toBeCloseTo(1.5, 6)
  })

  it('75%上限を軸ごとに適用（合算後, §6.7）', () => {
    // 活動前 mental=2 → 上限1.5。relax強い2h: 効果量3.0, 精神配分2.25 → 1.5にクリップ
    const before = cumul(4, 2, 0)
    const { recovery } = computeFreeActivityDelta(before, {
      durationMinutes: 120,
      recoveryEffects: [{ effect: 'relax', intensity: 3 }],
    })
    expect(recovery.focus).toBeCloseTo(0.75, 6) // 上限 4×0.75=3.0 未満なのでそのまま
    expect(recovery.mental).toBeCloseTo(1.5, 6) // 2×0.75=1.5 にクリップ
  })

  it('消耗効果は対応軸へ加算（§6.5）', () => {
    const before = cumul(6, 6, 2)
    const { drain } = computeFreeActivityDelta(before, {
      durationMinutes: 120,
      drainEffects: [{ effect: 'focus', intensity: 3 }], // 3×2×0.5 = 3.0
    })
    expect(drain.focus).toBeCloseTo(3.0, 6)
    expect(drain.mental).toBe(0)
    expect(drain.physical).toBe(0)
  })

  it('活動後 = max(0, 前 − 回復 + 消耗)（ゲーム1hの総合例）', () => {
    // refresh(3)+achievement(2) 回復 f1.0/m1.5、focus消耗(2)=1.0, mental消耗(1)=0.5
    const before = cumul(6, 6, 2)
    const after = applyFreeActivity(before, {
      durationMinutes: 60,
      recoveryEffects: [
        { effect: 'refresh', intensity: 3 },
        { effect: 'achievement', intensity: 2 },
      ],
      drainEffects: [
        { effect: 'focus', intensity: 2 },
        { effect: 'mental', intensity: 1 },
      ],
    })
    expect(after.focus).toBeCloseTo(6.0, 6) // 6 −1.0 +1.0
    expect(after.mental).toBeCloseTo(5.0, 6) // 6 −1.5 +0.5
    expect(after.physical).toBeCloseTo(2.0, 6) // 2 −0 +0
  })

  it('身体的に疲れる は身体負荷のみ増やす', () => {
    const before = cumul(0, 0, 0)
    const after = applyFreeActivity(before, {
      durationMinutes: 120,
      drainEffects: [{ effect: 'physical', intensity: 2 }], // 2×2×0.5 = 2.0
    })
    expect(after.physical).toBeCloseTo(2.0, 6)
    expect(after.focus).toBe(0)
    expect(after.mental).toBe(0)
  })

  it('効果なしなら変化しない', () => {
    const before = cumul(3, 4, 1)
    expect(applyFreeActivity(before, { durationMinutes: 60 })).toEqual(before)
  })

  it('累積が0なら回復は0（上限0）で、負にはならない', () => {
    const before = cumul(0, 0, 0)
    const after = applyFreeActivity(before, {
      durationMinutes: 60,
      recoveryEffects: [{ effect: 'relax', intensity: 3 }],
    })
    expect(after).toEqual(before)
  })
})
