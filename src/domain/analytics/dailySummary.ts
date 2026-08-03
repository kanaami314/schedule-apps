/**
 * 日次振り返りの自動集計（§19.1）。
 *
 * 当日のタイムライン（scheduleDay の結果）と実績記録（§14 records）から、
 * 表示用の集計値を算出する純関数。UI から独立させ、テスト可能にする。
 *
 * 一部項目は現状のデータモデルでは算出根拠が未整備のため、既定解釈で実装する（§26）:
 * - 実績時間 / カテゴリ別実績時間: 完了(completed)した予定を対象とし、実際の開始・終了が
 *   両方あればその差、なければ予定時間を用いる（§14.2「完了アクションが無ければ予定終了時刻」）。
 * - 予定どおり開始できた割合: 開始時刻(actualStart)がある予定のうち、実開始が予定開始以下
 *   （＝遅れなかった）の割合。開始記録が無ければ null。
 * - 集中状態未入力予定数(§19.1) は、予定ごとの集中状態入力がまだ無いため対象外（0 を返す）。
 */

import type { ActivityRecord, Id, ResolvedLoad } from '../types'
import type { PlacedItem } from '../scheduler/placement'
import { classifyLoad, unitLoad } from '../load/score'

export interface CategoryMinutes {
  categoryId: Id
  minutes: number
}

/** §19.1 の自動表示項目。 */
export interface DailySummary {
  /** 予定時間合計（休憩を除く配置予定の合計, 分）。 */
  plannedMinutes: number
  /** 実績時間合計（完了予定の実測または予定時間, 分）。 */
  actualMinutes: number
  /** 完了数。 */
  completedCount: number
  /** 未完了数（未完了申告されたもの）。 */
  incompleteCount: number
  /** カテゴリ別実績時間（分, 降順）。 */
  byCategory: CategoryMinutes[]
  /** 休憩時間合計（分）。 */
  breakMinutes: number
  /** 自由活動合計時間（分）。 */
  freeActivityMinutes: number
  /** 高負荷予定合計時間（単位負荷が「高」の予定, 分）。 */
  highLoadMinutes: number
  /** 予定どおり開始できた割合（0〜1）。開始記録が無ければ null。 */
  onTimeStartRatio: number | null
}

const dur = (item: PlacedItem): number => item.interval.end - item.interval.start

/** IsoDateTime('YYYY-MM-DDTHH:mm') を、その日の 00:00 からの分に変換。 */
function minutesOfDay(dateTime: string): number {
  const t = dateTime.slice(11) // 'HH:mm'
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** 実績の実測時間（分）。開始・終了が両方あれば差、なければ予定時間。 */
function actualDuration(record: ActivityRecord, item: PlacedItem | undefined): number {
  if (record.actualStart && record.actualEnd) {
    return Math.max(0, minutesOfDay(record.actualEnd) - minutesOfDay(record.actualStart))
  }
  return item ? dur(item) : 0
}

const isHighLoad = (load: ResolvedLoad | undefined): boolean =>
  load !== undefined && classifyLoad(unitLoad(load)) === 'high'

/** 当日のタイムラインと実績から §19.1 の集計を作る。 */
export function computeDailySummary(
  timeline: readonly PlacedItem[],
  records: readonly ActivityRecord[],
): DailySummary {
  const itemById = new Map(timeline.map((i) => [i.id, i]))

  let plannedMinutes = 0
  let breakMinutes = 0
  let freeActivityMinutes = 0
  let highLoadMinutes = 0
  for (const item of timeline) {
    if (item.kind === 'break') {
      breakMinutes += dur(item)
      continue
    }
    plannedMinutes += dur(item)
    if (item.kind === 'free') freeActivityMinutes += dur(item)
    if (isHighLoad(item.load)) highLoadMinutes += dur(item)
  }

  let completedCount = 0
  let incompleteCount = 0
  let actualMinutes = 0
  const categoryTotals = new Map<Id, number>()
  let onTime = 0
  let started = 0
  for (const record of records) {
    if (record.status === 'incomplete') incompleteCount++
    if (record.status === 'completed') {
      completedCount++
      const item = itemById.get(record.itemId)
      const minutes = actualDuration(record, item)
      actualMinutes += minutes
      const categoryId = item?.categoryId
      if (categoryId) categoryTotals.set(categoryId, (categoryTotals.get(categoryId) ?? 0) + minutes)
    }
    if (record.actualStart) {
      started++
      const item = itemById.get(record.itemId)
      // 予定開始以下（遅れなかった）なら予定どおり開始。
      if (item && minutesOfDay(record.actualStart) <= item.interval.start) onTime++
    }
  }

  const byCategory: CategoryMinutes[] = [...categoryTotals.entries()]
    .map(([categoryId, minutes]) => ({ categoryId, minutes }))
    .sort((a, b) => b.minutes - a.minutes)

  return {
    plannedMinutes,
    actualMinutes,
    completedCount,
    incompleteCount,
    byCategory,
    breakMinutes,
    freeActivityMinutes,
    highLoadMinutes,
    onTimeStartRatio: started > 0 ? onTime / started : null,
  }
}
