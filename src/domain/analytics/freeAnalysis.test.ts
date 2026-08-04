import { describe, expect, it } from 'vitest'
import type { Category, FreeActivity, Id } from '../types'
import { computeFreeActivityAnalysis } from './freeAnalysis'

// 2026-08-03 は月曜。
const monday = new Date(2026, 7, 3)
const noCategories = new Map<Id, Category>()

const free = (o: Partial<FreeActivity> & { id: string; duration: number }): FreeActivity => ({
  kind: 'free',
  createdAt: '2026-08-01T00:00',
  updatedAt: '2026-08-01T00:00',
  name: o.id,
  ...o,
})

describe('computeFreeActivityAnalysis（§20.8）', () => {
  it('効果別・強度別に活動時間を集計する', () => {
    // 毎日配置される自由活動（実行可能曜日なし=毎日, autoPlace 既定on）。今日1日で60分。
    const defs = [
      free({
        id: 'game',
        duration: 60,
        recoveryEffects: [{ effect: 'refresh', intensity: 2 }],
        drainEffects: [{ effect: 'focus', intensity: 1 }],
      }),
    ]
    const result = computeFreeActivityAnalysis('today', monday, defs, noCategories)
    expect(result.totalMinutes).toBe(60)
    expect(result.byRecovery).toEqual([{ effect: 'refresh', minutes: 60 }])
    expect(result.byDrain).toEqual([{ effect: 'focus', minutes: 60 }])
    // refresh(強度2)と focus(強度1) → 強度1:60, 強度2:60
    expect(result.byIntensity).toEqual([
      { intensity: 1, minutes: 60 },
      { intensity: 2, minutes: 60 },
    ])
  })

  it('自動配置オフの自由活動は集計対象外', () => {
    const defs = [free({ id: 'x', duration: 60, autoPlace: false })]
    const result = computeFreeActivityAnalysis('today', monday, defs, noCategories)
    expect(result.totalMinutes).toBe(0)
  })
})
