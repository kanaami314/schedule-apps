/**
 * 回復区間による累積負荷の回復（§13 / C-6）。
 *
 * 回復区間は5種類: 休憩・睡眠・食事・入浴・予定未配置区間。
 * 種類と継続時間から回復割合（カット率）を決め、各軸の累積負荷を「同じ割合で」減らす（§13）。
 *   L_after = L_before × (1 - カット率)
 * 連続する回復区間は逐次適用する（各区間ごとに掛け合わせる, C-6）。
 *
 * 注意: 家事(§7 chore)は回復区間に含めない（会話ログで確認）。
 * 予定未配置区間には、移動・準備・終了後余裕など占有時間を含めない（§13.5）。
 *
 * 時間区分は「◯分」で判定する（分単位。累積負荷値の単位とは独立, C-1）。
 */

import type { Minutes } from '../types'
import type { CumulativeLoad } from './score'

/** 回復区間の種類（§13）。idle = 予定未配置区間。 */
export type RecoveryIntervalType = 'break' | 'sleep' | 'meal' | 'bath' | 'idle'

/** 継続時間の下限（分, 以上）とカット率（0〜1）の対応。降順に評価する。 */
interface RecoveryBand {
  /** この分数「以上」で適用。 */
  minMinutes: Minutes
  /** カット率（0=回復なし, 1=完全リセット）。 */
  cut: number
}

/**
 * 種類ごとの回復テーブル（§13.1〜§13.5、会話での最終確定に一致）。
 * 各配列は minMinutes の降順。
 */
const RECOVERY_TABLES: Record<RecoveryIntervalType, RecoveryBand[]> = {
  // §13.1 休憩: <5 なし / 5-14 25% / 15-29 50% / 30+ 100%
  break: [
    { minMinutes: 30, cut: 1.0 },
    { minMinutes: 15, cut: 0.5 },
    { minMinutes: 5, cut: 0.25 },
    { minMinutes: 0, cut: 0 },
  ],
  // §13.2 睡眠: <30 25% / 30-<120 50% / 120+ 100%
  sleep: [
    { minMinutes: 120, cut: 1.0 },
    { minMinutes: 30, cut: 0.5 },
    { minMinutes: 0, cut: 0.25 },
  ],
  // §13.3 食事: <15 10% / 15-29 25% / 30+ 50%
  meal: [
    { minMinutes: 30, cut: 0.5 },
    { minMinutes: 15, cut: 0.25 },
    { minMinutes: 0, cut: 0.1 },
  ],
  // §13.4 入浴: <15 10% / 15-29 25% / 30+ 40%
  bath: [
    { minMinutes: 30, cut: 0.4 },
    { minMinutes: 15, cut: 0.25 },
    { minMinutes: 0, cut: 0.1 },
  ],
  // §13.5 予定未配置区間: <5 なし / 5-14 10% / 15-29 25% / 30-59 50% / 60+ 100%
  idle: [
    { minMinutes: 60, cut: 1.0 },
    { minMinutes: 30, cut: 0.5 },
    { minMinutes: 15, cut: 0.25 },
    { minMinutes: 5, cut: 0.1 },
    { minMinutes: 0, cut: 0 },
  ],
}

/**
 * 回復区間の種類と継続時間から、累積負荷のカット率（0〜1）を返す（§13）。
 */
export function recoveryRatio(type: RecoveryIntervalType, minutes: Minutes): number {
  const table = RECOVERY_TABLES[type]
  for (const band of table) {
    if (minutes >= band.minMinutes) return band.cut
  }
  return 0
}

/**
 * 回復区間を1つ適用した後の累積負荷を返す（§13）。
 * 各軸を同じ割合で減らし、総合も再計算する。
 */
export function applyRecovery(
  load: CumulativeLoad,
  type: RecoveryIntervalType,
  minutes: Minutes,
): CumulativeLoad {
  const factor = 1 - recoveryRatio(type, minutes)
  const focus = load.focus * factor
  const mental = load.mental * factor
  const physical = load.physical * factor
  return { focus, mental, physical, total: (focus + mental + physical) / 3 }
}
