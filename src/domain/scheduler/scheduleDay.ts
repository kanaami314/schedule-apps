/**
 * 単日の自動スケジューリング合成（§3 の流れ）。
 *
 * これまでの部品を1日分つなぐ:
 *   1. 固定予定を占有として確定（移動しない, §3/§25）
 *   2. 生活ルーチンを実行可能時間帯へ配置（固定の次に優先, §3/§7）
 *   3. 柔軟なタスクを配置順に整列（C-3）し、残りの空き時間へ貪欲配置
 *   4. 各予定の負荷を継承解決（§8.3）
 *   5. 連続負荷を追跡し、必要な位置へ休憩を挿入（§12）。
 *      食事・入浴・睡眠は回復区間として負荷計算に反映（§13）。
 *
 * スケルトンの範囲: 固定予定の繰り返し展開・自由活動・付随時間・
 * 柔軟タスクの実行可能時間帯などは未対応（[[project-status]] 参照）。
 */

import type { Category, Id, IsoDate, IsoDateTime, Minutes, ResolvedLoad, Weekday } from '../types'
import type { LifeRoutine, RoutineType, ScheduleDefinition } from '../types'
import { resolveLoad } from '../load/inheritance'
import type { LoadSegment } from '../load/continuous'
import type { RecoveryIntervalType } from '../load/recovery'
import { insertBreaks, type TimelineEntry } from './breakInsertion'
import { duration, freeGaps, timeToMinutes, type Interval } from './intervals'
import { placeFlexibleTasks, type PlacedItem, type Unplaced } from './placement'
import { orderFlexibleTasks } from './taskOrder'
import { occursOn } from './repeat'

/** 既定の稼働時間窓（終日）。 */
export const FULL_DAY: Interval = { start: 0, end: 24 * 60 }

/** 回復区間となる生活ルーチンの種類 → 回復区間種別。家事(chore)は回復区間ではない（§13）。 */
const ROUTINE_RECOVERY: Partial<Record<RoutineType, RecoveryIntervalType>> = {
  meal: 'meal',
  bath: 'bath',
  sleep: 'sleep',
}

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
  /** start 昇順に整列した、固定予定・生活ルーチン・柔軟タスク・休憩を含むタイムライン。 */
  timeline: PlacedItem[]
  /** 配置できなかった柔軟なタスクと理由（§16.6）。 */
  unplaced: Unplaced[]
}

/** 対象日の曜日（0=日〜6=土）。 */
function weekdayOf(date: IsoDate): Weekday {
  return new Date(`${date}T00:00`).getDay() as Weekday
}

/** 生活ルーチンの各回を実行可能時間帯へ配置する（§7）。配置できた区間の配列を返す。 */
function placeRoutines(
  routines: readonly LifeRoutine[],
  window: Interval,
  weekday: Weekday,
  busy: Interval[],
): PlacedItem[] {
  const placements: PlacedItem[] = []
  for (const routine of routines) {
    if (routine.activeWeekdays && !routine.activeWeekdays.includes(weekday)) continue
    routine.occurrences.forEach((occ, index) => {
      const allowed: Interval = {
        start: Math.max(timeToMinutes(occ.allowedRange.start), window.start),
        end: Math.min(timeToMinutes(occ.allowedRange.end), window.end),
      }
      const gap = freeGaps(allowed, busy).find((g) => duration(g) >= occ.requiredTime)
      if (!gap) return // 必要時間を確保できなければ配置しない（§7）。
      const interval: Interval = { start: gap.start, end: gap.start + occ.requiredTime }
      placements.push({
        id: `${routine.id}#${index}`,
        sourceId: routine.id,
        kind: 'routine',
        interval,
        movable: false,
        label: routine.name ?? routine.routineType,
      })
      busy.push(interval)
    })
  }
  return placements
}

/** 対象日の1日分のスケジュールを組む。 */
export function scheduleDay(options: ScheduleDayOptions): ScheduleDayResult {
  const window = options.window ?? FULL_DAY
  const referenceTime = options.referenceTime ?? `${options.date}T00:00`
  const weekday = weekdayOf(options.date)

  // 1. 固定予定（対象日に出現するもの）を占有として確定。繰り返しは基準日から展開（§4.3）。
  const fixedPlacements: PlacedItem[] = options.definitions
    .filter(
      (d): d is Extract<ScheduleDefinition, { kind: 'fixed' }> =>
        d.kind === 'fixed' && occursOn(d.date, d.repeat, options.date),
    )
    .map((d) => {
      const fixed = d as Extract<ScheduleDefinition, { kind: 'fixed' }>
      return {
        id: fixed.id,
        sourceId: fixed.id,
        kind: 'fixed' as const,
        interval: { start: timeToMinutes(fixed.time.start), end: timeToMinutes(fixed.time.end) },
        movable: false,
        load: resolveLoad(fixed.load, fixed.categoryId, options.categories),
        categoryId: fixed.categoryId,
        label: fixed.name,
      }
    })

  const busy: Interval[] = fixedPlacements.map((p) => p.interval)

  // 2. 生活ルーチンを配置（固定の次に優先, §3）。busy を更新する。
  const routines = options.definitions.filter(
    (d): d is LifeRoutine => d.kind === 'routine',
  )
  const routinePlacements = placeRoutines(routines, window, weekday, busy)

  // 3. 柔軟なタスクを整列して残りの空きへ貪欲配置。
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

  // 4. 柔軟タスクの配置に負荷とカテゴリを付与。
  const taskById = new Map(flexibleTasks.map((t) => [t.id, t]))
  for (const placement of flexiblePlacements) {
    const task = placement.sourceId ? taskById.get(placement.sourceId) : undefined
    if (task) {
      placement.load = resolveLoad(task.load, task.categoryId, options.categories)
      placement.categoryId = task.categoryId
    }
  }

  // 5. 負荷を持つ予定と回復区間（食事/入浴/睡眠）から休憩を挿入。
  const routineTypeById = new Map(routines.map((r) => [r.id, r.routineType]))
  const loadEntries: TimelineEntry[] = [...fixedPlacements, ...flexiblePlacements]
    .filter((p): p is PlacedItem & { load: ResolvedLoad } => p.load !== undefined)
    .map((p) => ({
      interval: p.interval,
      segment: {
        type: 'load',
        load: p.load,
        minutes: p.interval.end - p.interval.start,
      } satisfies LoadSegment,
    }))
  const recoveryEntries: TimelineEntry[] = routinePlacements.flatMap((p) => {
    const routineType = p.sourceId ? routineTypeById.get(p.sourceId) : undefined
    const recoveryType = routineType ? ROUTINE_RECOVERY[routineType] : undefined
    if (!recoveryType) return []
    const entry: TimelineEntry = {
      interval: p.interval,
      segment: {
        type: 'recovery',
        interval: recoveryType,
        minutes: p.interval.end - p.interval.start,
      },
    }
    return [entry]
  })

  const { breaks } = insertBreaks([...loadEntries, ...recoveryEntries], window)

  const timeline = [...fixedPlacements, ...routinePlacements, ...flexiblePlacements, ...breaks].sort(
    (a, b) => a.interval.start - b.interval.start,
  )
  return { timeline, unplaced }
}
