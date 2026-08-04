/**
 * 自由活動の作成・編集フォーム（§6 ＋ 設計会話の8項目, 2026-08-04 確定）。
 * 活動名・カテゴリ・最短/希望実行時間・希望頻度・実行可能曜日/時間帯・分割可能か・
 * 自動配置するか、および回復/消耗効果（負荷計算 C-5 用）を登録する。
 * 負荷への反映は `domain/load/freeActivity.ts` が担う。自動配置は scheduleDay（§3 の4番目）。
 * 希望頻度（週N回）の厳密遵守は複数日対応で完成し、現状は値として保持する。
 * `editing` に自由活動が渡されたら編集モード（id・createdAt を維持して更新）。
 */

import { useEffect, useState } from 'react'
import type {
  DrainEffect,
  DrainEffectSetting,
  FreeActivity,
  Intensity,
  RecoveryEffect,
  RecoveryEffectSetting,
  ScheduleDefinition,
  Weekday,
} from '../../domain/types'
import { useAppStore } from '../../store/appStore'
import { newId, nowLocalIso } from '../../lib/ids'
import { CategorySelect } from './CategorySelect'

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const

const inputClass =
  'w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800'
const labelClass = 'block text-xs font-medium text-gray-600 dark:text-gray-300'
const cardClass = 'rounded-lg border border-gray-200 p-4 dark:border-gray-700'
const buttonClass =
  'rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40'

/** 回復効果の表示名（§6.1）。 */
const RECOVERY_LABELS: Record<RecoveryEffect, string> = {
  relax: 'リラックスできる',
  refresh: '気分転換になる',
  stressRelief: 'ストレスが軽減する',
  achievement: '達成感が得られる',
  motivation: 'やる気が上がる',
}

/** 消耗効果の表示名（§6.1）。 */
const DRAIN_LABELS: Record<DrainEffect, string> = {
  focus: '集中力を消耗する',
  mental: '精神的に疲れる',
  physical: '身体的に疲れる',
}

const RECOVERY_EFFECTS = Object.keys(RECOVERY_LABELS) as RecoveryEffect[]
const DRAIN_EFFECTS = Object.keys(DRAIN_LABELS) as DrainEffect[]

/** 効果の on/off と強度（§6.2）。 */
interface EffectState {
  on: boolean
  intensity: Intensity
}

function initEffects<K extends string>(keys: readonly K[]): Record<K, EffectState> {
  return Object.fromEntries(keys.map((k) => [k, { on: false, intensity: 2 as Intensity }])) as Record<
    K,
    EffectState
  >
}

/** 保存済みの効果設定配列を、フォーム状態（キーごとの on/強度）へ変換する。 */
function effectsFromSettings<K extends string>(
  keys: readonly K[],
  settings: readonly { effect: K; intensity: Intensity }[] | undefined,
): Record<K, EffectState> {
  const base = initEffects(keys)
  for (const s of settings ?? []) base[s.effect] = { on: true, intensity: s.intensity }
  return base
}

/** 効果1件の行（チェックボックス＋強度）。 */
function EffectRow({
  label,
  state,
  onChange,
}: {
  label: string
  state: EffectState
  onChange: (next: EffectState) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="flex flex-1 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={state.on}
          onChange={(e) => onChange({ ...state, on: e.target.checked })}
        />
        <span>{label}</span>
      </label>
      <select
        className="rounded border border-gray-300 px-1 py-0.5 text-xs disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800"
        value={state.intensity}
        disabled={!state.on}
        onChange={(e) => onChange({ ...state, intensity: Number(e.target.value) as Intensity })}
      >
        <option value={1}>弱い</option>
        <option value={2}>普通</option>
        <option value={3}>強い</option>
      </select>
    </div>
  )
}

interface FreeActivityFormProps {
  editing: ScheduleDefinition | null
  onDone: () => void
}

export function FreeActivityForm({ editing, onDone }: FreeActivityFormProps) {
  const saveDefinition = useAppStore((s) => s.saveDefinition)
  const target = editing?.kind === 'free' ? editing : null
  const [name, setName] = useState('')
  const [duration, setDuration] = useState(60)
  const [minDuration, setMinDuration] = useState(30)
  const [splittable, setSplittable] = useState(false)
  const [freqCount, setFreqCount] = useState(0)
  const [freqUnit, setFreqUnit] = useState<'week' | 'month'>('week')
  const [allowedWeekdays, setAllowedWeekdays] = useState<Weekday[]>([])
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [autoPlace, setAutoPlace] = useState(true)
  const [categoryId, setCategoryId] = useState('')
  const [place, setPlace] = useState('')
  const [recovery, setRecovery] = useState(() => initEffects(RECOVERY_EFFECTS))
  const [drain, setDrain] = useState(() => initEffects(DRAIN_EFFECTS))

  // 編集対象が変わったらフォームへ読み込む。
  useEffect(() => {
    if (!target) return
    setName(target.name)
    setDuration(target.duration)
    setMinDuration(target.minDuration ?? 30)
    setSplittable(target.splittable ?? false)
    setFreqCount(target.frequency?.count ?? 0)
    setFreqUnit(target.frequency?.unit ?? 'week')
    setAllowedWeekdays(target.allowedWeekdays ? [...target.allowedWeekdays] : [])
    setRangeStart(target.allowedTimeRanges?.[0]?.start ?? '')
    setRangeEnd(target.allowedTimeRanges?.[0]?.end ?? '')
    setAutoPlace(target.autoPlace ?? true)
    setCategoryId(target.categoryId ?? '')
    setPlace(target.place ?? '')
    setRecovery(effectsFromSettings(RECOVERY_EFFECTS, target.recoveryEffects))
    setDrain(effectsFromSettings(DRAIN_EFFECTS, target.drainEffects))
  }, [target])

  const canSubmit = name.trim() !== '' && duration > 0

  function reset() {
    setName('')
    setDuration(60)
    setMinDuration(30)
    setSplittable(false)
    setFreqCount(0)
    setFreqUnit('week')
    setAllowedWeekdays([])
    setRangeStart('')
    setRangeEnd('')
    setAutoPlace(true)
    setCategoryId('')
    setPlace('')
    setRecovery(initEffects(RECOVERY_EFFECTS))
    setDrain(initEffects(DRAIN_EFFECTS))
  }

  function toggleWeekday(day: Weekday) {
    setAllowedWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    )
  }

  async function submit() {
    const now = nowLocalIso()
    const recoveryEffects: RecoveryEffectSetting[] = RECOVERY_EFFECTS.filter(
      (e) => recovery[e].on,
    ).map((e) => ({ effect: e, intensity: recovery[e].intensity }))
    const drainEffects: DrainEffectSetting[] = DRAIN_EFFECTS.filter((e) => drain[e].on).map((e) => ({
      effect: e,
      intensity: drain[e].intensity,
    }))
    const hasRange = rangeStart !== '' && rangeEnd !== '' && rangeStart < rangeEnd
    const activity: FreeActivity = {
      ...(target ?? {}),
      id: target?.id ?? newId(),
      kind: 'free',
      createdAt: target?.createdAt ?? now,
      updatedAt: now,
      name: name.trim(),
      duration,
      minDuration: minDuration > 0 ? minDuration : undefined,
      splittable,
      frequency: freqCount > 0 ? { count: freqCount, unit: freqUnit } : undefined,
      allowedWeekdays: allowedWeekdays.length > 0 ? allowedWeekdays : undefined,
      allowedTimeRanges: hasRange ? [{ start: rangeStart, end: rangeEnd }] : undefined,
      autoPlace,
      categoryId: categoryId || undefined,
      place: place.trim() || undefined,
      recoveryEffects: recoveryEffects.length > 0 ? recoveryEffects : undefined,
      drainEffects: drainEffects.length > 0 ? drainEffects : undefined,
    }
    await saveDefinition(activity)
    reset()
    onDone()
  }

  function cancel() {
    reset()
    onDone()
  }

  return (
    <div className={cardClass}>
      <h3 className="mb-3 font-semibold">{target ? '自由活動を編集' : '自由活動を追加'}</h3>
      <div className="space-y-2">
        <div>
          <label className={labelClass}>活動名</label>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className={labelClass}>最短実行時間（分）</label>
            <input
              type="number"
              min={1}
              className={inputClass}
              value={minDuration}
              onChange={(e) => setMinDuration(Number(e.target.value))}
            />
          </div>
          <div className="flex-1">
            <label className={labelClass}>希望実行時間（分）</label>
            <input
              type="number"
              min={1}
              className={inputClass}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </div>
        </div>
        <CategorySelect value={categoryId} onChange={setCategoryId} />
        <div className="flex gap-2">
          <div className="flex-1">
            <label className={labelClass}>場所（任意）</label>
            <input className={inputClass} value={place} onChange={(e) => setPlace(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>希望頻度</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                className="w-14 rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
                value={freqCount}
                onChange={(e) => setFreqCount(Number(e.target.value))}
              />
              <span className="text-xs text-gray-400">回 /</span>
              <select
                className="rounded border border-gray-300 px-1 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
                value={freqUnit}
                onChange={(e) => setFreqUnit(e.target.value as 'week' | 'month')}
              >
                <option value="week">週</option>
                <option value="month">月</option>
              </select>
            </div>
          </div>
        </div>
        <div>
          <label className={labelClass}>実行可能な曜日（任意・未指定なら毎日）</label>
          <div className="flex gap-1">
            {WEEKDAY_LABELS.map((label, i) => {
              const day = i as Weekday
              const on = allowedWeekdays.includes(day)
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleWeekday(day)}
                  className={`h-7 w-7 rounded text-xs font-medium ${
                    on
                      ? 'bg-blue-600 text-white'
                      : 'border border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className={labelClass}>実行可能な時間帯（任意）</label>
            <div className="flex items-center gap-1">
              <input
                type="time"
                className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
              />
              <span className="text-xs text-gray-400">〜</span>
              <input
                type="time"
                className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 pb-1 text-sm">
            <input type="checkbox" checked={splittable} onChange={(e) => setSplittable(e.target.checked)} />
            分割可能
          </label>
          <label className="flex items-center gap-2 pb-1 text-sm">
            <input type="checkbox" checked={autoPlace} onChange={(e) => setAutoPlace(e.target.checked)} />
            自動配置する
          </label>
        </div>

        <div>
          <p className={`${labelClass} mb-1`}>回復効果</p>
          <div className="space-y-1">
            {RECOVERY_EFFECTS.map((e) => (
              <EffectRow
                key={e}
                label={RECOVERY_LABELS[e]}
                state={recovery[e]}
                onChange={(next) => setRecovery((s) => ({ ...s, [e]: next }))}
              />
            ))}
          </div>
        </div>

        <div>
          <p className={`${labelClass} mb-1`}>消耗効果</p>
          <div className="space-y-1">
            {DRAIN_EFFECTS.map((e) => (
              <EffectRow
                key={e}
                label={DRAIN_LABELS[e]}
                state={drain[e]}
                onChange={(next) => setDrain((s) => ({ ...s, [e]: next }))}
              />
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button className={buttonClass} disabled={!canSubmit} onClick={submit}>
            {target ? '更新' : '追加'}
          </button>
          {target && (
            <button
              className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              onClick={cancel}
            >
              キャンセル
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
