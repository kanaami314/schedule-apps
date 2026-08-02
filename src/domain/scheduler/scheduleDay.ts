/**
 * 単日の自動スケジューリング合成（§3 の流れ）。
 *
 * これまでの部品を1日分つなぐ:
 *   1. 固定予定を占有として確定（移動しない, §3/§25）
 *   2. 柔軟なタスクを配置順に整列（C-3）し、空き時間へ貪欲配置
 *   3. 各予定の負荷を継承解決（§8.3）
 *   4. 連続負荷を追跡し、必要な位置へ休憩を挿入（§12）
 *
 * スケルトンの範囲: 固定予定の繰り返し展開・生活ルーチン・自由活動・付随時間・
 * 実行可能時間帯などは未対応（[[project-status]] 参照）。
 */

import type { Category, Id, IsoDate, IsoDateTime, Minutes, ResolvedLoad } from '../types'
import type { ScheduleDefinition } from '../types'
import { resolveLoad } from '../load/inheritance'
import type { LoadSegment } from '../load/continuous'
import { insertBreaks, type TimelineEntry } from './breakInsertion'
import { timeToMinutes, type Interval } from './intervals'
import { placeFlexibleTasks, type PlacedItem, type Unplaced } from './placement'
import { orderFlexibleTasks } from './taskOrder'

/** 既定の稼働時間窓（終日）。 */
export const FULL_DAY: Interval = { start: 0, end: 24 * 60 }

export interface ScheduleDayOptions {
  date: IsoDate
  definitions: readonly ScheduleDefinition[]
  categories: ReadonlyMap<Id, Category>
  /** 配置対象の時間窓。既定は終日。 */
  window?: Interval
  /** 配置順評価の基準時刻。既定は対象日の 00:00。 */
  referenceTime?: IsoDateTime
  /** 〆切間近しきい値（分）。 */
  deadlineNearMinutes?: Minutes
}

export interface ScheduleDayResult {
  /** start 昇順に整列した、固定予定・柔軟タスク・休憩を含むタイムライン。 */
  timeline: PlacedItem[]
  /** 配置できなかった柔軟なタスクと理由（§16.6）。 */
  unplaced: Unplaced[]
}

/** 対象日の1日分のスケジュールを組む。 */
export function scheduleDay(options: ScheduleDayOptions): ScheduleDayResult {
  const window = options.window ?? FULL_DAY
  const referenceTime = options.referenceTime ?? `${options.date}T00:00`

  // 1. 固定予定（対象日）を占有として確定。
  const fixedPlacements: PlacedItem[] = options.definitions
    .filter((d) => d.kind === 'fixed' && d.date === options.date)
    .map((d) => {
      // d は kind==='fixed' に絞り込み済み。
      const fixed = d as Extract<ScheduleDefinition, { kind: 'fixed' }>
      return {
        id: fixed.id,
        sourceId: fixed.id,
        kind: 'fixed' as const,
        interval: { start: timeToMinutes(fixed.time.start), end: timeToMinutes(fixed.time.end) },
        movable: false,
        load: resolveLoad(fixed.load, fixed.categoryId, options.categories),
        label: fixed.name,
      }
    })

  const busy: Interval[] = fixedPlacements.map((p) => p.interval)

  // 2. 柔軟なタスクを整列して貪欲配置。
  const flexibleTasks = options.definitions.filter(
    (d): d is Extract<ScheduleDefinition, { kind: 'flexible' }> => d.kind === 'flexible',
  )
  const ordered = orderFlexibleTasks(flexibleTasks, {
    referenceTime,
    deadlineNearMinutes: options.deadlineNearMinutes,
  })
  const { placements: flexiblePlacements, unplaced } = placeFlexibleTasks({
    window,
    busy,
    tasks: ordered,
  })

  // 3. 柔軟タスクの配置に負荷を付与。
  const taskById = new Map(flexibleTasks.map((t) => [t.id, t]))
  for (const placement of flexiblePlacements) {
    const task = placement.sourceId ? taskById.get(placement.sourceId) : undefined
    if (task) placement.load = resolveLoad(task.load, task.categoryId, options.categories)
  }

  // 4. 負荷を持つ予定から休憩を挿入。
  const loadBearing = [...fixedPlacements, ...flexiblePlacements]
  const entries: TimelineEntry[] = loadBearing
    .filter((p): p is PlacedItem & { load: ResolvedLoad } => p.load !== undefined)
    .map((p) => ({
      interval: p.interval,
      segment: {
        type: 'load',
        load: p.load,
        minutes: p.interval.end - p.interval.start,
      } satisfies LoadSegment,
    }))
  const { breaks } = insertBreaks(entries, window)

  const timeline = [...loadBearing, ...breaks].sort((a, b) => a.interval.start - b.interval.start)
  return { timeline, unplaced }
}
