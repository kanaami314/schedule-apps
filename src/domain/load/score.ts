/**
 * 予定単位・累積の負荷スコア（§11 / C-1）。
 *
 * - 単位負荷量 u = (集中度 + 精神的負荷 + 身体的負荷) / 3、範囲 1〜3（§11.1）
 * - 負荷区分は単位負荷量で判定（§11.2）
 * - 累積負荷量は「時間単位」で算出（分は 60 で割る, C-1）。
 *   各軸ごとに `負荷レベル × 時間` を求め、総合累積負荷は3軸の平均（= u × 時間）。
 */

import type { Minutes, ResolvedLoad } from '../types'

/** 負荷区分（§11.2）。 */
export type LoadCategory = 'low' | 'medium' | 'high'

/**
 * 負荷区分の境界値（§11.2）。
 * `[low, medium)` の下限 = 1.00、`medium` 開始 = 1.67、`high` 開始 = 2.34。
 * 確認済み例: 単位負荷量 2.33（(3,3,1)）は中負荷（§会話ログで確認）。
 */
export const LOAD_CATEGORY_BOUNDARIES = {
  /** これ未満は低負荷。 */
  medium: 1.67,
  /** これ以上は高負荷。 */
  high: 2.34,
} as const

/** 単位負荷量 u（§11.1）。3項目の平均、範囲 1〜3。 */
export function unitLoad(load: ResolvedLoad): number {
  return (load.focus + load.mental + load.physical) / 3
}

/** 単位負荷量から負荷区分を判定する（§11.2）。 */
export function classifyLoad(unit: number): LoadCategory {
  if (unit < LOAD_CATEGORY_BOUNDARIES.medium) return 'low'
  if (unit < LOAD_CATEGORY_BOUNDARIES.high) return 'medium'
  return 'high'
}

/** 3軸それぞれの累積負荷と、その平均である総合累積負荷（§11.3）。 */
export interface CumulativeLoad {
  /** 累積集中負荷 = 集中度 × 時間。 */
  focus: number
  /** 累積精神負荷 = 精神的負荷 × 時間。 */
  mental: number
  /** 累積身体負荷 = 身体的負荷 × 時間。 */
  physical: number
  /** 総合累積負荷 = 3軸の平均（= 単位負荷量 × 時間）。 */
  total: number
}

/** 累積負荷ゼロ（回復完全リセット後などの初期値）。 */
export const ZERO_CUMULATIVE: CumulativeLoad = { focus: 0, mental: 0, physical: 0, total: 0 }

/**
 * 1つの予定枠の累積負荷を算出する（§11.3 / C-1）。
 * 分割された予定は、その分割枠の時間を渡す。
 *
 * @param load 解決済み負荷（3項目）
 * @param minutes 予定時間（分）。内部で時間単位へ変換する。
 */
export function cumulativeLoad(load: ResolvedLoad, minutes: Minutes): CumulativeLoad {
  const hours = minutes / 60
  const focus = load.focus * hours
  const mental = load.mental * hours
  const physical = load.physical * hours
  return { focus, mental, physical, total: (focus + mental + physical) / 3 }
}

/** 2つの累積負荷を軸ごとに加算する（連続する予定の負荷合算に使用, §11.3 / §12）。 */
export function addCumulative(a: CumulativeLoad, b: CumulativeLoad): CumulativeLoad {
  const focus = a.focus + b.focus
  const mental = a.mental + b.mental
  const physical = a.physical + b.physical
  return { focus, mental, physical, total: (focus + mental + physical) / 3 }
}
