/**
 * 自由活動分析（§20.8）。期間内に配置された自由活動を、効果・強度別に集計する。
 * 自由活動が scheduleDay で配置される（時間を持つ）ようになったため集計できる（C-5b）。
 */

import type {
  Category,
  DrainEffect,
  FreeActivity,
  Id,
  Intensity,
  RecoveryEffect,
  ScheduleDefinition,
} from '../types'
import { scheduleDay } from '../scheduler/scheduleDay'
import { periodDates, type BalancePeriod } from './balance'

export interface EffectMinutes<E extends string> {
  effect: E
  minutes: number
}

export interface FreeActivityAnalysis {
  /** 自由活動の合計時間（分）。 */
  totalMinutes: number
  /** 各回復効果の活動時間（分, 降順）。 */
  byRecovery: EffectMinutes<RecoveryEffect>[]
  /** 各消耗効果の活動時間（分, 降順）。 */
  byDrain: EffectMinutes<DrainEffect>[]
  /** 効果強度別の活動時間（分）。強度1〜3。 */
  byIntensity: { intensity: Intensity; minutes: number }[]
}

/** 期間内の自由活動配置を集計する（§20.8）。 */
export function computeFreeActivityAnalysis(
  period: BalancePeriod,
  today: Date,
  definitions: readonly ScheduleDefinition[],
  categories: ReadonlyMap<Id, Category>,
): FreeActivityAnalysis {
  const freeById = new Map(
    definitions.filter((d): d is FreeActivity => d.kind === 'free').map((f) => [f.id, f]),
  )

  let totalMinutes = 0
  const recovery = new Map<RecoveryEffect, number>()
  const drain = new Map<DrainEffect, number>()
  const intensity = new Map<Intensity, number>()
  const add = <K>(map: Map<K, number>, key: K, minutes: number) =>
    map.set(key, (map.get(key) ?? 0) + minutes)

  for (const date of periodDates(period, today)) {
    const { timeline } = scheduleDay({ date, definitions, categories })
    for (const item of timeline) {
      if (item.kind !== 'free') continue
      const minutes = item.interval.end - item.interval.start
      totalMinutes += minutes
      const fa = item.sourceId ? freeById.get(item.sourceId) : undefined
      if (!fa) continue
      for (const e of fa.recoveryEffects ?? []) {
        add(recovery, e.effect, minutes)
        add(intensity, e.intensity, minutes)
      }
      for (const e of fa.drainEffects ?? []) {
        add(drain, e.effect, minutes)
        add(intensity, e.intensity, minutes)
      }
    }
  }

  return {
    totalMinutes,
    byRecovery: [...recovery.entries()]
      .map(([effect, minutes]) => ({ effect, minutes }))
      .sort((a, b) => b.minutes - a.minutes),
    byDrain: [...drain.entries()]
      .map(([effect, minutes]) => ({ effect, minutes }))
      .sort((a, b) => b.minutes - a.minutes),
    byIntensity: ([1, 2, 3] as Intensity[])
      .map((i) => ({ intensity: i, minutes: intensity.get(i) ?? 0 }))
      .filter((x) => x.minutes > 0),
  }
}
