/**
 * 日次振り返り（§19）。対象日を選び、自動集計(§19.1)と主観評価の入力を行う。
 * 自動集計は当日の自動スケジュール結果と実績記録(§14)から算出する
 * （`domain/analytics/dailySummary.ts`）。主観評価は DailyReflection として永続化する。
 *
 * §14.3 未完了申告: その日の予定ごとに 完了/未完了 を後から申告できる（実績 records を更新）。
 * 未完了の柔軟タスクは「翌日以降へ回す」で開始可能日を翌日に設定し、当日以降の
 * 自動配置から今日ぶんを外す。「今日の後ろへずらす」「優先度の低い予定と交換」は
 * 手動配置・交換ロジックが未整備のため今後（[[project-status]]）。
 */

import { useEffect, useMemo, useState } from 'react'
import type { ActivityRecord, Category, DailyReflection, FlexibleTask, Id } from '../../domain/types'
import { recordId } from '../../domain/types'
import type { PlacedItem } from '../../domain/scheduler/placement'
import { minutesToTime } from '../../domain/scheduler/intervals'
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
  const saveRecord = useAppStore((s) => s.saveRecord)
  const saveDefinition = useAppStore((s) => s.saveDefinition)
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

  const { summary, plans } = useMemo(() => {
    const categoryMap = new Map<Id, Category>(categories.map((c) => [c.id, c]))
    const { timeline } = scheduleDay({ date, definitions, categories: categoryMap, window: WINDOW })
    const dayRecords = records.filter((r) => r.date === date)
    // 休憩を除く「その日の予定」を §14.3 の申告対象にする。
    const plans = timeline.filter((i) => i.kind !== 'break')
    return { summary: computeDailySummary(timeline, dayRecords), plans }
  }, [date, definitions, categories, records])

  // 対象日の実績を配置ブロックIDで引く。
  const recordByItem = useMemo(() => {
    const map = new Map<string, ActivityRecord>()
    for (const r of records) if (r.date === date) map.set(r.itemId, r)
    return map
  }, [records, date])

  /** その日の予定に完了/未完了を申告する（§14.2/§14.3）。 */
  function declare(item: PlacedItem, status: 'completed' | 'incomplete') {
    const now = nowLocalIso()
    const existingRec = recordByItem.get(item.id)
    void saveRecord({
      id: recordId(date, item.id),
      date,
      itemId: item.id,
      sourceId: item.sourceId ?? item.id,
      status,
      actualStart: existingRec?.actualStart,
      // 完了申告で実終了が無ければ予定終了時刻を用いる（§14.2）。
      actualEnd:
        status === 'completed'
          ? (existingRec?.actualEnd ?? `${date}T${minutesToTime(item.interval.end)}`)
          : existingRec?.actualEnd,
      createdAt: existingRec?.createdAt ?? now,
      updatedAt: now,
    })
  }

  /** 未完了の柔軟タスクを翌日以降へ回す（開始可能日を翌日に設定, §14.3）。 */
  function deferToTomorrow(item: PlacedItem) {
    const def = item.sourceId
      ? definitions.find((d): d is FlexibleTask => d.id === item.sourceId && d.kind === 'flexible')
      : undefined
    if (!def) return
    const next = new Date(`${date}T00:00`)
    next.setDate(next.getDate() + 1)
    const p = (n: number) => String(n).padStart(2, '0')
    const tomorrow = `${next.getFullYear()}-${p(next.getMonth() + 1)}-${p(next.getDate())}`
    void saveDefinition({ ...def, startableFrom: tomorrow, updatedAt: nowLocalIso() })
    declare(item, 'incomplete')
  }

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

      {/* その日の予定 — 完了/未完了の申告（§14.2/§14.3） */}
      <div className={cardClass}>
        <h3 className="mb-3 text-sm font-semibold">その日の予定（完了・未完了の申告）</h3>
        {plans.length === 0 ? (
          <p className="text-xs text-gray-400">配置された予定がありません。</p>
        ) : (
          <ul className="space-y-1">
            {plans.map((item) => {
              const status = recordByItem.get(item.id)?.status
              const isFlexible = item.kind === 'flexible'
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-2 rounded border border-gray-200 px-2 py-1 text-sm dark:border-gray-700"
                >
                  <span className="font-mono text-[11px] text-gray-500">
                    {minutesToTime(item.interval.start)}
                  </span>
                  <span className="flex-1 truncate font-medium">{item.label ?? item.kind}</span>
                  {status === 'completed' && (
                    <span className="rounded bg-emerald-100 px-1.5 text-[10px] text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">
                      完了
                    </span>
                  )}
                  {status === 'incomplete' && (
                    <span className="rounded bg-red-100 px-1.5 text-[10px] text-red-700 dark:bg-red-900 dark:text-red-200">
                      未完了
                    </span>
                  )}
                  {status !== 'completed' && (
                    <button
                      className="text-xs text-emerald-600 hover:underline"
                      onClick={() => declare(item, 'completed')}
                    >
                      完了
                    </button>
                  )}
                  {status !== 'incomplete' && (
                    <button
                      className="text-xs text-red-600 hover:underline"
                      onClick={() => declare(item, 'incomplete')}
                    >
                      未完了
                    </button>
                  )}
                  {isFlexible && (
                    <button
                      className="text-xs text-blue-600 hover:underline"
                      onClick={() => deferToTomorrow(item)}
                      title="開始可能日を翌日にして今日の配置から外す"
                    >
                      翌日以降へ
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
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
