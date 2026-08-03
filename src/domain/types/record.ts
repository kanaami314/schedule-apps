/**
 * 実績記録（§14 完了・未完了・実績時間）。
 *
 * 自動配置された各予定（タイムライン上の1ブロック）に対して、ユーザーの
 * 開始・完了・未完了申告と実際の開始/終了時刻を保持する。
 * これにより §19 振り返り・§20 バランス分析の実績値の土台になる。
 *
 * キー設計: 同じ予定でも日が違えば別の実績になるため、`日付 × 配置ブロックID`
 * を一意キーとする（`itemId` は生活ルーチンの回を含む `sourceId#index` 形式もとりうる）。
 */

import type { Id, IsoDate, IsoDateTime } from './common'

/**
 * 実績の状態（§14）。
 * - `started`: 開始アクション済み・実行中（§14.1）。
 * - `completed`: 完了（明示的な完了アクション、または予定終了時刻での自動完了, §14.2）。
 * - `incomplete`: 後からの未完了申告により自動完了を取り消した状態（§14.3）。
 */
export type RecordStatus = 'started' | 'completed' | 'incomplete'

/** 実績記録1件（§14）。 */
export interface ActivityRecord {
  /** 一意キー。`${date}::${itemId}`。 */
  id: Id
  /** 対象日。 */
  date: IsoDate
  /** 配置ブロックの ID（生活ルーチンは `sourceId#index`）。 */
  itemId: string
  /** 元になった予定定義の ID。 */
  sourceId: Id
  /** 実績の状態（§14）。 */
  status: RecordStatus
  /** 実際の開始時刻（§14.1）。開始アクションが無ければ未設定（予定開始時刻で代替）。 */
  actualStart?: IsoDateTime
  /** 実際の終了時刻（§14.2）。完了アクションが無ければ未設定（予定終了時刻で代替）。 */
  actualEnd?: IsoDateTime
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

/** `date` と配置ブロック ID から実績キーを組み立てる。 */
export function recordId(date: IsoDate, itemId: string): Id {
  return `${date}::${itemId}`
}
