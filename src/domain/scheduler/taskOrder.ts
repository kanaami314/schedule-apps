/**
 * 柔軟なタスクの自動配置順（§5.5 / C-3 / I-6）。
 *
 * 確定した辞書式の並び順（上位キーから順に比較し、同点なら次のキーへ）:
 *   1. 締切区分   0:期限超過・当日 / 1:〆切間近(R≤D) / 2:通常(R>D)
 *   2. 優先度     高 > 中 > 低
 *   3. 期限の厳しさ 厳守 > できれば守る > 目安
 *   4. 残り時間 R  小さい順（期限が早い順）
 *   5. 分割しにくさ 分割不可を優先、次に最短作業時間が長い順（I-6）
 *   6. 所要時間    短い順
 *   7. 登録日時    古い順
 *
 * 「関連固定予定による配置可能期間の限定」(§5.5) は並び順ではなく配置時の制約として扱うため、
 * ここには含めない（配置レイヤで適用する）。
 */

import type { DeadlineStrictness, FlexibleTask, IsoDateTime, Minutes, Priority } from '../types'

/** 〆切間近しきい値の既定（3日, §15.1）。 */
export const DEFAULT_DEADLINE_NEAR_MINUTES: Minutes = 3 * 24 * 60

/** 並び順評価のコンテキスト。 */
export interface TaskOrderContext {
  /** 基準時刻（再スケジューリング実行時点）。 */
  referenceTime: IsoDateTime
  /** 〆切間近と判定する残り時間（分）。既定は3日。 */
  deadlineNearMinutes?: Minutes
}

/** 締切区分（0が最優先）。 */
export type DeadlineBucket = 0 | 1 | 2

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 }
const STRICTNESS_RANK: Record<DeadlineStrictness, number> = { strict: 0, preferred: 1, loose: 2 }

/** 期限までの残り時間（分）。負なら期限超過。 */
export function remainingMinutes(task: FlexibleTask, ctx: TaskOrderContext): Minutes {
  return (Date.parse(task.deadline) - Date.parse(ctx.referenceTime)) / 60000
}

/** 同一暦日か（日付部分 `YYYY-MM-DD` の一致で判定）。 */
function isSameDay(a: IsoDateTime, b: IsoDateTime): boolean {
  return a.slice(0, 10) === b.slice(0, 10)
}

/** 締切区分（§C-3）。 */
export function deadlineBucket(task: FlexibleTask, ctx: TaskOrderContext): DeadlineBucket {
  const remaining = remainingMinutes(task, ctx)
  if (remaining <= 0) return 0 // 期限超過
  if (isSameDay(task.deadline, ctx.referenceTime)) return 0 // 当日
  const near = ctx.deadlineNearMinutes ?? DEFAULT_DEADLINE_NEAR_MINUTES
  if (remaining <= near) return 1 // 〆切間近
  return 2 // 通常
}

/** 優先度のランク（小さいほど先）。未設定は中(medium)。 */
function priorityRank(task: FlexibleTask): number {
  return PRIORITY_RANK[task.priority ?? 'medium']
}

/** 期限の厳しさのランク（小さいほど先）。未設定は preferred。 */
function strictnessRank(task: FlexibleTask): number {
  return STRICTNESS_RANK[task.deadlineStrictness ?? 'preferred']
}

/** 分割しにくさのキー（[group, within] とも小さいほど先, I-6）。 */
function splitHardnessKeys(task: FlexibleTask): [number, number] {
  // 分割不可(group=0)を最優先。分割可の中では最短作業時間が長いほど先（-minChunk で昇順化）。
  const group = task.splittable ? 1 : 0
  const within = task.splittable ? -(task.minChunk ?? 0) : 0
  return [group, within]
}

/**
 * 2つの柔軟なタスクの配置順を比較する。
 * 負なら a が先、正なら b が先、0なら同順（呼び出し側の安定ソートで登録順が保たれる）。
 */
export function compareFlexibleTasks(
  a: FlexibleTask,
  b: FlexibleTask,
  ctx: TaskOrderContext,
): number {
  // 1. 締切区分
  const bucketDiff = deadlineBucket(a, ctx) - deadlineBucket(b, ctx)
  if (bucketDiff !== 0) return bucketDiff

  // 2. 優先度
  const priorityDiff = priorityRank(a) - priorityRank(b)
  if (priorityDiff !== 0) return priorityDiff

  // 3. 期限の厳しさ
  const strictnessDiff = strictnessRank(a) - strictnessRank(b)
  if (strictnessDiff !== 0) return strictnessDiff

  // 4. 残り時間（期限が早い順）
  const remainingDiff = remainingMinutes(a, ctx) - remainingMinutes(b, ctx)
  if (remainingDiff !== 0) return remainingDiff

  // 5. 分割しにくさ
  const [ag, aw] = splitHardnessKeys(a)
  const [bg, bw] = splitHardnessKeys(b)
  if (ag !== bg) return ag - bg
  if (aw !== bw) return aw - bw

  // 6. 所要時間（短い順）
  const durationDiff = a.estimatedDuration - b.estimatedDuration
  if (durationDiff !== 0) return durationDiff

  // 7. 登録日時（古い順）。ISO文字列は辞書順＝時刻順。
  if (a.createdAt < b.createdAt) return -1
  if (a.createdAt > b.createdAt) return 1
  return 0
}

/** 柔軟なタスクを配置順にソートした新しい配列を返す（安定ソート）。 */
export function orderFlexibleTasks(
  tasks: readonly FlexibleTask[],
  ctx: TaskOrderContext,
): FlexibleTask[] {
  return tasks.slice().sort((a, b) => compareFlexibleTasks(a, b, ctx))
}
