/**
 * カテゴリと目標時間（§8, §20.6）。
 */

import type { Id, LoadProfile, Minutes } from './common'

/**
 * カテゴリ（§8）。
 *
 * - 最大3階層まで（§8.2）。`parentId` で親を指す。ルートは `parentId` 未設定。
 * - 色分けは最上位カテゴリを基準とする（§8.4）。`color` は最上位カテゴリにのみ設定する想定。
 * - カテゴリ負荷の初期値を任意設定でき、予定・タスクへ継承される（§8.3）。
 */
export interface Category {
  id: Id
  /** カテゴリ名。 */
  name: string
  /** 親カテゴリ。未設定なら最上位カテゴリ。 */
  parentId?: Id
  /** 表示順（同階層内での並び）。 */
  order?: number
  /** カレンダー色（§8.4）。最上位カテゴリに設定する。 */
  color?: string
  /** カテゴリ負荷の初期値（§8.3）。未設定項目は継承時に「普通」となる。 */
  loadDefaults?: LoadProfile
  /** 週間目標時間（§20.6）。今週・先週の分析で使用。 */
  weeklyTargetMinutes?: Minutes
  /** 月間目標時間（§20.6）。今月の分析で使用。 */
  monthlyTargetMinutes?: Minutes
}
