/**
 * 休憩の自動挿入（§3, §12 / C-4）。
 *
 * 配置済みのタイムラインを時系列に走査し、連続負荷量を追跡する。
 * ある予定の直後に総合累積負荷が閾値(6.0)以上になった場合、その直後へ休憩を挿入し、
 * 負荷をリセットする（§13.1）。空き時間は §13.5 に従い自動回復する。
 *
 * 休憩スペースが直後に足りない場合は、§3 の調整手順に従い、後続の「可動」予定
 * （柔軟なタスク・自由活動）を次の「壁」（固定予定・生活ルーチン）または稼働終了まで
 * 後ろへずらして休憩を確保する（I-1: 同日内で後方へ再配置。固定・生活ルーチンは動かさない）。
 * 壁までの空き容量でも足りなければ、確保できる最大時間で配置する（5分未満なら配置しない）。
 */

import type { Minutes } from '../types'
import type { CumulativeLoad } from './../load/score'
import { ZERO_CUMULATIVE } from './../load/score'
import { applyRecovery } from './../load/recovery'
import {
  applySegment,
  LOAD_STATE_THRESHOLDS,
  resolveBreakMinutes,
  type LoadSegment,
} from './../load/continuous'
import { duration, type Interval } from './intervals'
import type { PlacedItem } from './placement'

/** 負荷計算の対象となる、タイムライン上の1区間。 */
export interface TimelineEntry {
  interval: Interval
  /** この区間が累積負荷に与える作用。 */
  segment: LoadSegment
  /** 休憩確保のために後ろへ動かしてよいか（柔軟タスク・自由活動＝true, 既定 false）。 */
  movable?: boolean
  /** 配置ブロックの ID（移動結果を呼び出し側へ返すためのキー）。 */
  id?: string
  /** 由来（休憩挿入結果には引き継がない補助情報）。 */
  sourceId?: string
  label?: string
}

export interface BreakInsertionResult {
  /** 挿入された休憩の配置。 */
  breaks: PlacedItem[]
  /** 休憩確保のために後ろへ動かした予定の新しい区間（`id → 新区間`）。 */
  moved: Map<string, Interval>
  /** 走査終了時点の累積負荷。 */
  finalLoad: CumulativeLoad
}

/** 内部作業用の可変エントリ。 */
interface WorkEntry {
  interval: Interval
  segment: LoadSegment
  movable: boolean
  id?: string
}

/**
 * タイムラインを走査し、必要な位置へ休憩を挿入する。
 * 直後の空きが足りない場合は、後続の可動予定を壁まで後ろへずらして確保する（§3 / C-4 / I-1）。
 *
 * @param entries 時系列順でなくてよい（内部で start 昇順に整列する）。区間は重ならない前提。
 * @param window 稼働時間窓（最後の予定の後の空きの上限に使う）。
 */
export function insertBreaks(
  entries: readonly TimelineEntry[],
  window: Interval,
): BreakInsertionResult {
  const work: WorkEntry[] = entries
    .slice()
    .sort((a, b) => a.interval.start - b.interval.start)
    .map((e) => ({
      interval: { ...e.interval },
      segment: e.segment,
      movable: e.movable ?? false,
      id: e.id,
    }))

  const breaks: PlacedItem[] = []
  const moved = new Map<string, Interval>()
  const nextBreakId = (): string => `break#${breaks.length + 1}`

  let running: CumulativeLoad = ZERO_CUMULATIVE
  let prevEnd = window.start

  for (let i = 0; i < work.length; i++) {
    const entry = work[i]

    // 直前の空き（純粋な未配置区間）は自動回復する（§13.5）。
    const idleBefore = entry.interval.start - prevEnd
    if (idleBefore > 0) running = applyRecovery(running, 'idle', idleBefore)

    // 予定本体を適用。
    running = applySegment(running, entry.segment)
    prevEnd = entry.interval.end

    // 高負荷連続なら直後へ休憩を検討（§12 / C-4）。
    if (running.total >= LOAD_STATE_THRESHOLDS.high) {
      // 次の「壁」（不動の予定）の位置を求める。壁までの間の可動予定は後ろへずらせる。
      let w = i + 1
      while (w < work.length && work[w].movable) w++
      const wallStart = w < work.length ? work[w].interval.start : window.end
      // 壁までの可動予定の合計時間。休憩＋可動予定が壁までに収まる必要がある。
      let movableDur = 0
      for (let k = i + 1; k < w; k++) movableDur += duration(work[k].interval)
      const capacity: Minutes = wallStart - entry.interval.end - movableDur

      const breakMinutes = resolveBreakMinutes(running.total, Math.max(0, capacity))
      if (breakMinutes !== null) {
        const interval: Interval = {
          start: entry.interval.end,
          end: entry.interval.end + breakMinutes,
        }
        breaks.push({ id: nextBreakId(), kind: 'break', interval, movable: true, label: '休憩' })

        // 休憩に押し出される可動予定だけを、必要な分だけ後ろへずらす（前へは動かさない）。
        let cursor = interval.end
        for (let k = i + 1; k < w; k++) {
          const item = work[k]
          const d = duration(item.interval)
          const newStart = Math.max(item.interval.start, cursor)
          if (newStart !== item.interval.start) {
            item.interval = { start: newStart, end: newStart + d }
            if (item.id) moved.set(item.id, item.interval)
          }
          cursor = item.interval.end
        }

        running = applyRecovery(running, 'break', breakMinutes)
        prevEnd = interval.end
      }
    }
  }

  return { breaks, moved, finalLoad: running }
}
