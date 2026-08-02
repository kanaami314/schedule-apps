/**
 * 生活ルーチンの作成フォーム（§7）。
 * 種類（食事/入浴/睡眠/家事）と、1日あたりの各回（実行可能時間帯＋必要時間）を設定する。
 */

import { useState } from 'react'
import type { LifeRoutine, RoutineType } from '../../domain/types'
import { useAppStore } from '../../store/appStore'
import { newId, nowLocalIso } from '../../lib/ids'

const inputClass =
  'rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800'
const labelClass = 'block text-xs font-medium text-gray-600 dark:text-gray-300'

const ROUTINE_TYPES: { value: RoutineType; label: string }[] = [
  { value: 'meal', label: '食事' },
  { value: 'bath', label: '入浴' },
  { value: 'sleep', label: '睡眠' },
  { value: 'chore', label: '家事' },
]

interface OccurrenceInput {
  start: string
  end: string
  requiredTime: number
}

const defaultOccurrence = (): OccurrenceInput => ({ start: '12:00', end: '14:00', requiredTime: 30 })

export function RoutineForm() {
  const saveDefinition = useAppStore((s) => s.saveDefinition)
  const [routineType, setRoutineType] = useState<RoutineType>('meal')
  const [name, setName] = useState('')
  const [occurrences, setOccurrences] = useState<OccurrenceInput[]>([defaultOccurrence()])

  const canSubmit = occurrences.every((o) => o.start < o.end && o.requiredTime > 0)

  function updateOcc(index: number, patch: Partial<OccurrenceInput>) {
    setOccurrences((prev) => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)))
  }

  async function submit() {
    const now = nowLocalIso()
    const routine: LifeRoutine = {
      id: newId(),
      kind: 'routine',
      createdAt: now,
      updatedAt: now,
      routineType,
      name: name.trim() || undefined,
      occurrences: occurrences.map((o) => ({
        allowedRange: { start: o.start, end: o.end },
        requiredTime: o.requiredTime,
      })),
    }
    await saveDefinition(routine)
    setName('')
    setOccurrences([defaultOccurrence()])
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <h3 className="mb-3 font-semibold">生活ルーチンを追加</h3>
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="flex-1">
            <label className={labelClass}>種類</label>
            <select
              className={`${inputClass} w-full`}
              value={routineType}
              onChange={(e) => setRoutineType(e.target.value as RoutineType)}
            >
              {ROUTINE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className={labelClass}>名称（任意）</label>
            <input className={`${inputClass} w-full`} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>

        <div>
          <p className={`${labelClass} mb-1`}>各回（実行可能時間帯・必要時間）</p>
          <div className="space-y-1">
            {occurrences.map((occ, i) => (
              <div key={i} className="flex items-center gap-1">
                <input
                  type="time"
                  className={inputClass}
                  value={occ.start}
                  onChange={(e) => updateOcc(i, { start: e.target.value })}
                />
                <span className="text-xs text-gray-400">–</span>
                <input
                  type="time"
                  className={inputClass}
                  value={occ.end}
                  onChange={(e) => updateOcc(i, { end: e.target.value })}
                />
                <input
                  type="number"
                  min={1}
                  className={`${inputClass} w-16`}
                  value={occ.requiredTime}
                  onChange={(e) => updateOcc(i, { requiredTime: Number(e.target.value) })}
                />
                <span className="text-xs text-gray-400">分</span>
                {occurrences.length > 1 && (
                  <button
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => setOccurrences((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            className="mt-1 text-xs text-blue-600 hover:underline"
            onClick={() => setOccurrences((prev) => [...prev, defaultOccurrence()])}
          >
            ＋ 回を追加
          </button>
        </div>

        <button
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          disabled={!canSubmit}
          onClick={submit}
        >
          追加
        </button>
      </div>
    </div>
  )
}
