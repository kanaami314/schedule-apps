/**
 * 配置レイヤの型と、柔軟なタスクの貪欲配置（§3, §5, §16.6）。
 *
 * 単日スコープ。整列済みの柔軟なタスクを空き時間へ前詰めで配置する。
 * 分割可能タスクは最短作業時間(§5.1)を満たす範囲で分割する。
 * 配置できない場合は理由(§16.6)に分類して返す。
 *
 * スケルトンの範囲: 実行可能時間帯・実行可能曜日・関連固定予定の制約(§5.2〜§5.4)は
 * まだ考慮しない（今後の拡張）。負荷は付与せず、休憩挿入レイヤで解決する。
 */

import type { FlexibleTask, Id, ResolvedLoad } from '../types'
import {
  duration,
  freeGaps,
  mergeIntervals,
  timeToMinutes,
  totalDuration,
  type Interval,
} from './intervals'

/** 空き区間の集合を、許可区間の集合と交差させる（§5.2 実行可能時間帯）。 */
export function intersectIntervals(gaps: readonly Interval[], allowed: readonly Interval[]): Interval[] {
  const out: Interval[] = []
  for (const g of gaps) {
    for (const a of allowed) {
      const start = Math.max(g.start, a.start)
      const end = Math.min(g.end, a.end)
      if (end > start) out.push({ start, end })
    }
  }
  return out.sort((x, y) => x.start - y.start)
}

/** 配置された予定の種類。 */
export type PlacedKind = 'fixed' | 'routine' | 'flexible' | 'free' | 'break'

/** タイムライン上に配置された1件の予定。 */
export interface PlacedItem {
  /** 配置ごとの一意ID。 */
  id: string
  /** 元の定義ID（休憩など自動生成物は持たない）。 */
  sourceId?: Id
  kind: PlacedKind
  interval: Interval
  /** 移動可能か（固定予定・生活ルーチンは false）。 */
  movable: boolean
  /** 解決済み負荷（負荷を持つ予定のみ）。 */
  load?: ResolvedLoad
  /** 由来の予定が属するカテゴリ（色分け等に使用, §8.4）。 */
  categoryId?: Id
  label?: string
}

/** 配置失敗の理由（§16.6）。 */
export type UnplacedReason =
  /** 空き時間不足。 */
  | 'insufficientFreeTime'
  /** 分割不可で連続時間を確保できない。 */
  | 'noContiguousBlock'
  /** 最短作業時間を満たせない（分割しても収まらない）。 */
  | 'minChunkNotMet'

export interface Unplaced {
  task: FlexibleTask
  reason: UnplacedReason
}

export interface PlacementResult {
  placements: PlacedItem[]
  unplaced: Unplaced[]
}

export interface PlaceOptions {
  /** 配置対象の時間窓（その日の稼働範囲）。 */
  window: Interval
  /** 既に占有されている区間（固定予定・生活ルーチン・付随時間など）。 */
  busy: readonly Interval[]
  /** 配置順に整列済みの柔軟なタスク（`orderFlexibleTasks` の結果）。 */
  tasks: readonly FlexibleTask[]
  /**
   * 関連固定予定の条件（§5.4）による、タスクごとの追加配置ウィンドウ制約。
   * `task.id → 配置を許可する区間`。指定タスクはこの区間内にのみ配置する。
   */
  constraints?: ReadonlyMap<Id, Interval>
}

/** 分割不可タスクを1つの連続空きに配置する。 */
function placeNonSplittable(task: FlexibleTask, gaps: Interval[]): Interval[] | UnplacedReason {
  const need = task.estimatedDuration
  const gap = gaps.find((g) => duration(g) >= need)
  if (gap) return [{ start: gap.start, end: gap.start + need }]
  return totalDuration(gaps) < need ? 'insufficientFreeTime' : 'noContiguousBlock'
}

/** 分割可能タスクを複数の空きへ分割配置する。各セッションは最短作業時間以上。 */
function placeSplittable(task: FlexibleTask, gaps: Interval[]): Interval[] | UnplacedReason {
  const minChunk = task.minChunk ?? task.estimatedDuration
  const preferred = task.preferredChunk // 未設定なら空きに合わせて詰める
  let remaining = task.estimatedDuration
  const sessions: Interval[] = []

  for (const gap of gaps) {
    let cursor = gap.start
    while (remaining > 0 && gap.end - cursor >= minChunk) {
      const room = gap.end - cursor
      const session = Math.min(remaining, room, preferred ?? room)
      if (session < minChunk) break
      sessions.push({ start: cursor, end: cursor + session })
      cursor += session
      remaining -= session
    }
    if (remaining === 0) break
  }

  if (remaining > 0) {
    return totalDuration(gaps) < task.estimatedDuration ? 'insufficientFreeTime' : 'minChunkNotMet'
  }
  // 同一空き内で隣接したセッションは1区間に結合して返す。
  return mergeIntervals(sessions)
}

/**
 * 整列済みの柔軟なタスクを空き時間へ貪欲配置する。
 * 先頭のタスクほど優先的に前詰めで配置し、配置後に空きを再計算する。
 */
export function placeFlexibleTasks(options: PlaceOptions): PlacementResult {
  const occupied: Interval[] = [...options.busy]
  const placements: PlacedItem[] = []
  const unplaced: Unplaced[] = []

  for (const task of options.tasks) {
    let gaps = freeGaps(options.window, occupied)
    // 実行可能時間帯（§5.2）が指定されていれば、その範囲内の空きに限定する。
    if (task.allowedTimeRanges && task.allowedTimeRanges.length > 0) {
      const allowed = task.allowedTimeRanges.map((r) => ({
        start: timeToMinutes(r.start),
        end: timeToMinutes(r.end),
      }))
      gaps = intersectIntervals(gaps, allowed)
    }
    // 関連固定予定の条件（§5.4）による配置ウィンドウ制約を重ねる。
    const constraint = options.constraints?.get(task.id)
    if (constraint) {
      gaps = intersectIntervals(gaps, [constraint])
    }
    const result = task.splittable
      ? placeSplittable(task, gaps)
      : placeNonSplittable(task, gaps)

    if (typeof result === 'string') {
      unplaced.push({ task, reason: result })
      continue
    }

    result.forEach((interval, index) => {
      placements.push({
        id: `${task.id}#${index}`,
        sourceId: task.id,
        kind: 'flexible',
        interval,
        movable: true,
        label: task.name,
      })
      occupied.push(interval)
    })
  }

  return { placements, unplaced }
}
