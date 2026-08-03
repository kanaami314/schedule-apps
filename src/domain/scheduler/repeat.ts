/**
 * 固定予定の繰り返し展開（§4.3）。
 *
 * 予定は基準日 `baseDate` を起点に、繰り返し規則に従って各対象日に出現する。
 * 単日スケジューラ（scheduleDay）は対象日ごとに `occursOn` で出現有無を判定する。
 *
 * 対応規則（RepeatRule）:
 * - none / 未設定: 基準日のみ
 * - daily: 基準日以降の毎日
 * - weekly: 指定曜日（基準日以降）
 * - biweekly: 指定曜日かつ基準日からの週が偶数（1週おき）
 * - monthly: 毎月の指定日（基準日以降）
 */

import type { IsoDate, RepeatRule, Weekday } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000

/** 'YYYY-MM-DD' を UTC 正午のミリ秒に変換（DST の影響を避ける）。 */
function toUtcMs(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d, 12)
}

/** 'YYYY-MM-DD' の曜日（0=日〜6=土）。 */
export function weekdayOf(date: IsoDate): Weekday {
  return new Date(toUtcMs(date)).getUTCDay() as Weekday
}

/** 'YYYY-MM-DD' の日（1〜31）。 */
function dayOfMonth(date: IsoDate): number {
  return Number(date.split('-')[2])
}

/** 基準日 `baseDate` の予定が、繰り返し規則 `repeat` のもとで対象日 `target` に出現するか。 */
export function occursOn(baseDate: IsoDate, repeat: RepeatRule | undefined, target: IsoDate): boolean {
  // 基準日より前には出現しない。
  if (target < baseDate) return false
  if (!repeat || repeat.kind === 'none') return target === baseDate

  switch (repeat.kind) {
    case 'daily':
      return true
    case 'weekly':
      return repeat.weekdays.includes(weekdayOf(target))
    case 'biweekly': {
      if (!repeat.weekdays.includes(weekdayOf(target))) return false
      // 基準（anchorDate）からの週数が偶数のときのみ出現。
      const weeks = Math.floor((toUtcMs(target) - toUtcMs(repeat.anchorDate)) / (7 * DAY_MS))
      return weeks >= 0 && weeks % 2 === 0
    }
    case 'monthly':
      return dayOfMonth(target) === repeat.dayOfMonth
  }
}
