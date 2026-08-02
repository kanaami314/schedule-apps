import { describe, expect, it } from 'vitest'
import type { ResolvedLoad } from '../types'
import {
  addCumulative,
  classifyLoad,
  cumulativeLoad,
  unitLoad,
  ZERO_CUMULATIVE,
} from './score'

const load = (focus: 1 | 2 | 3, mental: 1 | 2 | 3, physical: 1 | 2 | 3): ResolvedLoad => ({
  focus,
  mental,
  physical,
})

describe('unitLoad (§11.1)', () => {
  it('3項目の平均を返す', () => {
    expect(unitLoad(load(3, 3, 1))).toBeCloseTo(2.3333, 4) // (3+3+1)/3
    expect(unitLoad(load(1, 1, 1))).toBe(1)
    expect(unitLoad(load(3, 3, 3))).toBe(3)
    expect(unitLoad(load(2, 2, 2))).toBe(2)
  })
})

describe('classifyLoad (§11.2)', () => {
  it('境界値で区分する', () => {
    expect(classifyLoad(1.0)).toBe('low')
    expect(classifyLoad(5 / 3)).toBe('low') // 1.6667 < 1.67
    expect(classifyLoad(1.67)).toBe('medium')
    expect(classifyLoad(2.0)).toBe('medium')
    expect(classifyLoad(7 / 3)).toBe('medium') // 2.3333 < 2.34（確認済み: (3,3,1)は中負荷）
    expect(classifyLoad(2.34)).toBe('high')
    expect(classifyLoad(3.0)).toBe('high')
  })

  it('(3,3,1) は中負荷（会話ログの確認例）', () => {
    expect(classifyLoad(unitLoad(load(3, 3, 1)))).toBe('medium')
  })
})

describe('cumulativeLoad (§11.3 / C-1: 時間単位)', () => {
  it('各軸 = レベル × 時間、総合 = 平均', () => {
    // (3,3,1) を 2時間 → focus6 mental6 physical2 total 4.666...（仕様例 4.66）
    const c = cumulativeLoad(load(3, 3, 1), 120)
    expect(c.focus).toBe(6)
    expect(c.mental).toBe(6)
    expect(c.physical).toBe(2)
    expect(c.total).toBeCloseTo(4.6667, 4)
  })

  it('総合累積負荷は 単位負荷量 × 時間 に一致する', () => {
    const l = load(2, 3, 1)
    const minutes = 90
    expect(cumulativeLoad(l, minutes).total).toBeCloseTo(unitLoad(l) * (minutes / 60), 10)
  })

  it('分は時間へ変換される（60分 = 1時間）', () => {
    const c = cumulativeLoad(load(2, 2, 2), 60)
    expect(c.total).toBe(2) // 単位負荷2 × 1時間
  })
})

describe('addCumulative', () => {
  it('軸ごとに加算し総合を再計算する', () => {
    const a = cumulativeLoad(load(2, 2, 2), 90) // total 3.0
    const b = cumulativeLoad(load(3, 3, 3), 60) // total 3.0
    const sum = addCumulative(a, b)
    expect(sum.total).toBeCloseTo(6.0, 10)
  })

  it('ZERO_CUMULATIVE は加法単位元', () => {
    const a = cumulativeLoad(load(2, 3, 1), 45)
    expect(addCumulative(a, ZERO_CUMULATIVE)).toEqual(a)
  })
})
