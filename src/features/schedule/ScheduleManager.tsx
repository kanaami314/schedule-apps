/**
 * 最小の予定管理UI（作成・編集フォーム＋一覧）。
 * 固定予定・柔軟なタスクの作成・編集・削除ができ、Dexie に永続化される。
 * 一覧の「編集」で対象を選ぶと該当フォームに読み込まれ、更新できる。
 */

import { useEffect, useState } from 'react'
import type {
  DeadlineStrictness,
  FixedEvent,
  Fixity,
  FlexibleTask,
  Id,
  Priority,
  RepeatRule,
  ScheduleDefinition,
  Weekday,
} from '../../domain/types'
import { useAppStore } from '../../store/appStore'
import { newId, nowLocalIso } from '../../lib/ids'
import { LoadFields } from './LoadFields'
import { DEFAULT_LOAD, fromLoadProfile, toLoadProfile, type LoadValue } from './loadValue'
import { CategorySelect } from './CategorySelect'
import { RoutineForm } from './RoutineForm'
import { FreeActivityForm } from './FreeActivityForm'
import { TagSelect } from './TagManager'

const cancelButtonClass =
  'rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'

/** 繰り返しの種類（§4.3）。UI 選択用。 */
type RepeatKind = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly'

const REPEAT_OPTIONS: { value: RepeatKind; label: string }[] = [
  { value: 'none', label: '繰り返しなし' },
  { value: 'daily', label: '毎日' },
  { value: 'weekly', label: '毎週' },
  { value: 'biweekly', label: '隔週' },
  { value: 'monthly', label: '毎月' },
]

/** 曜日ラベル（0=日〜6=土）。 */
const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const

/** 曜日選択ボタン列（毎週・隔週で使用）。 */
function WeekdayPicker({
  selected,
  onToggle,
}: {
  selected: Weekday[]
  onToggle: (day: Weekday) => void
}) {
  return (
    <div className="flex gap-1">
      {WEEKDAY_LABELS.map((label, i) => {
        const day = i as Weekday
        const on = selected.includes(day)
        return (
          <button
            key={day}
            type="button"
            onClick={() => onToggle(day)}
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
  )
}

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
  const minimalMode = useAppStore((s) => s.minimalMode)
  const target = editing?.kind === 'fixed' ? editing : null
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('10:00')
  const [categoryId, setCategoryId] = useState('')
  const [load, setLoad] = useState<LoadValue>(DEFAULT_LOAD)
  const [repeatKind, setRepeatKind] = useState<RepeatKind>('none')
  const [weekdays, setWeekdays] = useState<Weekday[]>([])
  const [travelMin, setTravelMin] = useState(0)
  const [prepMin, setPrepMin] = useState(0)
  const [bufferMin, setBufferMin] = useState(0)
  const [place, setPlace] = useState('')
  const [onlineInfo, setOnlineInfo] = useState('')
  const [notes, setNotes] = useState('')
  const [tagIds, setTagIds] = useState<Id[]>([])
  const [fixity, setFixity] = useState<Fixity>('strict')
  const [attendanceRequired, setAttendanceRequired] = useState(false)

  // 編集対象が変わったらフォームへ読み込む。
  useEffect(() => {
    if (!target) return
    setName(target.name)
    setDate(target.date)
    setStart(target.time.start)
    setEnd(target.time.end)
    setCategoryId(target.categoryId ?? '')
    setLoad(fromLoadProfile(target.load))
    const r = target.repeat
    setRepeatKind(r?.kind ?? 'none')
    setWeekdays(r && (r.kind === 'weekly' || r.kind === 'biweekly') ? [...r.weekdays] : [])
    setTravelMin(target.travelTime?.duration ?? 0)
    setPrepMin(target.prepTime?.duration ?? 0)
    setBufferMin(target.bufferTime?.duration ?? 0)
    setPlace(target.place ?? '')
    setOnlineInfo(target.onlineInfo ?? '')
    setNotes(target.notes ?? '')
    setTagIds(target.tagIds ?? [])
    setFixity(target.fixity ?? 'strict')
    setAttendanceRequired(target.attendanceRequired ?? false)
  }, [target])

  const needsWeekdays = repeatKind === 'weekly' || repeatKind === 'biweekly'
  const canSubmit =
    name.trim() !== '' &&
    date !== '' &&
    start !== '' &&
    end !== '' &&
    start < end &&
    (!needsWeekdays || weekdays.length > 0)

  function reset() {
    setName('')
    setDate('')
    setStart('09:00')
    setEnd('10:00')
    setCategoryId('')
    setLoad(DEFAULT_LOAD)
    setRepeatKind('none')
    setWeekdays([])
    setTravelMin(0)
    setPrepMin(0)
    setBufferMin(0)
    setPlace('')
    setOnlineInfo('')
    setNotes('')
    setTagIds([])
    setFixity('strict')
    setAttendanceRequired(false)
  }

  function toggleWeekday(day: Weekday) {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    )
  }

  /** フォーム状態から繰り返し規則を組み立てる（§4.3）。 */
  function buildRepeat(): RepeatRule | undefined {
    switch (repeatKind) {
      case 'none':
        return undefined
      case 'daily':
        return { kind: 'daily' }
      case 'weekly':
        return { kind: 'weekly', weekdays }
      case 'biweekly':
        return { kind: 'biweekly', weekdays, anchorDate: date }
      case 'monthly':
        return { kind: 'monthly', dayOfMonth: Number(date.slice(8, 10)) }
    }
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
      repeat: buildRepeat(),
      // 付随時間（§4.4）。フォーム入力は兼用不可（占有）として扱う。
      travelTime: travelMin > 0 ? { duration: travelMin } : undefined,
      prepTime: prepMin > 0 ? { duration: prepMin } : undefined,
      bufferTime: bufferMin > 0 ? { duration: bufferMin } : undefined,
      place: place.trim() || undefined,
      onlineInfo: onlineInfo.trim() || undefined,
      notes: notes.trim() || undefined,
      tagIds: tagIds.length > 0 ? tagIds : undefined,
      fixity,
      attendanceRequired,
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
        <div>
          <label className={labelClass}>繰り返し</label>
          <select
            className={inputClass}
            value={repeatKind}
            onChange={(e) => setRepeatKind(e.target.value as RepeatKind)}
          >
            {REPEAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {needsWeekdays && (
            <div className="mt-2">
              <WeekdayPicker selected={weekdays} onToggle={toggleWeekday} />
            </div>
          )}
        </div>
        {!minimalMode && (
          <div>
            <label className={labelClass}>付随時間（分）</label>
            <div className="flex gap-2">
              <div className="flex-1">
                <span className="text-[10px] text-gray-400">移動</span>
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={travelMin}
                  onChange={(e) => setTravelMin(Number(e.target.value))}
                />
              </div>
              <div className="flex-1">
                <span className="text-[10px] text-gray-400">準備</span>
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={prepMin}
                  onChange={(e) => setPrepMin(Number(e.target.value))}
                />
              </div>
              <div className="flex-1">
                <span className="text-[10px] text-gray-400">終了後</span>
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={bufferMin}
                  onChange={(e) => setBufferMin(Number(e.target.value))}
                />
              </div>
            </div>
          </div>
        )}
        <CategorySelect value={categoryId} onChange={setCategoryId} />
        {!minimalMode && (
          <>
            <div>
              <label className={labelClass}>場所（任意）</label>
              <input className={inputClass} value={place} onChange={(e) => setPlace(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>オンライン情報（任意）</label>
              <input
                className={inputClass}
                placeholder="会議URLなど"
                value={onlineInfo}
                onChange={(e) => setOnlineInfo(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className={labelClass}>固定度</label>
                <select
                  className={inputClass}
                  value={fixity}
                  onChange={(e) => setFixity(e.target.value as Fixity)}
                >
                  <option value="strict">動かさない</option>
                  <option value="normal">なるべく動かさない</option>
                  <option value="flexible">調整可</option>
                </select>
              </div>
              <label className="flex flex-1 items-center gap-2 pb-1 text-sm">
                <input
                  type="checkbox"
                  checked={attendanceRequired}
                  onChange={(e) => setAttendanceRequired(e.target.checked)}
                />
                参加が必要
              </label>
            </div>
          </>
        )}
        <div>
          <label className={labelClass}>メモ（任意）</label>
          <textarea
            className={`${inputClass} min-h-14`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        {!minimalMode && <TagSelect value={tagIds} onChange={setTagIds} />}
        {!minimalMode && <LoadFields value={load} onChange={setLoad} />}
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
  const minimalMode = useAppStore((s) => s.minimalMode)
  const projects = useAppStore((s) => s.projects)
  const target = editing?.kind === 'flexible' ? editing : null
  const [name, setName] = useState('')
  const [deadline, setDeadline] = useState('')
  const [duration, setDuration] = useState(60)
  const [priority, setPriority] = useState<Priority>('medium')
  const [categoryId, setCategoryId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [load, setLoad] = useState<LoadValue>(DEFAULT_LOAD)
  const [splittable, setSplittable] = useState(false)
  const [minChunk, setMinChunk] = useState(30)
  const [startableFrom, setStartableFrom] = useState('')
  const [strictness, setStrictness] = useState<DeadlineStrictness>('preferred')
  const [notes, setNotes] = useState('')
  const [tagIds, setTagIds] = useState<Id[]>([])
  const [allowedWeekdays, setAllowedWeekdays] = useState<Weekday[]>([])
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [preferredChunk, setPreferredChunk] = useState(0)

  useEffect(() => {
    if (!target) return
    setName(target.name)
    setDeadline(target.deadline)
    setDuration(target.estimatedDuration)
    setPriority(target.priority ?? 'medium')
    setCategoryId(target.categoryId ?? '')
    setProjectId(target.projectId ?? '')
    setLoad(fromLoadProfile(target.load))
    setSplittable(target.splittable ?? false)
    setMinChunk(target.minChunk ?? 30)
    setStartableFrom(target.startableFrom ?? '')
    setStrictness(target.deadlineStrictness ?? 'preferred')
    setNotes(target.notes ?? '')
    setTagIds(target.tagIds ?? [])
    setAllowedWeekdays(target.allowedWeekdays ? [...target.allowedWeekdays] : [])
    setRangeStart(target.allowedTimeRanges?.[0]?.start ?? '')
    setRangeEnd(target.allowedTimeRanges?.[0]?.end ?? '')
    setPreferredChunk(target.preferredChunk ?? 0)
  }, [target])

  // 分割可能なら最短作業時間が条件付き必須（§5.1）。
  const canSubmit =
    name.trim() !== '' && deadline !== '' && duration > 0 && (!splittable || minChunk > 0)

  function reset() {
    setName('')
    setDeadline('')
    setDuration(60)
    setPriority('medium')
    setCategoryId('')
    setProjectId('')
    setLoad(DEFAULT_LOAD)
    setSplittable(false)
    setMinChunk(30)
    setStartableFrom('')
    setStrictness('preferred')
    setNotes('')
    setTagIds([])
    setAllowedWeekdays([])
    setRangeStart('')
    setRangeEnd('')
    setPreferredChunk(0)
  }

  function toggleAllowedWeekday(day: Weekday) {
    setAllowedWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    )
  }

  async function submit() {
    const now = nowLocalIso()
    const hasRange = rangeStart !== '' && rangeEnd !== '' && rangeStart < rangeEnd
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
      projectId: projectId || undefined,
      load: toLoadProfile(load),
      splittable,
      minChunk: splittable ? minChunk : undefined,
      startableFrom: startableFrom || undefined,
      deadlineStrictness: strictness,
      notes: notes.trim() || undefined,
      tagIds: tagIds.length > 0 ? tagIds : undefined,
      allowedWeekdays: allowedWeekdays.length > 0 ? allowedWeekdays : undefined,
      allowedTimeRanges: hasRange ? [{ start: rangeStart, end: rangeEnd }] : undefined,
      preferredChunk: splittable && preferredChunk > 0 ? preferredChunk : undefined,
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
        {projects.length > 0 && (
          <div>
            <label className={labelClass}>プロジェクト</label>
            <select
              className={inputClass}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">（なし）</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {/* 分割可能か＋最短作業時間（§5.1）。最低限モードでも対象。 */}
        <div className="flex items-end gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={splittable}
              onChange={(e) => setSplittable(e.target.checked)}
            />
            分割可能
          </label>
          {splittable && (
            <div className="flex-1">
              <label className={labelClass}>最短作業時間（分）</label>
              <input
                type="number"
                min={1}
                className={inputClass}
                value={minChunk}
                onChange={(e) => setMinChunk(Number(e.target.value))}
              />
            </div>
          )}
          {splittable && (
            <div className="flex-1">
              <label className={labelClass}>希望作業時間（分・任意）</label>
              <input
                type="number"
                min={0}
                className={inputClass}
                value={preferredChunk}
                onChange={(e) => setPreferredChunk(Number(e.target.value))}
              />
            </div>
          )}
        </div>
        {!minimalMode && (
          <>
            <div>
              <label className={labelClass}>実行可能曜日（任意・未指定なら毎日）</label>
              <WeekdayPicker selected={allowedWeekdays} onToggle={toggleAllowedWeekday} />
            </div>
            <div>
              <label className={labelClass}>実行可能時間帯（任意）</label>
              <div className="flex items-center gap-1">
                <input
                  type="time"
                  className={inputClass}
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                />
                <span className="text-xs text-gray-400">〜</span>
                <input
                  type="time"
                  className={inputClass}
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                />
              </div>
            </div>
          </>
        )}
        {!minimalMode && (
          <div className="flex gap-2">
            <div className="flex-1">
              <label className={labelClass}>開始可能日（任意）</label>
              <input
                type="date"
                className={inputClass}
                value={startableFrom}
                onChange={(e) => setStartableFrom(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className={labelClass}>期限の厳しさ</label>
              <select
                className={inputClass}
                value={strictness}
                onChange={(e) => setStrictness(e.target.value as DeadlineStrictness)}
              >
                <option value="strict">厳守</option>
                <option value="preferred">できれば守る</option>
                <option value="loose">目安</option>
              </select>
            </div>
          </div>
        )}
        <div>
          <label className={labelClass}>メモ（任意）</label>
          <textarea
            className={`${inputClass} min-h-14`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        {!minimalMode && <TagSelect value={tagIds} onChange={setTagIds} />}
        {!minimalMode && <LoadFields value={load} onChange={setLoad} />}
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

/** 繰り返し規則を短い日本語で表す。 */
function repeatLabel(repeat: RepeatRule | undefined): string {
  if (!repeat || repeat.kind === 'none') return ''
  const days = (ws: Weekday[]) => ws.map((w) => WEEKDAY_LABELS[w]).join('')
  switch (repeat.kind) {
    case 'daily':
      return ' · 毎日'
    case 'weekly':
      return ` · 毎週(${days(repeat.weekdays)})`
    case 'biweekly':
      return ` · 隔週(${days(repeat.weekdays)})`
    case 'monthly':
      return ` · 毎月${repeat.dayOfMonth}日`
  }
}

function describe(def: ScheduleDefinition): string {
  switch (def.kind) {
    case 'fixed':
      return `${def.date} ${def.time.start}–${def.time.end}${repeatLabel(def.repeat)}`
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

/** 一覧から編集できる種別（インラインフォームがあるもの）。全種別対応。 */
const EDITABLE_KINDS: ReadonlySet<ScheduleDefinition['kind']> = new Set([
  'fixed',
  'flexible',
  'free',
  'routine',
])

function DefinitionList({
  editingId,
  onEdit,
}: {
  editingId: string | null
  onEdit: (def: ScheduleDefinition) => void
}) {
  const definitions = useAppStore((s) => s.definitions)
  const removeDefinition = useAppStore((s) => s.removeDefinition)
  const minimalMode = useAppStore((s) => s.minimalMode)

  // 最低限モードでは固定予定・柔軟なタスクのみ表示（§23.1、データは保持）。
  const visible = minimalMode
    ? definitions.filter((d) => d.kind === 'fixed' || d.kind === 'flexible')
    : definitions

  if (visible.length === 0) {
    return <p className="text-sm text-gray-500">まだ予定がありません。左のフォームから追加してください。</p>
  }

  const sorted = [...visible].sort((a, b) => a.createdAt.localeCompare(b.createdAt))

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
  const minimalMode = useAppStore((s) => s.minimalMode)

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <FixedEventForm editing={editing} onDone={() => setEditing(null)} />
        <FlexibleTaskForm editing={editing} onDone={() => setEditing(null)} />
        {/* 最低限モードでは自由活動・生活ルーチンの入力を隠す（§23.1）。 */}
        {!minimalMode && <FreeActivityForm editing={editing} onDone={() => setEditing(null)} />}
        {!minimalMode && <RoutineForm editing={editing} onDone={() => setEditing(null)} />}
      </div>
      <div>
        <h3 className="mb-3 font-semibold">登録済みの予定</h3>
        <DefinitionList editingId={editing?.id ?? null} onEdit={setEditing} />
      </div>
    </div>
  )
}
