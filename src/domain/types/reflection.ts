/**
 * 日次振り返り（§19）。1日1件、任意入力の主観評価と自由記述を保持する。
 * 自動集計項目（§19.1）はこのエンティティには持たず、実績(records)と
 * 当日のタイムラインから算出する（`domain/analytics/dailySummary.ts`）。
 */

import type { IsoDate, IsoDateTime } from './common'

/** 3段階の主観評価。項目ごとに意味は下記コメント参照（§19）。 */
export type ThreeScale = 'good' | 'normal' | 'bad'
/** 疲労の3段階（低い/普通/高い）。 */
export type FatigueScale = 'low' | 'normal' | 'high'
/** 達成感の3段階（満足/普通/不満）。 */
export type SatisfactionScale = 'satisfied' | 'normal' | 'unsatisfied'

/** 日次振り返り1件（§19）。未入力項目は未登録として扱う（省略）。 */
export interface DailyReflection {
  /** キー = 対象日（1日1件）。 */
  id: IsoDate
  date: IsoDate
  /** 集中状態: 集中できた/普通/集中できなかった。 */
  focus?: ThreeScale
  /** 精神的疲労: 低い/普通/高い。 */
  mentalFatigue?: FatigueScale
  /** 身体的疲労: 低い/普通/高い。 */
  physicalFatigue?: FatigueScale
  /** 気分: 良い/普通/悪い。 */
  mood?: ThreeScale
  /** 達成感: 満足/普通/不満。 */
  satisfaction?: SatisfactionScale
  /** 自由記述。 */
  note?: string
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}
