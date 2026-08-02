/**
 * 自由活動による累積負荷の増減（§6 / C-5）。
 *
 * 手順:
 *   1. 各回復効果の効果量 = 強度 × 活動時間(h) × 効果係数(0.5)（§6.3）
 *      → §6.4 の配分で集中・精神へ振り分け合算（身体への回復は定義しない, §6.4）
 *   2. 集中・精神それぞれに 75% 上限を適用（合算後, §6.7）
 *      上限 = 活動前のその軸の累積負荷 × 0.75
 *   3. 各消耗効果の消耗量 = 強度 × 活動時間(h) × 消耗係数(0.5)（§6.5）
 *      → 対応する軸（集中/精神/身体）へ加算
 *   4. 軸ごとに 活動後 = max(0, 活動前 − 回復量 + 消耗量)（§6.6）
 *
 * 係数はいずれも 0.5（暫定の調整パラメータ, §6.3/§6.5 / M-5）。
 */

import type {
  DrainEffect,
  DrainEffectSetting,
  Minutes,
  RecoveryEffect,
  RecoveryEffectSetting,
} from '../types'
import type { CumulativeLoad } from './score'

/** 回復効果の係数（§6.3）。 */
export const FREE_ACTIVITY_EFFECT_COEFFICIENT = 0.5
/** 消耗効果の係数（§6.5）。 */
export const FREE_ACTIVITY_DRAIN_COEFFICIENT = 0.5
/** 1つの自由活動による各軸の最大回復割合（§6.7）。 */
export const FREE_ACTIVITY_MAX_RECOVERY_RATIO = 0.75

/** 回復効果の配分（§6.4）。集中・精神への割合（合計1、身体は0）。 */
const RECOVERY_DISTRIBUTION: Record<RecoveryEffect, { focus: number; mental: number }> = {
  relax: { focus: 0.25, mental: 0.75 },
  refresh: { focus: 0.5, mental: 0.5 },
  stressRelief: { focus: 0, mental: 1.0 },
  achievement: { focus: 0.25, mental: 0.75 },
  motivation: { focus: 0.75, mental: 0.25 },
}

/** 消耗が加算される軸（総合 total を除く）。 */
type DrainAxis = 'focus' | 'mental' | 'physical'

/** 消耗効果の加算先の軸（§6.5）。 */
const DRAIN_AXIS: Record<DrainEffect, DrainAxis> = {
  focus: 'focus',
  mental: 'mental',
  physical: 'physical',
}

/** 自由活動による各軸の増減内訳（回復は上限適用後、消耗は加算量）。 */
export interface FreeActivityDelta {
  /** 上限適用後の回復量（軸ごと、正の値＝減らす量）。 */
  recovery: { focus: number; mental: number }
  /** 消耗量（軸ごと、正の値＝加える量）。 */
  drain: { focus: number; mental: number; physical: number }
}

/**
 * 自由活動の回復量（75%上限適用後）と消耗量を、活動前の累積負荷に基づいて算出する。
 * `applyFreeActivity` の内部計算だが、分析用途（§20.8）にも使えるよう公開する。
 */
export function computeFreeActivityDelta(
  before: CumulativeLoad,
  params: {
    durationMinutes: Minutes
    recoveryEffects?: readonly RecoveryEffectSetting[]
    drainEffects?: readonly DrainEffectSetting[]
  },
): FreeActivityDelta {
  const hours = params.durationMinutes / 60

  // 1. 回復効果を集中・精神へ配分して合算（§6.3, §6.4）
  let recoveryFocus = 0
  let recoveryMental = 0
  for (const { effect, intensity } of params.recoveryEffects ?? []) {
    const amount = intensity * hours * FREE_ACTIVITY_EFFECT_COEFFICIENT
    const dist = RECOVERY_DISTRIBUTION[effect]
    recoveryFocus += amount * dist.focus
    recoveryMental += amount * dist.mental
  }

  // 2. 合算後に軸ごとの75%上限を適用（§6.7）
  recoveryFocus = Math.min(recoveryFocus, before.focus * FREE_ACTIVITY_MAX_RECOVERY_RATIO)
  recoveryMental = Math.min(recoveryMental, before.mental * FREE_ACTIVITY_MAX_RECOVERY_RATIO)

  // 3. 消耗効果を対応軸へ加算（§6.5）
  const drain = { focus: 0, mental: 0, physical: 0 }
  for (const { effect, intensity } of params.drainEffects ?? []) {
    const amount = intensity * hours * FREE_ACTIVITY_DRAIN_COEFFICIENT
    drain[DRAIN_AXIS[effect]] += amount
  }

  return { recovery: { focus: recoveryFocus, mental: recoveryMental }, drain }
}

/**
 * 自由活動後の累積負荷を返す（§6.6）。
 * 軸ごとに `max(0, 活動前 − 回復量 + 消耗量)`。身体は回復せず消耗のみ。
 */
export function applyFreeActivity(
  before: CumulativeLoad,
  params: {
    durationMinutes: Minutes
    recoveryEffects?: readonly RecoveryEffectSetting[]
    drainEffects?: readonly DrainEffectSetting[]
  },
): CumulativeLoad {
  const { recovery, drain } = computeFreeActivityDelta(before, params)
  const focus = Math.max(0, before.focus - recovery.focus + drain.focus)
  const mental = Math.max(0, before.mental - recovery.mental + drain.mental)
  const physical = Math.max(0, before.physical + drain.physical)
  return { focus, mental, physical, total: (focus + mental + physical) / 3 }
}
