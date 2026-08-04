/**
 * 実績（§14 records）から、柔軟タスクごとの完了済み時間を求める（複数日の残量算出用）。
 * 完了(completed)かつ実開始・実終了が揃った記録のみを、`sourceId`（＝タスク定義ID）別に合算する。
 */

import type { ActivityRecord, Id, Minutes } from '../types'

/** 実開始〜実終了の分数（同日想定）。 */
function measuredMinutes(record: ActivityRecord): Minutes {
  if (!record.actualStart || !record.actualEnd) return 0
  return Math.max(0, (Date.parse(record.actualEnd) - Date.parse(record.actualStart)) / 60_000)
}

/** タスク（sourceId）ごとの完了時間合計（分）。 */
export function completedMinutesByTask(records: readonly ActivityRecord[]): Map<Id, Minutes> {
  const map = new Map<Id, Minutes>()
  for (const record of records) {
    if (record.status !== 'completed') continue
    const minutes = measuredMinutes(record)
    if (minutes <= 0) continue
    map.set(record.sourceId, (map.get(record.sourceId) ?? 0) + minutes)
  }
  return map
}
