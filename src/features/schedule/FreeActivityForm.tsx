/**
 * 自由活動の作成・編集フォーム（§6）。
 * 活動名・活動時間・カテゴリ・場所と、回復効果/消耗効果および各効果の強度を登録する。
 * 負荷への反映ロジックは `domain/load/freeActivity.ts`（実装済）が担う。
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
} from '../../domain/types'
import { useAppStore } from '../../store/appStore'
import { newId, nowLocalIso } from '../../lib/ids'
import { CategorySelect } from './CategorySelect'

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
  const [categoryId, setCategoryId] = useState('')
  const [place, setPlace] = useState('')
  const [recovery, setRecovery] = useState(() => initEffects(RECOVERY_EFFECTS))
  const [drain, setDrain] = useState(() => initEffects(DRAIN_EFFECTS))

  // 編集対象が変わったらフォームへ読み込む。
  useEffect(() => {
    if (!target) return
    setName(target.name)
    setDuration(target.duration)
    setCategoryId(target.categoryId ?? '')
    setPlace(target.place ?? '')
    setRecovery(effectsFromSettings(RECOVERY_EFFECTS, target.recoveryEffects))
    setDrain(effectsFromSettings(DRAIN_EFFECTS, target.drainEffects))
  }, [target])

  const canSubmit = name.trim() !== '' && duration > 0

  function reset() {
    setName('')
    setDuration(60)
    setCategoryId('')
    setPlace('')
    setRecovery(initEffects(RECOVERY_EFFECTS))
    setDrain(initEffects(DRAIN_EFFECTS))
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
    const activity: FreeActivity = {
      ...(target ?? {}),
      id: target?.id ?? newId(),
      kind: 'free',
      createdAt: target?.createdAt ?? now,
      updatedAt: now,
      name: name.trim(),
      duration,
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
            <label className={labelClass}>活動時間（分）</label>
            <input
              type="number"
              min={1}
              className={inputClass}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </div>
          <div className="flex-1">
            <label className={labelClass}>場所（任意）</label>
            <input className={inputClass} value={place} onChange={(e) => setPlace(e.target.value)} />
          </div>
        </div>
        <CategorySelect value={categoryId} onChange={setCategoryId} />

        <div>
          <p className={`${labelClass} mb-1`}>回復効果（§6.1）</p>
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
          <p className={`${labelClass} mb-1`}>消耗効果（§6.1）</p>
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
