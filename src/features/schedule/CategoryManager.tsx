/**
 * カテゴリ管理UI（一覧＋作成）。名前・親カテゴリ・色・負荷初期値を設定できる（§8）。
 */

import { useMemo, useState } from 'react'
import type { Category } from '../../domain/types'
import { useAppStore } from '../../store/appStore'
import { newId } from '../../lib/ids'
import { LoadFields } from './LoadFields'
import { DEFAULT_LOAD, toLoadProfile, type LoadValue } from './loadValue'

const inputClass =
  'w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800'
const labelClass = 'block text-xs font-medium text-gray-600 dark:text-gray-300'

function CreateCategoryForm() {
  const categories = useAppStore((s) => s.categories)
  const saveCategory = useAppStore((s) => s.saveCategory)
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [color, setColor] = useState('#6b7280')
  const [load, setLoad] = useState<LoadValue>(DEFAULT_LOAD)

  const sortedParents = useMemo(
    () => [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [categories],
  )
  const canSubmit = name.trim() !== ''

  async function submit() {
    const category: Category = {
      id: newId(),
      name: name.trim(),
      parentId: parentId || undefined,
      color: parentId ? undefined : color, // 色は最上位カテゴリのみ（§8.4）
      order: categories.length,
      loadDefaults: toLoadProfile(load),
    }
    await saveCategory(category)
    setName('')
    setLoad(DEFAULT_LOAD)
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
            {sortedParents.map((c) => (
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
      <button
        className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        disabled={!canSubmit}
        onClick={submit}
      >
        カテゴリを追加
      </button>
    </div>
  )
}

function CategoryList() {
  const categories = useAppStore((s) => s.categories)
  const removeCategory = useAppStore((s) => s.removeCategory)
  const nameById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  const sorted = useMemo(
    () => [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [categories],
  )

  if (sorted.length === 0) return <p className="text-sm text-gray-500">カテゴリがありません。</p>

  return (
    <ul className="flex flex-wrap gap-2">
      {sorted.map((c) => (
        <li
          key={c.id}
          className="flex items-center gap-1.5 rounded border border-gray-200 px-2 py-1 text-sm dark:border-gray-700"
        >
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: c.color ?? '#9ca3af' }}
          />
          <span>{c.name}</span>
          {c.parentId && (
            <span className="text-xs text-gray-400">/ {nameById.get(c.parentId) ?? '?'}</span>
          )}
          <button className="ml-1 text-xs text-red-600 hover:underline" onClick={() => removeCategory(c.id)}>
            ×
          </button>
        </li>
      ))}
    </ul>
  )
}

export function CategoryManager() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <h3 className="mb-3 font-semibold">カテゴリを追加</h3>
        <CreateCategoryForm />
      </div>
      <div>
        <h3 className="mb-3 font-semibold">登録済みカテゴリ</h3>
        <CategoryList />
      </div>
    </div>
  )
}
