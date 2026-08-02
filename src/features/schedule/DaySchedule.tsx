/**
 * 単日の自動スケジューリング結果を、時間軸グリッド（カレンダー日表示）で表示するUI。
 * 対象日と稼働時間帯を選び「自動配置」で、固定予定＋柔軟タスクから配置＋休憩挿入を実行する。
 */

import { useMemo, useState, type CSSProperties } from 'react'
import type { Category, Id, ResolvedLoad } from '../../domain/types'
import { minutesToTime, timeToMinutes, type Interval } from '../../domain/scheduler/intervals'
import { scheduleDay, type ScheduleDayResult } from '../../domain/scheduler/scheduleDay'
import type { PlacedItem, UnplacedReason } from '../../domain/scheduler/placement'
import { classifyLoad, unitLoad, type LoadCategory } from '../../domain/load/score'
import { categoryChain } from '../../domain/load/inheritance'
import { useAppStore } from '../../store/appStore'

/** カテゴリの最上位の色を返す（§8.4）。 */
function topLevelColor(
  categoryId: Id | undefined,
  categories: ReadonlyMap<Id, Category>,
): string | undefined {
  if (!categoryId) return undefined
  const chain = categoryChain(categoryId, categories)
  return chain[chain.length - 1]?.color
}

/** 1分あたりの表示ピクセル数。 */
const PX_PER_MIN = 1

const KIND_STYLE: Record<PlacedItem['kind'], string> = {
  fixed: 'border-blue-500 bg-blue-100 dark:bg-blue-900/60',
  flexible: 'border-emerald-500 bg-emerald-100 dark:bg-emerald-900/60',
  free: 'border-purple-500 bg-purple-100 dark:bg-purple-900/60',
  routine: 'border-amber-500 bg-amber-100 dark:bg-amber-900/60',
  break: 'border-gray-400 bg-gray-100 dark:bg-gray-700/70',
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

const LOAD_BADGE: Record<LoadCategory, { label: string; className: string }> = {
  low: { label: '低', className: 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-100' },
  medium: {
    label: '中',
    className: 'bg-yellow-200 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100',
  },
  high: { label: '高', className: 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-100' },
}

function LoadBadge({ load }: { load: ResolvedLoad }) {
  const badge = LOAD_BADGE[classifyLoad(unitLoad(load))]
  return <span className={`rounded px-1 text-[10px] leading-none ${badge.className}`}>{badge.label}</span>
}

function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function DayGrid({
  timeline,
  window,
  categories,
}: {
  timeline: PlacedItem[]
  window: Interval
  categories: ReadonlyMap<Id, Category>
}) {
  const height = (window.end - window.start) * PX_PER_MIN
  const firstHour = Math.ceil(window.start / 60)
  const lastHour = Math.floor(window.end / 60)
  const hours: number[] = []
  for (let h = firstHour; h <= lastHour; h++) hours.push(h)

  return (
    <div className="relative overflow-hidden rounded border border-gray-200 dark:border-gray-700" style={{ height }}>
      {/* 時刻の目盛り */}
      {hours.map((h) => {
        const top = (h * 60 - window.start) * PX_PER_MIN
        return (
          <div key={h} className="absolute left-0 right-0 border-t border-gray-100 dark:border-gray-800" style={{ top }}>
            <span className="absolute -top-2 left-1 text-[10px] text-gray-400">{String(h).padStart(2, '0')}:00</span>
          </div>
        )
      })}
      {/* 予定ブロック */}
      <div className="absolute bottom-0 left-12 right-1 top-0">
        {timeline.map((item) => {
          const top = (item.interval.start - window.start) * PX_PER_MIN
          const blockHeight = Math.max((item.interval.end - item.interval.start) * PX_PER_MIN, 16)
          const color = topLevelColor(item.categoryId, categories)
          // §8.4: 固定予定は実線枠、それ以外は破線枠。色は最上位カテゴリ基準。
          const borderStyle: CSSProperties = color
            ? { borderColor: color, borderStyle: item.kind === 'fixed' ? 'solid' : 'dashed', borderWidth: 1 }
            : {}
          return (
            <div
              key={item.id}
              className={`absolute left-0 right-0 overflow-hidden rounded border-l-4 px-1.5 py-0.5 text-xs ${KIND_STYLE[item.kind]}`}
              style={{ top, height: blockHeight, ...borderStyle }}
            >
              <div className="flex items-center gap-1">
                <span className="font-mono text-[10px] text-gray-600 dark:text-gray-300">
                  {minutesToTime(item.interval.start)}
                </span>
                <span className="text-[10px] text-gray-500">{KIND_LABEL[item.kind]}</span>
                {item.load && <LoadBadge load={item.load} />}
              </div>
              {item.label && <div className="truncate font-medium">{item.label}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const timeInputClass =
  'rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800'
const fieldLabel = 'block text-xs font-medium text-gray-600 dark:text-gray-300'

export function DaySchedule() {
  const definitions = useAppStore((s) => s.definitions)
  const categories = useAppStore((s) => s.categories)
  const [date, setDate] = useState(todayIso())
  const [startTime, setStartTime] = useState('07:00')
  const [endTime, setEndTime] = useState('23:00')
  const [result, setResult] = useState<ScheduleDayResult | null>(null)
  const [window, setWindow] = useState<Interval>({ start: 420, end: 1380 })

  const categoryMap = useMemo(
    () => new Map<Id, Category>(categories.map((c) => [c.id, c])),
    [categories],
  )

  function run() {
    const w: Interval = { start: timeToMinutes(startTime), end: timeToMinutes(endTime) }
    if (w.end <= w.start) return
    setWindow(w)
    setResult(scheduleDay({ date, definitions, categories: categoryMap, window: w }))
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div>
          <label className={fieldLabel}>対象日</label>
          <input type="date" className={timeInputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className={fieldLabel}>稼働開始</label>
          <input type="time" className={timeInputClass} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div>
          <label className={fieldLabel}>稼働終了</label>
          <input type="time" className={timeInputClass} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
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
            <DayGrid timeline={result.timeline} window={window} categories={categoryMap} />
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
