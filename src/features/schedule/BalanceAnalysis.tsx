/**
 * バランス分析（§20）。集計期間・表示モードを選び、最上位カテゴリ別の
 * 予定/実績時間を割合つきの横棒で表示する（20.1–20.3, 20.5）。
 * 目標時間(20.6)・負荷分析(20.7)・自由活動分析(20.8)・分母の選択肢(20.4)・
 * 子カテゴリのドリルダウンは今後対応（[[project-status]]）。
 */

import { useMemo, useState } from 'react'
import type { Category, Id } from '../../domain/types'
import { computeBalance, type BalancePeriod } from '../../domain/analytics/balance'
import { useAppStore } from '../../store/appStore'

const PERIODS: { value: BalancePeriod; label: string }[] = [
  { value: 'today', label: '今日' },
  { value: 'thisWeek', label: '今週' },
  { value: 'lastWeek', label: '先週' },
  { value: 'thisMonth', label: '今月' },
]

type Mode = 'planned' | 'actual' | 'compare'
const MODES: { value: Mode; label: string }[] = [
  { value: 'planned', label: '予定時間' },
  { value: 'actual', label: '実績時間' },
  { value: 'compare', label: '予定と実績の比較' },
]

const tabClass = (active: boolean) =>
  `rounded px-3 py-1 text-sm font-medium ${
    active
      ? 'bg-blue-600 text-white'
      : 'border border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300'
  }`

function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}分`
  return m === 0 ? `${h}時間` : `${h}時間${m}分`
}

export function BalanceAnalysis() {
  const definitions = useAppStore((s) => s.definitions)
  const categories = useAppStore((s) => s.categories)
  const records = useAppStore((s) => s.records)

  const [period, setPeriod] = useState<BalancePeriod>('thisWeek')
  const [mode, setMode] = useState<Mode>('planned')

  const categoryMeta = useMemo(
    () => new Map<Id, Category>(categories.map((c) => [c.id, c])),
    [categories],
  )

  const result = useMemo(
    () => computeBalance(period, new Date(), definitions, categoryMeta, records),
    [period, definitions, categoryMeta, records],
  )

  const total = mode === 'actual' ? result.totalActual : result.totalPlanned
  const value = (c: { plannedMinutes: number; actualMinutes: number }) =>
    mode === 'actual' ? c.actualMinutes : c.plannedMinutes

  const rows = useMemo(() => {
    const list = [...result.categories]
    if (mode === 'actual') list.sort((a, b) => b.actualMinutes - a.actualMinutes)
    return list
  }, [result, mode])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {PERIODS.map((p) => (
          <button key={p.value} className={tabClass(period === p.value)} onClick={() => setPeriod(p.value)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {MODES.map((m) => (
          <button key={m.value} className={tabClass(mode === m.value)} onClick={() => setMode(m.value)}>
            {m.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">この期間に集計対象の予定がありません。</p>
      ) : mode === 'compare' ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-gray-700">
              <th className="py-1">カテゴリ</th>
              <th className="py-1 text-right">予定</th>
              <th className="py-1 text-right">実績</th>
              <th className="py-1 text-right">差分</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const meta = categoryMeta.get(c.categoryId)
              const diff = c.actualMinutes - c.plannedMinutes
              return (
                <tr key={c.categoryId || 'none'} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-1">{meta?.name ?? '未分類'}</td>
                  <td className="py-1 text-right text-gray-600 dark:text-gray-300">{fmtMinutes(c.plannedMinutes)}</td>
                  <td className="py-1 text-right text-gray-600 dark:text-gray-300">{fmtMinutes(c.actualMinutes)}</td>
                  <td className={`py-1 text-right ${diff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {diff >= 0 ? '+' : '−'}
                    {fmtMinutes(Math.abs(diff))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => {
            const meta = categoryMeta.get(c.categoryId)
            const v = value(c)
            const pct = total > 0 ? (v / total) * 100 : 0
            return (
              <div key={c.categoryId || 'none'}>
                <div className="mb-0.5 flex justify-between text-sm">
                  <span>{meta?.name ?? '未分類'}</span>
                  <span className="text-gray-500">
                    {fmtMinutes(v)}・{Math.round(pct)}%
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
                  <div
                    className="h-full rounded"
                    style={{ width: `${pct}%`, backgroundColor: meta?.color ?? '#6b7280' }}
                  />
                </div>
              </div>
            )
          })}
          <p className="pt-1 text-xs text-gray-400">合計: {fmtMinutes(total)}</p>
        </div>
      )}
    </div>
  )
}
