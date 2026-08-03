/**
 * 日次振り返り（§19）。対象日を選び、自動集計(§19.1)と主観評価の入力を行う。
 * 自動集計は当日の自動スケジュール結果と実績記録(§14)から算出する
 * （`domain/analytics/dailySummary.ts`）。主観評価は DailyReflection として永続化する。
 */

import { useEffect, useMemo, useState } from 'react'
import type { Category, DailyReflection, Id } from '../../domain/types'
import { scheduleDay } from '../../domain/scheduler/scheduleDay'
import { computeDailySummary } from '../../domain/analytics/dailySummary'
import { nowLocalIso } from '../../lib/ids'
import { useAppStore } from '../../store/appStore'

const inputClass =
  'w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800'
const labelClass = 'block text-xs font-medium text-gray-600 dark:text-gray-300'
const cardClass = 'rounded-lg border border-gray-200 p-4 dark:border-gray-700'

/** 対象日の既定稼働窓（07:00–23:00）。DaySchedule と揃える。 */
const WINDOW = { start: 7 * 60, end: 23 * 60 }

function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 分を「Xh Ym」表記に。 */
function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}分`
  return m === 0 ? `${h}時間` : `${h}時間${m}分`
}

/** 主観評価セレクトの選択肢定義。 */
const REFLECTION_FIELDS = [
  { key: 'focus', label: '集中状態', options: [['good', '集中できた'], ['normal', '普通'], ['bad', '集中できなかった']] },
  { key: 'mentalFatigue', label: '精神的疲労', options: [['low', '低い'], ['normal', '普通'], ['high', '高い']] },
  { key: 'physicalFatigue', label: '身体的疲労', options: [['low', '低い'], ['normal', '普通'], ['high', '高い']] },
  { key: 'mood', label: '気分', options: [['good', '良い'], ['normal', '普通'], ['bad', '悪い']] },
  { key: 'satisfaction', label: '達成感', options: [['satisfied', '満足'], ['normal', '普通'], ['unsatisfied', '不満']] },
] as const

type ReflectionField = (typeof REFLECTION_FIELDS)[number]['key']

/** 集計値を並べる小さな統計タイル。 */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-200 p-2 dark:border-gray-700">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  )
}

export function Reflection() {
  const definitions = useAppStore((s) => s.definitions)
  const categories = useAppStore((s) => s.categories)
  const records = useAppStore((s) => s.records)
  const reflections = useAppStore((s) => s.reflections)
  const saveReflection = useAppStore((s) => s.saveReflection)
  const minimalMode = useAppStore((s) => s.minimalMode)

  // 最低限モードは 集中状態・気分・自由記述 のみ（§23.5）。
  const fields = minimalMode
    ? REFLECTION_FIELDS.filter((f) => f.key === 'focus' || f.key === 'mood')
    : REFLECTION_FIELDS

  const [date, setDate] = useState(todayIso())
  const [draft, setDraft] = useState<Partial<Record<ReflectionField, string>>>({})
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState(false)

  const categoryName = useMemo(
    () => new Map<Id, string>(categories.map((c) => [c.id, c.name])),
    [categories],
  )

  // 対象日の既存振り返りをフォームへ読み込む。
  const existing = useMemo(() => reflections.find((r) => r.id === date), [reflections, date])
  useEffect(() => {
    setDraft({
      focus: existing?.focus,
      mentalFatigue: existing?.mentalFatigue,
      physicalFatigue: existing?.physicalFatigue,
      mood: existing?.mood,
      satisfaction: existing?.satisfaction,
    })
    setNote(existing?.note ?? '')
    setSaved(false)
  }, [existing])

  const summary = useMemo(() => {
    const categoryMap = new Map<Id, Category>(categories.map((c) => [c.id, c]))
    const { timeline } = scheduleDay({ date, definitions, categories: categoryMap, window: WINDOW })
    const dayRecords = records.filter((r) => r.date === date)
    return computeDailySummary(timeline, dayRecords)
  }, [date, definitions, categories, records])

  async function save() {
    const now = nowLocalIso()
    const reflection: DailyReflection = {
      id: date,
      date,
      focus: draft.focus as DailyReflection['focus'],
      mentalFatigue: draft.mentalFatigue as DailyReflection['mentalFatigue'],
      physicalFatigue: draft.physicalFatigue as DailyReflection['physicalFatigue'],
      mood: draft.mood as DailyReflection['mood'],
      satisfaction: draft.satisfaction as DailyReflection['satisfaction'],
      note: note.trim() || undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await saveReflection(reflection)
    setSaved(true)
  }

  const ratio =
    summary.onTimeStartRatio === null ? '—' : `${Math.round(summary.onTimeStartRatio * 100)}%`

  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>対象日</label>
        <input type="date" className={`${inputClass} max-w-xs`} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {/* 自動集計（§19.1） */}
      <div className={cardClass}>
        <h3 className="mb-3 text-sm font-semibold">自動集計（§19.1）</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="予定時間合計" value={fmtMinutes(summary.plannedMinutes)} />
          <Stat label="実績時間合計" value={fmtMinutes(summary.actualMinutes)} />
          <Stat label="完了数" value={`${summary.completedCount}`} />
          <Stat label="未完了数" value={`${summary.incompleteCount}`} />
          <Stat label="休憩時間" value={fmtMinutes(summary.breakMinutes)} />
          <Stat label="自由活動合計" value={fmtMinutes(summary.freeActivityMinutes)} />
          <Stat label="高負荷予定合計" value={fmtMinutes(summary.highLoadMinutes)} />
          <Stat label="予定どおり開始" value={ratio} />
        </div>
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-gray-500">カテゴリ別実績時間</p>
          {summary.byCategory.length === 0 ? (
            <p className="text-xs text-gray-400">実績がありません。</p>
          ) : (
            <ul className="space-y-0.5 text-sm">
              {summary.byCategory.map((c) => (
                <li key={c.categoryId} className="flex justify-between">
                  <span>{categoryName.get(c.categoryId) ?? c.categoryId}</span>
                  <span className="text-gray-500">{fmtMinutes(c.minutes)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 主観評価（§19、任意入力） */}
      <div className={cardClass}>
        <h3 className="mb-3 text-sm font-semibold">振り返り（任意）</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map((field) => (
            <div key={field.key}>
              <label className={labelClass}>{field.label}</label>
              <select
                className={inputClass}
                value={draft[field.key] ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  setDraft((d) => ({ ...d, [field.key]: v || undefined }))
                }}
              >
                <option value="">（未入力）</option>
                {field.options.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="mt-2">
          <label className={labelClass}>自由記述</label>
          <textarea
            className={`${inputClass} min-h-16`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            onClick={save}
          >
            保存
          </button>
          {saved && <span className="text-xs text-emerald-600 dark:text-emerald-400">保存しました</span>}
        </div>
      </div>
    </div>
  )
}
