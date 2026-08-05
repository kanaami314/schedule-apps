/**
 * カレンダー（§22）。週表示・月表示に対応し、最上位カテゴリで絞り込める。
 * 各日は scheduleDay で自動配置した結果を集計・表示する。
 * 日表示は「自動スケジュール」(DaySchedule) が担うため、ここでは週/月を提供する。
 * プロジェクト・長期目標での絞り込み(§22)は該当UIが未実装のため今後（[[project-status]]）。
 */

import { useMemo, useState } from 'react'
import type { Category, Id, ScheduleDefinition } from '../../domain/types'
import { categoryChain } from '../../domain/load/inheritance'
import { minutesToTime } from '../../domain/scheduler/intervals'
import { scheduleRange } from '../../domain/scheduler/scheduleRange'
import { completedMinutesByTask } from '../../domain/analytics/progress'
import type { PlacedItem } from '../../domain/scheduler/placement'
import { useAppStore } from '../../store/appStore'

type View = 'week' | 'month'

const pad = (n: number) => String(n).padStart(2, '0')
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const

/** 月曜始まりの週で date を含む週の月曜日。 */
function mondayOf(d: Date): Date {
  const x = new Date(d)
  const day = x.getDay()
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day))
  return x
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

const tabClass = (active: boolean) =>
  `rounded px-3 py-1 text-sm font-medium ${
    active ? 'bg-blue-600 text-white' : 'border border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300'
  }`

export function CalendarView() {
  const definitions = useAppStore((s) => s.definitions)
  const categories = useAppStore((s) => s.categories)
  const projects = useAppStore((s) => s.projects)
  const records = useAppStore((s) => s.records)
  const minimalMode = useAppStore((s) => s.minimalMode)
  const completedByTask = useMemo(() => completedMinutesByTask(records), [records])

  const [view, setView] = useState<View>('week')
  const [anchor, setAnchor] = useState(() => new Date())
  const [categoryFilter, setCategoryFilter] = useState<Id | ''>('')
  const [projectFilter, setProjectFilter] = useState<Id | ''>('')

  const categoryMap = useMemo(
    () => new Map<Id, Category>(categories.map((c) => [c.id, c])),
    [categories],
  )
  const defById = useMemo(
    () => new Map<Id, ScheduleDefinition>(definitions.map((d) => [d.id, d])),
    [definitions],
  )
  const topLevels = useMemo(() => categories.filter((c) => !c.parentId), [categories])

  /** 予定の最上位カテゴリ ID（未分類は ''）。 */
  const topOf = (categoryId: Id | undefined): Id => {
    const chain = categoryChain(categoryId, categoryMap)
    return chain[chain.length - 1]?.id ?? ''
  }

  /** 予定の由来定義の projectId（無ければ undefined）。 */
  const projectOf = (item: PlacedItem): Id | undefined => {
    const def = item.sourceId ? defById.get(item.sourceId) : undefined
    return def && 'projectId' in def ? def.projectId : undefined
  }

  const today = toIso(new Date())

  const weekDates = useMemo(() => {
    const mon = mondayOf(anchor)
    return Array.from({ length: 7 }, (_, i) => addDays(mon, i))
  }, [anchor])

  const monthGrid = useMemo(() => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const gridStart = mondayOf(first)
    // 6週間ぶん（42日）で月をカバー。
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  }, [anchor])

  // 表示範囲の全日を複数日配分でまとめて組む（柔軟タスクが日をまたいで分散される）。
  const rangeResults = useMemo(() => {
    const dates = (view === 'week' ? weekDates : monthGrid).map(toIso)
    // 過去日には柔軟タスク・自由活動を置かず、今日以降の空きへ順に配分する。
    return scheduleRange({ dates, definitions, categories: categoryMap, completedByTask, notBefore: today })
  }, [view, weekDates, monthGrid, definitions, categoryMap, completedByTask, today])

  /** 対象日の配置予定（休憩を除く・カテゴリ/プロジェクト絞り込み適用）。 */
  const itemsOf = (date: string): PlacedItem[] => {
    const timeline = rangeResults.get(date)?.timeline ?? []
    return timeline.filter(
      (i) =>
        i.kind !== 'break' &&
        (categoryFilter === '' || topOf(i.categoryId) === categoryFilter) &&
        (projectFilter === '' || projectOf(i) === projectFilter),
    )
  }

  function shift(dir: -1 | 1) {
    setAnchor((prev) =>
      view === 'week' ? addDays(prev, dir * 7) : new Date(prev.getFullYear(), prev.getMonth() + dir, 1),
    )
  }

  const rangeLabel =
    view === 'week'
      ? `${toIso(weekDates[0])} 〜 ${toIso(weekDates[6])}`
      : `${anchor.getFullYear()}年${anchor.getMonth() + 1}月`

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          <button className={tabClass(view === 'week')} onClick={() => setView('week')}>週</button>
          <button className={tabClass(view === 'month')} onClick={() => setView('month')}>月</button>
        </div>
        <div className="flex items-center gap-1">
          <button className={tabClass(false)} onClick={() => shift(-1)}>◀</button>
          <span className="min-w-40 text-center text-sm font-medium">{rangeLabel}</span>
          <button className={tabClass(false)} onClick={() => shift(1)}>▶</button>
          <button className={tabClass(false)} onClick={() => setAnchor(new Date())}>今日</button>
        </div>
        <select
          className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">すべてのカテゴリ</option>
          {topLevels.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {/* プロジェクト絞り込みは通常モードのみ（§23.5 で最低限モードは隠す）。 */}
        {!minimalMode && projects.length > 0 && (
          <select
            className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="">すべてのプロジェクト</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {view === 'week' ? (
        <div className="grid grid-cols-7 gap-1">
          {weekDates.map((d) => {
            const iso = toIso(d)
            const items = itemsOf(iso)
            return (
              <div
                key={iso}
                className={`rounded border p-1 ${
                  iso === today ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/40' : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="mb-1 text-center text-xs font-medium text-gray-500">
                  {WEEKDAY_LABELS[d.getDay()]} {d.getDate()}
                </div>
                <ul className="space-y-0.5">
                  {items.map((i) => (
                    <li
                      key={i.id}
                      className="truncate rounded px-1 text-[10px]"
                      style={{ backgroundColor: (categoryMap.get(topOf(i.categoryId))?.color ?? '#9ca3af') + '33' }}
                      title={`${minutesToTime(i.interval.start)} ${i.label ?? ''}`}
                    >
                      {minutesToTime(i.interval.start)} {i.label ?? ''}
                    </li>
                  ))}
                  {items.length === 0 && <li className="text-center text-[10px] text-gray-300">—</li>}
                </ul>
              </div>
            )
          })}
        </div>
      ) : (
        <div>
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-gray-400">
            {['月', '火', '水', '木', '金', '土', '日'].map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthGrid.map((d) => {
              const iso = toIso(d)
              const inMonth = d.getMonth() === anchor.getMonth()
              const count = itemsOf(iso).length
              return (
                <div
                  key={iso}
                  className={`min-h-14 rounded border p-1 text-xs ${
                    iso === today ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/40' : 'border-gray-200 dark:border-gray-700'
                  } ${inMonth ? '' : 'opacity-40'}`}
                >
                  <div className="text-right text-[11px] text-gray-500">{d.getDate()}</div>
                  {count > 0 && (
                    <div className="mt-1 rounded bg-blue-100 px-1 text-center text-[10px] text-blue-700 dark:bg-blue-900/60 dark:text-blue-200">
                      {count}件
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
