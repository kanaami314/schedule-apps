/**
 * 複数日スケジューリング（日をまたぐ柔軟タスクの配分・自由活動の希望頻度）。
 *
 * 単日の `scheduleDay` を日付順に呼びつつ、状態を持ち越して複数日を組む:
 * - 柔軟タスクの「残り時間」を持ち越して分散配置（残量は実績 completedByTask を差し引いて開始）。
 * - 自由活動の「希望頻度（週N回/月N回）」を数え、上限に達した週/月ではその日以降スキップ。
 *
 * 期限日での打ち切り・実績差し引きは scheduleDay 側が担う。
 */

import type { FreeActivity, Id, Minutes } from '../types'
import { scheduleDay, type ScheduleDayOptions, type ScheduleDayResult } from './scheduleDay'

export type ScheduleRangeOptions = Omit<
  ScheduleDayOptions,
  'date' | 'remainingByTask' | 'allowPartialSplit' | 'skipFreeIds'
> & {
  /** 対象日付（IsoDate）。順不同でよい（内部で昇順に配分する）。 */
  dates: readonly string[]
}

/** 日付ごとの単日結果。 */
export type ScheduleRangeResult = Map<string, ScheduleDayResult>

const pad = (n: number) => String(n).padStart(2, '0')
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** 週（月曜始まり）または月の期間キー。希望頻度のカウント単位に使う。 */
function periodKey(date: string, unit: 'week' | 'month'): string {
  if (unit === 'month') return date.slice(0, 7)
  const d = new Date(`${date}T00:00`)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return toIso(d)
}

/**
 * 複数日にわたって柔軟タスクを配分し、自由活動の希望頻度を守りながらスケジュールを組む。
 */
export function scheduleRange(options: ScheduleRangeOptions): ScheduleRangeResult {
  const { dates, completedByTask, ...dayOptions } = options
  const sorted = [...dates].sort()

  // 各柔軟タスクの残り時間（推定所要 − 実績 completed から開始）。
  const remaining = new Map<Id, Minutes>()
  for (const d of options.definitions) {
    if (d.kind === 'flexible') {
      remaining.set(d.id, Math.max(0, d.estimatedDuration - (completedByTask?.get(d.id) ?? 0)))
    }
  }

  // 希望頻度を持つ自由活動と、期間キーごとの配置回数。
  const freeById = new Map(
    options.definitions.filter((d): d is FreeActivity => d.kind === 'free').map((f) => [f.id, f]),
  )
  const freqFreeIds = [...freeById.values()].filter((f) => f.frequency).map((f) => f.id)
  const freeCount = new Map<Id, { key: string; count: number }>()

  const result: ScheduleRangeResult = new Map()
  for (const date of sorted) {
    // この日にスキップする自由活動（希望頻度の上限に達した週/月）。
    const skipFreeIds = new Set<Id>()
    for (const id of freqFreeIds) {
      const fa = freeById.get(id)!
      const key = periodKey(date, fa.frequency!.unit)
      const rec = freeCount.get(id)
      if (rec && rec.key === key && rec.count >= fa.frequency!.count) skipFreeIds.add(id)
    }

    const dayResult = scheduleDay({
      ...dayOptions,
      date,
      remainingByTask: remaining,
      allowPartialSplit: true,
      skipFreeIds,
    })

    for (const item of dayResult.timeline) {
      if (item.kind === 'flexible' && item.sourceId) {
        // 配置した柔軟タスクの時間を残量から差し引く（分割枠は同 sourceId で合算）。
        const placed = item.interval.end - item.interval.start
        remaining.set(item.sourceId, (remaining.get(item.sourceId) ?? 0) - placed)
      } else if (item.kind === 'free' && item.sourceId) {
        // 希望頻度を持つ自由活動の配置回数を数える。
        const fa = freeById.get(item.sourceId)
        if (fa?.frequency) {
          const key = periodKey(date, fa.frequency.unit)
          const rec = freeCount.get(item.sourceId)
          if (!rec || rec.key !== key) freeCount.set(item.sourceId, { key, count: 1 })
          else rec.count += 1
        }
      }
    }
    result.set(date, dayResult)
  }
  return result
}
