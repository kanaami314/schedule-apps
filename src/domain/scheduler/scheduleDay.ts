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
import type {
  AncillaryTime,
  FixedEvent,
  FreeActivity,
  LifeRoutine,
  RoutineType,
  ScheduleDefinition,
} from '../types'
import { resolveLoad } from '../load/inheritance'
import type { LoadSegment } from '../load/continuous'
import type { RecoveryIntervalType } from '../load/recovery'
import { insertBreaks, type TimelineEntry } from './breakInsertion'
import { duration, freeGaps, timeRangeToIntervals, timeToMinutes, type Interval } from './intervals'
import { intersectIntervals, placeFlexibleTasks, type PlacedItem, type Unplaced } from './placement'
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
  /**
   * 柔軟タスクごとの、この日に配置してよい残り時間（分）。複数日配分（scheduleRange）で使う。
   * 指定タスクは推定所要時間ではなくこの残量を上限に配置し、残量 0 以下なら配置しない。
   * 未指定のタスクは従来どおり推定所要時間で配置する。
   */
  remainingByTask?: ReadonlyMap<Id, Minutes>
  /**
   * 柔軟タスクごとの、既に完了した実績時間（分, §14）。推定所要時間から差し引いて残量を求める。
   * `remainingByTask` が指定されたタスクではそちらが優先される。
   */
  completedByTask?: ReadonlyMap<Id, Minutes>
  /** 分割可能タスクを置ける分だけ配置する（複数日配分用, 既定 false）。 */
  allowPartialSplit?: boolean
  /** この日は配置しない自由活動の ID（希望頻度の上限に達した等）。 */
  skipFreeIds?: ReadonlySet<Id>
  /**
   * この日付より前（過去）には柔軟タスク・自由活動を自動配置しない基準日（既定なし）。
   * カレンダー等で「過去日に新規の作業を置かない」ために使う（§17 の再計算は常に今日基準）。
   * 固定予定・生活ルーチンは実在の予定なので過去日でも表示する。
   */
  notBefore?: IsoDate
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

/** 兼用可でない付随時間の分数（兼用可・未設定は0）。 */
function reserved(ancillary: AncillaryTime | undefined): Minutes {
  return ancillary && !ancillary.shareable ? ancillary.duration : 0
}

/**
 * 固定予定の占有区間（§4.4）。予定本体の前に「移動＋準備」、後に「終了後の余裕」を
 * 兼用不可のぶんだけ確保する。兼用可(shareable)の付随時間は占有に加えない。
 * 表示上の予定枠は本体時間のままとし、この占有は他予定の配置衝突判定にのみ使う。
 */
function occupancyInterval(fixed: FixedEvent, base: Interval): Interval {
  const before = reserved(fixed.travelTime) + reserved(fixed.prepTime)
  const after = reserved(fixed.bufferTime)
  return { start: base.start - before, end: base.end + after }
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
  // 過去日には新規の作業（柔軟タスク・自由活動）を自動配置しない（実在の固定・ルーチンは表示する）。
  const excludePast = options.notBefore !== undefined && options.date < options.notBefore

  // 1. 固定予定（対象日に出現するもの）を占有として確定。繰り返しは基準日から展開（§4.3）。
  const fixedDefs: FixedEvent[] = options.definitions.filter(
    (d): d is FixedEvent => d.kind === 'fixed' && occursOn(d.date, d.repeat, options.date),
  )
  const fixedPlacements: PlacedItem[] = fixedDefs.map((fixed) => ({
    id: fixed.id,
    sourceId: fixed.id,
    kind: 'fixed' as const,
    interval: { start: timeToMinutes(fixed.time.start), end: timeToMinutes(fixed.time.end) },
    movable: false,
    load: resolveLoad(fixed.load, fixed.categoryId, options.categories),
    categoryId: fixed.categoryId,
    label: fixed.name,
  }))

  // 他予定の配置には、付随時間（準備・移動・終了後余裕）を含む占有区間を使う（§4.4）。
  const busy: Interval[] = fixedDefs.map((fixed, i) =>
    occupancyInterval(fixed, fixedPlacements[i].interval),
  )

  // 2. 生活ルーチンを配置（固定の次に優先, §3）。busy を更新する。
  const routines = options.definitions.filter(
    (d): d is LifeRoutine => d.kind === 'routine',
  )
  const routinePlacements = placeRoutines(routines, window, weekday, busy)

  // 3. 柔軟なタスクを整列して残りの空きへ貪欲配置。
  //    開始可能日・実行可能曜日(§5.2)を満たすタスクのみ、この日の配置対象にする。
  //    複数日配分では、この日に配置してよい残量(remainingByTask)を上限にする。
  const flexibleTasks = (excludePast ? [] : options.definitions)
    .filter(
      (d): d is Extract<ScheduleDefinition, { kind: 'flexible' }> =>
        d.kind === 'flexible' &&
        (!d.startableFrom || d.startableFrom <= options.date) &&
        (!d.allowedWeekdays || d.allowedWeekdays.includes(weekday)) &&
        // 期限日での打ち切り: 期限日が対象日より前（過ぎている）タスクは配置しない。
        d.deadline.slice(0, 10) >= options.date,
    )
    .map((t) => {
      // 残量: scheduleRange の持ち越し(remainingByTask)が優先。無ければ 推定所要 − 実績(completed)。
      const carry = options.remainingByTask?.get(t.id)
      const base =
        carry !== undefined ? carry : t.estimatedDuration - (options.completedByTask?.get(t.id) ?? 0)
      return { ...t, estimatedDuration: Math.min(t.estimatedDuration, base) }
    })
    .filter((t) => t.estimatedDuration > 0)
  const ordered = orderFlexibleTasks(flexibleTasks, {
    referenceTime,
    deadlineNearMinutes: options.deadlineNearMinutes,
  })

  // 関連固定予定の条件（§5.4）を、当日に出現する固定予定の区間から配置制約へ変換する。
  const fixedIntervalById = new Map(fixedPlacements.map((p) => [p.sourceId, p.interval]))
  const constraints = new Map<Id, Interval>()
  for (const task of flexibleTasks) {
    const link = task.relatedFixed
    const fixedInterval = link ? fixedIntervalById.get(link.fixedEventId) : undefined
    if (!link || !fixedInterval) continue // 関連固定予定が当日になければ制約しない。
    switch (link.condition) {
      case 'completeBeforeStart':
      case 'doBeforeStart':
        // 固定予定の開始までに / 開始前に実行 → 開始時刻より前に配置。
        constraints.set(task.id, { start: window.start, end: fixedInterval.start })
        break
      case 'doAfterEnd':
      case 'availableAfterEnd':
        // 固定予定の終了後に実行 / 終了後から実行可能 → 終了時刻以降に配置。
        constraints.set(task.id, { start: fixedInterval.end, end: window.end })
        break
    }
  }

  const { placements: flexiblePlacements, unplaced } = placeFlexibleTasks({
    window,
    busy,
    tasks: ordered,
    constraints,
    partial: options.allowPartialSplit,
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

  // 4.5 自由活動を配置（§3 の4番目, 会話ログの設計）。自動配置オンかつ実行可能曜日に該当する
  //     ものを、固定・ルーチン・柔軟タスクを除いた残りの空きへ配置する。実行可能時間帯を尊重し、
  //     希望実行時間ぶん（入らなければ最短実行時間まで短縮して）1ブロック置く。
  //     ※ 希望頻度（週N回）の厳密遵守は複数日対応で完成（現状は値を保持するのみ）。
  const freeActivities = (excludePast ? [] : options.definitions).filter(
    (d): d is FreeActivity =>
      d.kind === 'free' &&
      (d.autoPlace ?? true) &&
      (!d.allowedWeekdays || d.allowedWeekdays.includes(weekday)) &&
      !options.skipFreeIds?.has(d.id), // 希望頻度の上限に達した自由活動は当日スキップ。
  )
  const freeById = new Map(freeActivities.map((f) => [f.id, f]))
  const freeOccupied: Interval[] = [...busy, ...flexiblePlacements.map((p) => p.interval)]
  const freePlacements: PlacedItem[] = []
  for (const fa of freeActivities) {
    let gaps = freeGaps(window, freeOccupied)
    if (fa.allowedTimeRanges && fa.allowedTimeRanges.length > 0) {
      // 日をまたぐ範囲（例 22:00〜02:00）は同日内の夜間＋早朝の2区間へ展開する。
      const allowed = fa.allowedTimeRanges.flatMap(timeRangeToIntervals)
      gaps = intersectIntervals(gaps, allowed)
    }
    const want = fa.duration
    const min = fa.minDuration ?? want
    // 希望実行時間が入る空きを優先。無ければ最短実行時間が入る空きへ、入る分だけ置く。
    const gap = gaps.find((g) => duration(g) >= want) ?? gaps.find((g) => duration(g) >= min)
    if (!gap) continue // 空きが無ければ配置しない（余暇なので未配置警告は出さない）。
    const place = Math.min(want, duration(gap))
    const interval: Interval = { start: gap.start, end: gap.start + place }
    freePlacements.push({
      id: fa.id,
      sourceId: fa.id,
      kind: 'free',
      interval,
      movable: true,
      categoryId: fa.categoryId,
      label: fa.name,
    })
    freeOccupied.push(interval)
  }

  // 5. 負荷を持つ予定・回復区間・占有ブロックから休憩を挿入する（§12 / §3 / C-4）。
  //    固定予定・生活ルーチンは「壁」（不動）、柔軟タスクは休憩確保のため後ろへ動かせる（I-1）。
  const routineTypeById = new Map(routines.map((r) => [r.id, r.routineType]))
  const load = (p: PlacedItem & { load: ResolvedLoad }): LoadSegment => ({
    type: 'load',
    load: p.load,
    minutes: p.interval.end - p.interval.start,
  })
  const fixedEntries: TimelineEntry[] = fixedPlacements
    .filter((p): p is PlacedItem & { load: ResolvedLoad } => p.load !== undefined)
    .map((p) => ({ interval: p.interval, segment: load(p), movable: false, id: p.id }))
  const flexibleEntries: TimelineEntry[] = flexiblePlacements
    .filter((p): p is PlacedItem & { load: ResolvedLoad } => p.load !== undefined)
    .map((p) => ({ interval: p.interval, segment: load(p), movable: true, id: p.id }))
  // 生活ルーチンは壁として扱う。食事/入浴/睡眠は回復区間、家事は占有のみ（negative無し）。
  const routineEntries: TimelineEntry[] = routinePlacements.map((p) => {
    const routineType = p.sourceId ? routineTypeById.get(p.sourceId) : undefined
    const recoveryType = routineType ? ROUTINE_RECOVERY[routineType] : undefined
    const minutes = p.interval.end - p.interval.start
    const segment: LoadSegment = recoveryType
      ? { type: 'recovery', interval: recoveryType, minutes }
      : { type: 'neutral', minutes }
    return { interval: p.interval, segment, movable: false, id: p.id }
  })
  // 自由活動は効果で負荷を増減する 'free' 区間。休憩確保では最初に動かす対象（movable）。
  const freeEntries: TimelineEntry[] = freePlacements.map((p) => {
    const fa = p.sourceId ? freeById.get(p.sourceId) : undefined
    return {
      interval: p.interval,
      segment: {
        type: 'free',
        minutes: p.interval.end - p.interval.start,
        recoveryEffects: fa?.recoveryEffects,
        drainEffects: fa?.drainEffects,
      },
      movable: true,
      id: p.id,
    }
  })

  const { breaks, moved } = insertBreaks(
    [...fixedEntries, ...flexibleEntries, ...routineEntries, ...freeEntries],
    window,
  )

  // 休憩確保のために後ろへ動いた柔軟タスク・自由活動の配置を反映する。
  if (moved.size > 0) {
    for (const placement of [...flexiblePlacements, ...freePlacements]) {
      const next = moved.get(placement.id)
      if (next) placement.interval = next
    }
  }

  const timeline = [
    ...fixedPlacements,
    ...routinePlacements,
    ...flexiblePlacements,
    ...freePlacements,
    ...breaks,
  ].sort((a, b) => a.interval.start - b.interval.start)
  return { timeline, unplaced }
}
