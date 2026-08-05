/**
 * 時間区間のユーティリティ（自動配置の土台）。
 *
 * 1日の中の時刻を「その日の 00:00 からの分数」で表す（[start, end) の半開区間）。
 * 空き時間（フリーギャップ）の算出、重なり判定、結合などを行う。
 */

import type { IsoTime, Minutes, TimeRange } from '../types'

/** 半開区間 [start, end)。単位は「その日の00:00からの分数」。 */
export interface Interval {
  start: Minutes
  end: Minutes
}

/** `HH:mm` を、その日の00:00からの分数へ変換する。 */
export function timeToMinutes(time: IsoTime): Minutes {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** その日の00:00からの分数を `HH:mm` へ変換する（24時以降は切り詰めない）。 */
export function minutesToTime(minutes: Minutes): IsoTime {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** 区間の長さ（分）。負なら0とみなす。 */
export function duration(interval: Interval): Minutes {
  return Math.max(0, interval.end - interval.start)
}

/**
 * `HH:mm`〜`HH:mm` の時刻範囲を、その日の分数区間へ変換する（§5.2 実行可能時間帯）。
 * 終了が開始より後なら単一区間 [start, end)。
 * 終了が開始以下（日をまたぐ, 例 22:00〜02:00）なら、同日内の夜間 [start, 24:00) と
 * 早朝 [00:00, end) の2区間に分割して返す（単日スケジューリングで夜間・早朝を許可する近似）。
 * 幅0（start === end）は「許可なし」とみなし空配列を返す。
 */
export function timeRangeToIntervals(range: TimeRange): Interval[] {
  const start = timeToMinutes(range.start)
  const end = timeToMinutes(range.end)
  if (end > start) return [{ start, end }]
  if (end === start) return []
  const DAY = 24 * 60
  const out: Interval[] = []
  if (start < DAY) out.push({ start, end: DAY })
  if (end > 0) out.push({ start: 0, end })
  return out
}

/** 空（長さ0以下）の区間か。 */
export function isEmpty(interval: Interval): boolean {
  return interval.end <= interval.start
}

/** 2区間が重なるか（境界の接触は重ならないとみなす）。 */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end
}

/** 重なり・隣接する区間を結合して、start昇順の互いに素な区間列にする。 */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals
    .filter((i) => !isEmpty(i))
    .slice()
    .sort((a, b) => a.start - b.start)
  const merged: Interval[] = []
  for (const cur of sorted) {
    const last = merged[merged.length - 1]
    if (last && cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end)
    } else {
      merged.push({ ...cur })
    }
  }
  return merged
}

/**
 * 対象区間 `window` から、占有区間 `busy` を差し引いた空き区間列を返す。
 * busy は重複・未整列でもよい。返り値は start 昇順・互いに素。
 */
export function freeGaps(window: Interval, busy: readonly Interval[]): Interval[] {
  if (isEmpty(window)) return []
  const occupied = mergeIntervals(
    busy
      // window と交差する部分だけに丸める
      .map((b) => ({ start: Math.max(b.start, window.start), end: Math.min(b.end, window.end) }))
      .filter((b) => !isEmpty(b)),
  )

  const gaps: Interval[] = []
  let cursor = window.start
  for (const b of occupied) {
    if (b.start > cursor) gaps.push({ start: cursor, end: b.start })
    cursor = Math.max(cursor, b.end)
  }
  if (cursor < window.end) gaps.push({ start: cursor, end: window.end })
  return gaps
}

/** 複数区間の合計長（分）。 */
export function totalDuration(intervals: readonly Interval[]): Minutes {
  return intervals.reduce((sum, i) => sum + duration(i), 0)
}
