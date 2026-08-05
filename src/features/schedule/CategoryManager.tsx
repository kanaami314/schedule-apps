/**
 * カテゴリ管理UI（一覧＋作成）。名前・親カテゴリ・色・負荷初期値を設定できる（§8）。
 */

import { useEffect, useMemo, useState } from 'react'
import type { Category, Id } from '../../domain/types'
import { useAppStore } from '../../store/appStore'
import { newId } from '../../lib/ids'
import { categoryChain } from '../../domain/load/inheritance'
import { LoadFields } from './LoadFields'
import { DEFAULT_LOAD, fromLoadProfile, toLoadProfile, type LoadValue } from './loadValue'
import { validateTargetChange, type TargetField } from '../../domain/analytics/targets'

const inputClass =
  'w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800'
const labelClass = 'block text-xs font-medium text-gray-600 dark:text-gray-300'
const cancelButtonClass =
  'rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'

/**
 * カテゴリの作成・編集フォーム（§8）。
 * 編集時は id・並び順・目標時間を維持して upsert するため、そのカテゴリを適用していた
 * 予定は同じ categoryId を参照し続け、色・負荷初期値の変更が自動的に反映される（剝がさない）。
 */
function CategoryForm({ editing, onDone }: { editing: Category | null; onDone: () => void }) {
  const categories = useAppStore((s) => s.categories)
  const saveCategory = useAppStore((s) => s.saveCategory)
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [color, setColor] = useState('#6b7280')
  const [load, setLoad] = useState<LoadValue>(DEFAULT_LOAD)

  // 編集対象が変わったらフォームへ読み込む。
  useEffect(() => {
    if (!editing) return
    setName(editing.name)
    setParentId(editing.parentId ?? '')
    setColor(editing.color ?? '#6b7280')
    setLoad(fromLoadProfile(editing.loadDefaults))
  }, [editing])

  const categoryMap = useMemo(() => new Map<Id, Category>(categories.map((c) => [c.id, c])), [categories])

  // 親候補: 循環を防ぐため、編集中は自分自身とその子孫を除外する。
  const parentOptions = useMemo(() => {
    const sorted = [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    if (!editing) return sorted
    return sorted.filter(
      (c) => c.id !== editing.id && !categoryChain(c.id, categoryMap).some((a) => a.id === editing.id),
    )
  }, [categories, editing, categoryMap])

  const canSubmit = name.trim() !== ''

  function reset() {
    setName('')
    setParentId('')
    setColor('#6b7280')
    setLoad(DEFAULT_LOAD)
  }

  async function submit() {
    const category: Category = {
      ...(editing ?? {}),
      id: editing?.id ?? newId(),
      name: name.trim(),
      parentId: parentId || undefined,
      color: parentId ? undefined : color, // 色は最上位カテゴリのみ（§8.4）
      order: editing?.order ?? categories.length,
      loadDefaults: toLoadProfile(load),
    }
    await saveCategory(category)
    reset()
    onDone()
  }

  function cancel() {
    reset()
    onDone()
  }

  return (
    <div className="space-y-2">
      <div>
        <label className={labelClass}>カテゴリ名</label>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className={labelClass}>親カテゴリ（任意）</label>
          <select className={inputClass} value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">（最上位）</option>
            {parentOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {parentId === '' && (
          <div>
            <label className={labelClass}>色</label>
            <input
              type="color"
              className="h-8 w-12 rounded border border-gray-300 dark:border-gray-600"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </div>
        )}
      </div>
      <LoadFields value={load} onChange={setLoad} />
      <div className="flex gap-2">
        <button
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          disabled={!canSubmit}
          onClick={submit}
        >
          {editing ? '更新' : 'カテゴリを追加'}
        </button>
        {editing && (
          <button className={cancelButtonClass} onClick={cancel}>
            キャンセル
          </button>
        )}
      </div>
    </div>
  )
}

/** 分 → 時間（表示用）。未設定は空文字。 */
const minutesToHours = (m: number | undefined): string => (m == null ? '' : String(m / 60))

/** カテゴリ1件の目標時間入力（§20.6）。週・月の目標を時間で編集する。 */
function TargetInput({ category, field, label }: { category: Category; field: TargetField; label: string }) {
  const categories = useAppStore((s) => s.categories)
  const saveCategory = useAppStore((s) => s.saveCategory)
  const [error, setError] = useState<string | null>(null)

  function change(value: string) {
    const hours = Number(value)
    const minutes =
      value === '' || !Number.isFinite(hours) || hours <= 0 ? undefined : Math.round(hours * 60)
    const result = validateTargetChange(categories, category.id, field, minutes)
    if (!result.ok) {
      setError(result.reason ?? '設定できません')
      return
    }
    setError(null)
    void saveCategory({ ...category, [field]: minutes })
  }

  return (
    <label className="flex items-center gap-1 text-[11px] text-gray-500">
      {label}
      <input
        type="number"
        min={0}
        step={0.5}
        className={`w-14 rounded border px-1 py-0.5 text-xs dark:bg-gray-800 ${
          error ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
        }`}
        defaultValue={minutesToHours(category[field])}
        title={error ?? '時間単位（h）'}
        onBlur={(e) => change(e.target.value)}
      />
      h
    </label>
  )
}

function CategoryList({
  editingId,
  onEdit,
}: {
  editingId: string | null
  onEdit: (category: Category) => void
}) {
  const categories = useAppStore((s) => s.categories)
  const removeCategory = useAppStore((s) => s.removeCategory)
  const nameById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  const sorted = useMemo(
    () => [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [categories],
  )

  if (sorted.length === 0) return <p className="text-sm text-gray-500">カテゴリがありません。</p>

  return (
    <ul className="space-y-1">
      {sorted.map((c) => (
        <li
          key={c.id}
          className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded border px-2 py-1 text-sm dark:border-gray-700 ${
            c.id === editingId ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/40' : 'border-gray-200'
          }`}
        >
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: c.color ?? '#9ca3af' }}
          />
          <span className="font-medium">{c.name}</span>
          {c.parentId && (
            <span className="text-xs text-gray-400">/ {nameById.get(c.parentId) ?? '?'}</span>
          )}
          <span className="ml-auto flex items-center gap-2">
            {/* 目標時間（§20.6）。週・月を時間で設定。 */}
            <TargetInput category={c} field="weeklyTargetMinutes" label="週" />
            <TargetInput category={c} field="monthlyTargetMinutes" label="月" />
            <button className="text-xs text-blue-600 hover:underline" onClick={() => onEdit(c)}>
              編集
            </button>
            <button className="text-xs text-red-600 hover:underline" onClick={() => removeCategory(c.id)}>
              ×
            </button>
          </span>
        </li>
      ))}
    </ul>
  )
}

export function CategoryManager() {
  const [editing, setEditing] = useState<Category | null>(null)

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <h3 className="mb-3 font-semibold">{editing ? 'カテゴリを編集' : 'カテゴリを追加'}</h3>
        <CategoryForm editing={editing} onDone={() => setEditing(null)} />
      </div>
      <div>
        <h3 className="mb-3 font-semibold">登録済みカテゴリ</h3>
        <CategoryList editingId={editing?.id ?? null} onEdit={setEditing} />
      </div>
    </div>
  )
}
