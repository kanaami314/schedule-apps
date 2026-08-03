/**
 * 最小の予定管理UI（作成・編集フォーム＋一覧）。
 * 固定予定・柔軟なタスクの作成・編集・削除ができ、Dexie に永続化される。
 * 一覧の「編集」で対象を選ぶと該当フォームに読み込まれ、更新できる。
 */

import { useEffect, useState } from 'react'
import type { FixedEvent, FlexibleTask, Priority, ScheduleDefinition } from '../../domain/types'
import { useAppStore } from '../../store/appStore'
import { newId, nowLocalIso } from '../../lib/ids'
import { LoadFields } from './LoadFields'
import { DEFAULT_LOAD, fromLoadProfile, toLoadProfile, type LoadValue } from './loadValue'
import { CategorySelect } from './CategorySelect'
import { RoutineForm } from './RoutineForm'

const cancelButtonClass =
  'rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'

const inputClass =
  'w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800'
const labelClass = 'block text-xs font-medium text-gray-600 dark:text-gray-300'
const cardClass = 'rounded-lg border border-gray-200 p-4 dark:border-gray-700'
const buttonClass =
  'rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40'

interface EditFormProps {
  /** 編集対象。この種別に一致するときだけフォームに読み込む。 */
  editing: ScheduleDefinition | null
  /** 送信・キャンセルで編集を終える。 */
  onDone: () => void
}

function FixedEventForm({ editing, onDone }: EditFormProps) {
  const saveDefinition = useAppStore((s) => s.saveDefinition)
  const target = editing?.kind === 'fixed' ? editing : null
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('10:00')
  const [categoryId, setCategoryId] = useState('')
  const [load, setLoad] = useState<LoadValue>(DEFAULT_LOAD)

  // 編集対象が変わったらフォームへ読み込む。
  useEffect(() => {
    if (!target) return
    setName(target.name)
    setDate(target.date)
    setStart(target.time.start)
    setEnd(target.time.end)
    setCategoryId(target.categoryId ?? '')
    setLoad(fromLoadProfile(target.load))
  }, [target])

  const canSubmit = name.trim() !== '' && date !== '' && start !== '' && end !== '' && start < end

  function reset() {
    setName('')
    setDate('')
    setStart('09:00')
    setEnd('10:00')
    setCategoryId('')
    setLoad(DEFAULT_LOAD)
  }

  async function submit() {
    const now = nowLocalIso()
    const event: FixedEvent = {
      ...(target ?? {}),
      id: target?.id ?? newId(),
      kind: 'fixed',
      createdAt: target?.createdAt ?? now,
      updatedAt: now,
      name: name.trim(),
      date,
      time: { start, end },
      categoryId: categoryId || undefined,
      load: toLoadProfile(load),
    }
    await saveDefinition(event)
    reset()
    onDone()
  }

  function cancel() {
    reset()
    onDone()
  }

  return (
    <div className={cardClass}>
      <h3 className="mb-3 font-semibold">{target ? '固定予定を編集' : '固定予定を追加'}</h3>
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
        <div className="flex gap-2">
          <button className={buttonClass} disabled={!canSubmit} onClick={submit}>
            {target ? '更新' : '追加'}
          </button>
          {target && (
            <button className={cancelButtonClass} onClick={cancel}>
              キャンセル
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function FlexibleTaskForm({ editing, onDone }: EditFormProps) {
  const saveDefinition = useAppStore((s) => s.saveDefinition)
  const target = editing?.kind === 'flexible' ? editing : null
  const [name, setName] = useState('')
  const [deadline, setDeadline] = useState('')
  const [duration, setDuration] = useState(60)
  const [priority, setPriority] = useState<Priority>('medium')
  const [categoryId, setCategoryId] = useState('')
  const [load, setLoad] = useState<LoadValue>(DEFAULT_LOAD)

  useEffect(() => {
    if (!target) return
    setName(target.name)
    setDeadline(target.deadline)
    setDuration(target.estimatedDuration)
    setPriority(target.priority ?? 'medium')
    setCategoryId(target.categoryId ?? '')
    setLoad(fromLoadProfile(target.load))
  }, [target])

  const canSubmit = name.trim() !== '' && deadline !== '' && duration > 0

  function reset() {
    setName('')
    setDeadline('')
    setDuration(60)
    setPriority('medium')
    setCategoryId('')
    setLoad(DEFAULT_LOAD)
  }

  async function submit() {
    const now = nowLocalIso()
    const task: FlexibleTask = {
      ...(target ?? {}),
      id: target?.id ?? newId(),
      kind: 'flexible',
      createdAt: target?.createdAt ?? now,
      updatedAt: now,
      name: name.trim(),
      deadline,
      estimatedDuration: duration,
      priority,
      categoryId: categoryId || undefined,
      load: toLoadProfile(load),
    }
    await saveDefinition(task)
    reset()
    onDone()
  }

  function cancel() {
    reset()
    onDone()
  }

  return (
    <div className={cardClass}>
      <h3 className="mb-3 font-semibold">{target ? '柔軟なタスクを編集' : '柔軟なタスクを追加'}</h3>
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
        <div className="flex gap-2">
          <button className={buttonClass} disabled={!canSubmit} onClick={submit}>
            {target ? '更新' : '追加'}
          </button>
          {target && (
            <button className={cancelButtonClass} onClick={cancel}>
              キャンセル
            </button>
          )}
        </div>
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

/** 一覧から編集できる種別（インラインフォームがあるもの）。 */
const EDITABLE_KINDS: ReadonlySet<ScheduleDefinition['kind']> = new Set(['fixed', 'flexible'])

function DefinitionList({
  editingId,
  onEdit,
}: {
  editingId: string | null
  onEdit: (def: ScheduleDefinition) => void
}) {
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
          className={`flex items-center justify-between rounded border px-3 py-2 text-sm dark:border-gray-700 ${
            def.id === editingId
              ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/40'
              : 'border-gray-200'
          }`}
        >
          <div>
            <span className="mr-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {KIND_LABEL[def.kind]}
            </span>
            <span className="font-medium">{def.name ?? '(無名)'}</span>
            <span className="ml-2 text-gray-500">{describe(def)}</span>
          </div>
          <div className="flex shrink-0 gap-3">
            {EDITABLE_KINDS.has(def.kind) && (
              <button className="text-xs text-blue-600 hover:underline" onClick={() => onEdit(def)}>
                編集
              </button>
            )}
            <button
              className="text-xs text-red-600 hover:underline"
              onClick={() => removeDefinition(def.id)}
            >
              削除
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function ScheduleManager() {
  const [editing, setEditing] = useState<ScheduleDefinition | null>(null)

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <FixedEventForm editing={editing} onDone={() => setEditing(null)} />
        <FlexibleTaskForm editing={editing} onDone={() => setEditing(null)} />
        <RoutineForm />
      </div>
      <div>
        <h3 className="mb-3 font-semibold">登録済みの予定</h3>
        <DefinitionList editingId={editing?.id ?? null} onEdit={setEditing} />
      </div>
    </div>
  )
}
