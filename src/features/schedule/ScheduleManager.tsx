/**
 * 最小の予定管理UI（作成フォーム＋一覧）。
 * 固定予定・柔軟なタスクの作成と削除ができ、Dexie に永続化される。
 * 自動スケジューリング表示は今後追加する。
 */

import { useState } from 'react'
import type { FixedEvent, FlexibleTask, Priority, ScheduleDefinition } from '../../domain/types'
import { useAppStore } from '../../store/appStore'
import { newId, nowLocalIso } from '../../lib/ids'
import { LoadFields } from './LoadFields'
import { DEFAULT_LOAD, toLoadProfile, type LoadValue } from './loadValue'
import { CategorySelect } from './CategorySelect'
import { RoutineForm } from './RoutineForm'

const inputClass =
  'w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800'
const labelClass = 'block text-xs font-medium text-gray-600 dark:text-gray-300'
const cardClass = 'rounded-lg border border-gray-200 p-4 dark:border-gray-700'
const buttonClass =
  'rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40'

function FixedEventForm() {
  const saveDefinition = useAppStore((s) => s.saveDefinition)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('10:00')
  const [categoryId, setCategoryId] = useState('')
  const [load, setLoad] = useState<LoadValue>(DEFAULT_LOAD)

  const canSubmit = name.trim() !== '' && date !== '' && start !== '' && end !== '' && start < end

  async function submit() {
    const now = nowLocalIso()
    const event: FixedEvent = {
      id: newId(),
      kind: 'fixed',
      createdAt: now,
      updatedAt: now,
      name: name.trim(),
      date,
      time: { start, end },
      categoryId: categoryId || undefined,
      load: toLoadProfile(load),
    }
    await saveDefinition(event)
    setName('')
    setLoad(DEFAULT_LOAD)
  }

  return (
    <div className={cardClass}>
      <h3 className="mb-3 font-semibold">固定予定を追加</h3>
      <div className="space-y-2">
        <div>
          <label className={labelClass}>予定名</label>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>日付</label>
          <input
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className={labelClass}>開始</label>
            <input
              type="time"
              className={inputClass}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className={labelClass}>終了</label>
            <input
              type="time"
              className={inputClass}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        </div>
        <CategorySelect value={categoryId} onChange={setCategoryId} />
        <LoadFields value={load} onChange={setLoad} />
        <button className={buttonClass} disabled={!canSubmit} onClick={submit}>
          追加
        </button>
      </div>
    </div>
  )
}

function FlexibleTaskForm() {
  const saveDefinition = useAppStore((s) => s.saveDefinition)
  const [name, setName] = useState('')
  const [deadline, setDeadline] = useState('')
  const [duration, setDuration] = useState(60)
  const [priority, setPriority] = useState<Priority>('medium')
  const [categoryId, setCategoryId] = useState('')
  const [load, setLoad] = useState<LoadValue>(DEFAULT_LOAD)

  const canSubmit = name.trim() !== '' && deadline !== '' && duration > 0

  async function submit() {
    const now = nowLocalIso()
    const task: FlexibleTask = {
      id: newId(),
      kind: 'flexible',
      createdAt: now,
      updatedAt: now,
      name: name.trim(),
      deadline,
      estimatedDuration: duration,
      priority,
      categoryId: categoryId || undefined,
      load: toLoadProfile(load),
    }
    await saveDefinition(task)
    setName('')
    setLoad(DEFAULT_LOAD)
  }

  return (
    <div className={cardClass}>
      <h3 className="mb-3 font-semibold">柔軟なタスクを追加</h3>
      <div className="space-y-2">
        <div>
          <label className={labelClass}>タスク名</label>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>期限</label>
          <input
            type="datetime-local"
            className={inputClass}
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className={labelClass}>推定所要時間（分）</label>
            <input
              type="number"
              min={1}
              className={inputClass}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </div>
          <div className="flex-1">
            <label className={labelClass}>優先度</label>
            <select
              className={inputClass}
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </div>
        </div>
        <CategorySelect value={categoryId} onChange={setCategoryId} />
        <LoadFields value={load} onChange={setLoad} />
        <button className={buttonClass} disabled={!canSubmit} onClick={submit}>
          追加
        </button>
      </div>
    </div>
  )
}

function describe(def: ScheduleDefinition): string {
  switch (def.kind) {
    case 'fixed':
      return `${def.date} ${def.time.start}–${def.time.end}`
    case 'flexible':
      return `期限 ${def.deadline.replace('T', ' ')} / ${def.estimatedDuration}分`
    case 'free':
      return `${def.duration}分`
    case 'routine':
      return `${def.routineType} / ${def.occurrences.length}回`
  }
}

const KIND_LABEL: Record<ScheduleDefinition['kind'], string> = {
  fixed: '固定予定',
  flexible: '柔軟なタスク',
  free: '自由活動',
  routine: '生活ルーチン',
}

function DefinitionList() {
  const definitions = useAppStore((s) => s.definitions)
  const removeDefinition = useAppStore((s) => s.removeDefinition)

  if (definitions.length === 0) {
    return <p className="text-sm text-gray-500">まだ予定がありません。左のフォームから追加してください。</p>
  }

  const sorted = [...definitions].sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  return (
    <ul className="space-y-2">
      {sorted.map((def) => (
        <li
          key={def.id}
          className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 text-sm dark:border-gray-700"
        >
          <div>
            <span className="mr-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {KIND_LABEL[def.kind]}
            </span>
            <span className="font-medium">{def.name ?? '(無名)'}</span>
            <span className="ml-2 text-gray-500">{describe(def)}</span>
          </div>
          <button
            className="text-xs text-red-600 hover:underline"
            onClick={() => removeDefinition(def.id)}
          >
            削除
          </button>
        </li>
      ))}
    </ul>
  )
}

export function ScheduleManager() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <FixedEventForm />
        <FlexibleTaskForm />
        <RoutineForm />
      </div>
      <div>
        <h3 className="mb-3 font-semibold">登録済みの予定</h3>
        <DefinitionList />
      </div>
    </div>
  )
}
