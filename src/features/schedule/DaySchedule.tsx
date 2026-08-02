/**
 * 単日の自動スケジューリング結果を表示するUI。
 * 日付を選び「自動配置」で、固定予定＋柔軟タスクから配置＋休憩挿入を実行して表示する。
 */

import { useMemo, useState } from 'react'
import type { Category, Id, ResolvedLoad } from '../../domain/types'
import { minutesToTime } from '../../domain/scheduler/intervals'
import { scheduleDay, type ScheduleDayResult } from '../../domain/scheduler/scheduleDay'
import type { PlacedItem, UnplacedReason } from '../../domain/scheduler/placement'
import { classifyLoad, unitLoad, type LoadCategory } from '../../domain/load/score'
import { useAppStore } from '../../store/appStore'

const LOAD_BADGE: Record<LoadCategory, { label: string; className: string }> = {
  low: { label: '低負荷', className: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' },
  medium: {
    label: '中負荷',
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300',
  },
  high: { label: '高負荷', className: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' },
}

function LoadBadge({ load }: { load: ResolvedLoad }) {
  const category = classifyLoad(unitLoad(load))
  const badge = LOAD_BADGE[category]
  return <span className={`rounded px-1.5 py-0.5 text-xs ${badge.className}`}>{badge.label}</span>
}

const KIND_STYLE: Record<PlacedItem['kind'], string> = {
  fixed: 'border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950/40',
  flexible: 'border-l-4 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40',
  free: 'border-l-4 border-purple-500 bg-purple-50 dark:bg-purple-950/40',
  routine: 'border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/40',
  break: 'border-l-4 border-gray-400 bg-gray-50 dark:bg-gray-800/60',
}

const KIND_LABEL: Record<PlacedItem['kind'], string> = {
  fixed: '固定',
  flexible: 'タスク',
  free: '自由',
  routine: 'ルーチン',
  break: '休憩',
}

const REASON_LABEL: Record<UnplacedReason, string> = {
  insufficientFreeTime: '空き時間不足',
  noContiguousBlock: '分割不可で連続時間を確保できない',
  minChunkNotMet: '最短作業時間を満たせない',
}

function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function DaySchedule() {
  const definitions = useAppStore((s) => s.definitions)
  const categories = useAppStore((s) => s.categories)
  const [date, setDate] = useState(todayIso())
  const [result, setResult] = useState<ScheduleDayResult | null>(null)

  const categoryMap = useMemo(
    () => new Map<Id, Category>(categories.map((c) => [c.id, c])),
    [categories],
  )

  function run() {
    setResult(scheduleDay({ date, definitions, categories: categoryMap }))
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <div className="mb-3 flex items-end gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">対象日</label>
          <input
            type="date"
            className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <button
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          onClick={run}
        >
          自動配置
        </button>
      </div>

      {result === null ? (
        <p className="text-sm text-gray-500">「自動配置」を押すと、その日の予定を自動で組み立てます。</p>
      ) : (
        <div className="space-y-3">
          {result.timeline.length === 0 ? (
            <p className="text-sm text-gray-500">この日に配置された予定はありません。</p>
          ) : (
            <ul className="space-y-1">
              {result.timeline.map((item) => (
                <li
                  key={item.id}
                  className={`flex items-center gap-3 rounded px-3 py-1.5 text-sm ${KIND_STYLE[item.kind]}`}
                >
                  <span className="font-mono text-xs text-gray-600 dark:text-gray-300">
                    {minutesToTime(item.interval.start)}–{minutesToTime(item.interval.end)}
                  </span>
                  <span className="rounded bg-white/70 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-black/30 dark:text-gray-300">
                    {KIND_LABEL[item.kind]}
                  </span>
                  <span className="font-medium">{item.label ?? ''}</span>
                  {item.load && <LoadBadge load={item.load} />}
                </li>
              ))}
            </ul>
          )}

          {result.unplaced.length > 0 && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/40">
              <p className="mb-1 font-semibold text-red-700 dark:text-red-300">未配置のタスク</p>
              <ul className="space-y-0.5">
                {result.unplaced.map((u) => (
                  <li key={u.task.id} className="text-red-700 dark:text-red-300">
                    {u.task.name}
                    <span className="ml-2 text-xs">（{REASON_LABEL[u.reason]}）</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
