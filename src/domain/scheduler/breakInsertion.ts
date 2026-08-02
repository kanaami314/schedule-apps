/**
 * 休憩の自動挿入（§3, §12 / C-4）。
 *
 * 配置済みのタイムラインを時系列に走査し、連続負荷量を追跡する。
 * ある予定の直後に総合累積負荷が閾値(6.0)以上になった場合、その直後の空き時間へ
 * 休憩を挿入し、負荷をリセットする（§13.1）。空き時間は §13.5 に従い自動回復する。
 *
 * スケルトンの範囲: 既存の空き時間への挿入までを扱う。移動可能な予定をずらして
 * 空きを作る処理（§3 の調整手順の完全版）は今後の拡張。
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
import type { Interval } from './intervals'
import type { PlacedItem } from './placement'

/** 負荷計算の対象となる、タイムライン上の1区間。 */
export interface TimelineEntry {
  interval: Interval
  /** この区間が累積負荷に与える作用。 */
  segment: LoadSegment
  /** 由来（休憩挿入結果には引き継がない補助情報）。 */
  sourceId?: string
  label?: string
}

export interface BreakInsertionResult {
  /** 挿入された休憩の配置。 */
  breaks: PlacedItem[]
  /** 走査終了時点の累積負荷。 */
  finalLoad: CumulativeLoad
}

/**
 * タイムラインを走査し、必要な位置へ休憩を挿入する。
 *
 * @param entries 時系列順でなくてよい（内部で start 昇順に整列する）。区間は重ならない前提。
 * @param window 稼働時間窓（最後の予定の後の空きの上限に使う）。
 */
export function insertBreaks(
  entries: readonly TimelineEntry[],
  window: Interval,
): BreakInsertionResult {
  const sorted = entries.slice().sort((a, b) => a.interval.start - b.interval.start)
  const breaks: PlacedItem[] = []
  const nextBreakId = (): string => `break#${breaks.length + 1}`

  let running: CumulativeLoad = ZERO_CUMULATIVE
  let prevEnd = window.start

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i]

    // 直前の空き（純粋な未配置区間）は自動回復する（§13.5）。
    const idleBefore = entry.interval.start - prevEnd
    if (idleBefore > 0) running = applyRecovery(running, 'idle', idleBefore)

    // 予定本体を適用。
    running = applySegment(running, entry.segment)
    prevEnd = entry.interval.end

    // 直後の空きへ休憩を検討（§12 / C-4）。
    if (running.total >= LOAD_STATE_THRESHOLDS.high) {
      const nextStart = i + 1 < sorted.length ? sorted[i + 1].interval.start : window.end
      const available: Minutes = nextStart - entry.interval.end
      const breakMinutes = resolveBreakMinutes(running.total, available)
      if (breakMinutes !== null) {
        const interval: Interval = {
          start: entry.interval.end,
          end: entry.interval.end + breakMinutes,
        }
        breaks.push({ id: nextBreakId(), kind: 'break', interval, movable: true, label: '休憩' })
        running = applyRecovery(running, 'break', breakMinutes)
        prevEnd = interval.end
      }
    }
  }

  return { breaks, finalLoad: running }
}
