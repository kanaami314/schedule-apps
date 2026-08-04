/**
 * バランス分析（§20）の集計。
 *
 * 現状の実装範囲（§26 に従い、未実装部分は明記）:
 * - 20.1 集計期間: 今日 / 今週 / 先週 / 今月（週は月曜始まり）
 * - 20.2 表示モード: 予定時間 / 実績時間 / 比較（UI 側）
 * - 20.3 カテゴリ表示: 最上位カテゴリごとの時間・割合・横棒（UI 側）
 * - 20.5 予定と実績の比較: カテゴリごとの予定/実績/差分
 * 未対応（今後）: 20.4 分母の選択肢、20.6 目標時間、20.7 負荷分析、20.8 自由活動分析、
 * 子カテゴリのドリルダウン、カテゴリの表示/非表示切替。
 *
 * 集計は対象期間の各日について scheduleDay を実行し、最上位カテゴリ単位で
 * 予定時間（休憩を除く配置予定）と実績時間（完了記録）を積み上げる。
 */

import type { ActivityRecord, Category, Id, ScheduleDefinition } from '../types'
import { categoryChain } from '../load/inheritance'
import { classifyLoad, type LoadCategory } from '../load/score'
import { scheduleDay } from '../scheduler/scheduleDay'
import type { Interval } from '../scheduler/intervals'

/** 集計期間の種類（§20.1）。 */
export type BalancePeriod = 'today' | 'thisWeek' | 'lastWeek' | 'thisMonth'

/** 最上位カテゴリごとの予定/実績時間（分）。 */
export interface CategoryBalance {
  /** 最上位カテゴリ ID。未分類は空文字。 */
  categoryId: Id
  plannedMinutes: number
  actualMinutes: number
}

/**
 * 負荷分析（§20.7）。期間内に配置された予定の、時間で重み付けした平均負荷レベルを
 * 軸ごとに区分（低/普通/高）で表す。負荷を持つ予定が無い軸は null。
 */
export interface LoadAnalysis {
  total: LoadCategory | null
  focus: LoadCategory | null
  mental: LoadCategory | null
  physical: LoadCategory | null
}

export interface BalanceResult {
  categories: CategoryBalance[]
  totalPlanned: number
  totalActual: number
  /** 負荷分析（§20.7）。 */
  load: LoadAnalysis
  /** 集計期間の総時間（分）＝ 日数 × 24h（§20.4 の分母「選択期間全体」）。 */
  periodMinutes: number
  /** 期間内に配置された睡眠時間の合計（分）。§20.4 の「睡眠を除いた利用可能時間」に使う。 */
  sleepMinutes: number
}

const pad = (n: number) => String(n).padStart(2, '0')
const toIso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** 月曜始まりの週で、date を含む週の月曜日を返す。 */
function mondayOf(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0=日
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

/** 集計期間に含まれる日付（IsoDate）の配列を返す（§20.1）。 */
export function periodDates(period: BalancePeriod, today: Date): string[] {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const range = (start: Date, days: number): string[] =>
    Array.from({ length: days }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return toIso(d)
    })

  switch (period) {
    case 'today':
      return [toIso(base)]
    case 'thisWeek':
      return range(mondayOf(base), 7)
    case 'lastWeek': {
      const lastMonday = mondayOf(base)
      lastMonday.setDate(lastMonday.getDate() - 7)
      return range(lastMonday, 7)
    }
    case 'thisMonth': {
      const first = new Date(base.getFullYear(), base.getMonth(), 1)
      const daysInMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
      return range(first, daysInMonth)
    }
  }
}

const dur = (i: Interval): number => i.end - i.start

/** 期間内の各日を集計し、最上位カテゴリ別の予定/実績時間を返す（§20）。 */
export function computeBalance(
  period: BalancePeriod,
  today: Date,
  definitions: readonly ScheduleDefinition[],
  categories: ReadonlyMap<Id, Category>,
  records: readonly ActivityRecord[],
): BalanceResult {
  const dates = periodDates(period, today)
  const recordsByDate = new Map<string, ActivityRecord[]>()
  for (const r of records) {
    const list = recordsByDate.get(r.date) ?? []
    list.push(r)
    recordsByDate.set(r.date, list)
  }

  /** 割り当てカテゴリから最上位カテゴリ ID を得る（§8.4 と同じ基準）。未分類は ''。 */
  const topLevel = (categoryId: Id | undefined): Id => {
    const chain = categoryChain(categoryId, categories)
    return chain[chain.length - 1]?.id ?? ''
  }

  const planned = new Map<Id, number>()
  const actual = new Map<Id, number>()
  const add = (map: Map<Id, number>, key: Id, minutes: number) =>
    map.set(key, (map.get(key) ?? 0) + minutes)

  // 負荷分析（§20.7）用の、時間で重み付けした軸別の負荷レベル合計。
  const loadSum = { focus: 0, mental: 0, physical: 0 }
  let loadMinutes = 0
  // §20.4 の分母用: 睡眠時間の合計。
  const sleepRoutineIds = new Set(
    definitions.filter((d) => d.kind === 'routine' && d.routineType === 'sleep').map((d) => d.id),
  )
  let sleepMinutes = 0

  for (const date of dates) {
    const { timeline } = scheduleDay({ date, definitions, categories })
    const itemById = new Map(timeline.map((i) => [i.id, i]))
    for (const item of timeline) {
      if (item.kind === 'routine' && item.sourceId && sleepRoutineIds.has(item.sourceId)) {
        sleepMinutes += dur(item.interval)
      }
      if (item.kind === 'break') continue
      add(planned, topLevel(item.categoryId), dur(item.interval))
      if (item.load) {
        const minutes = dur(item.interval)
        loadSum.focus += item.load.focus * minutes
        loadSum.mental += item.load.mental * minutes
        loadSum.physical += item.load.physical * minutes
        loadMinutes += minutes
      }
    }
    for (const record of recordsByDate.get(date) ?? []) {
      if (record.status !== 'completed') continue
      const item = itemById.get(record.itemId)
      if (!item) continue
      add(actual, topLevel(item.categoryId), dur(item.interval))
    }
  }

  const keys = new Set<Id>([...planned.keys(), ...actual.keys()])
  const result: CategoryBalance[] = [...keys].map((categoryId) => ({
    categoryId,
    plannedMinutes: planned.get(categoryId) ?? 0,
    actualMinutes: actual.get(categoryId) ?? 0,
  }))
  result.sort((a, b) => b.plannedMinutes - a.plannedMinutes)

  // 軸ごとの平均負荷レベルを区分に変換（負荷を持つ予定が無ければ null）。
  const classifyAxis = (sum: number): LoadCategory | null =>
    loadMinutes > 0 ? classifyLoad(sum / loadMinutes) : null
  const load: LoadAnalysis = {
    focus: classifyAxis(loadSum.focus),
    mental: classifyAxis(loadSum.mental),
    physical: classifyAxis(loadSum.physical),
    total: classifyAxis((loadSum.focus + loadSum.mental + loadSum.physical) / 3),
  }

  return {
    categories: result,
    totalPlanned: [...planned.values()].reduce((s, n) => s + n, 0),
    totalActual: [...actual.values()].reduce((s, n) => s + n, 0),
    load,
    periodMinutes: dates.length * 24 * 60,
    sleepMinutes,
  }
}
