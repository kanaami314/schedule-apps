/**
 * 複数日スケジューリング（日をまたぐ柔軟タスクの配分）。
 *
 * 単日の `scheduleDay` を日付順に呼びつつ、柔軟タスクの「残り時間」を持ち越して配分する。
 * これにより、1日に収まらないタスクや期限までに分けて進めるタスクが、各日へ分散配置される
 * （従来は各日が独立で、同じタスクが毎日フル配置されてしまっていた）。
 *
 * 現状の範囲: 残量は範囲の先頭で推定所要時間から開始する（実績records反映は今後）。
 * 希望頻度(週N回)の厳密遵守や期限日での打ち切りも今後の拡張。
 */

import type { Id, Minutes } from '../types'
import { scheduleDay, type ScheduleDayOptions, type ScheduleDayResult } from './scheduleDay'

export type ScheduleRangeOptions = Omit<
  ScheduleDayOptions,
  'date' | 'remainingByTask' | 'allowPartialSplit'
> & {
  /** 対象日付（IsoDate）。順不同でよい（内部で昇順に配分する）。 */
  dates: readonly string[]
}

/** 日付ごとの単日結果。 */
export type ScheduleRangeResult = Map<string, ScheduleDayResult>

/**
 * 複数日にわたって柔軟タスクを配分しながらスケジュールを組む。
 * 先頭の日から順に、各タスクの残量を上限に配置し、配置した分を残量から差し引く。
 */
export function scheduleRange(options: ScheduleRangeOptions): ScheduleRangeResult {
  const { dates, ...dayOptions } = options
  const sorted = [...dates].sort()

  // 各柔軟タスクの残り時間（推定所要時間から開始）。
  const remaining = new Map<Id, Minutes>()
  for (const d of options.definitions) {
    if (d.kind === 'flexible') remaining.set(d.id, d.estimatedDuration)
  }

  const result: ScheduleRangeResult = new Map()
  for (const date of sorted) {
    const dayResult = scheduleDay({
      ...dayOptions,
      date,
      remainingByTask: remaining,
      allowPartialSplit: true,
    })
    // 配置した柔軟タスクの時間を残量から差し引く（分割枠は同 sourceId で合算される）。
    for (const item of dayResult.timeline) {
      if (item.kind !== 'flexible' || !item.sourceId) continue
      const placed = item.interval.end - item.interval.start
      remaining.set(item.sourceId, (remaining.get(item.sourceId) ?? 0) - placed)
    }
    result.set(date, dayResult)
  }
  return result
}
