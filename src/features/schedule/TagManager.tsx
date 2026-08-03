/**
 * タグ（§8.2）。予定・タスクに複数付与できる自由分類。
 * TagManager: タグの作成・一覧・削除。TagSelect: フォームでの付与用トグル。
 */

import { useState } from 'react'
import type { Id, Tag } from '../../domain/types'
import { useAppStore } from '../../store/appStore'
import { newId } from '../../lib/ids'

const inputClass =
  'rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800'

/** タグ付与のトグル（フォーム用）。選択中のタグ ID 配列を編集する。 */
export function TagSelect({ value, onChange }: { value: Id[]; onChange: (ids: Id[]) => void }) {
  const tags = useAppStore((s) => s.tags)
  if (tags.length === 0) return null

  function toggle(id: Id) {
    onChange(value.includes(id) ? value.filter((t) => t !== id) : [...value, id])
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">タグ</label>
      <div className="flex flex-wrap gap-1">
        {tags.map((t) => {
          const on = value.includes(t.id)
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(t.id)}
              className={`rounded-full border px-2 py-0.5 text-xs ${
                on
                  ? 'border-transparent text-white'
                  : 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300'
              }`}
              style={on ? { backgroundColor: t.color ?? '#6b7280' } : undefined}
            >
              {t.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function TagManager() {
  const tags = useAppStore((s) => s.tags)
  const saveTag = useAppStore((s) => s.saveTag)
  const removeTag = useAppStore((s) => s.removeTag)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6b7280')

  function add() {
    const trimmed = name.trim()
    if (!trimmed) return
    const tag: Tag = { id: newId(), name: trimmed, color }
    void saveTag(tag)
    setName('')
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <h3 className="mb-3 font-semibold">タグ</h3>
      <div className="mb-2 flex items-center gap-2">
        <input
          className={`${inputClass} flex-1`}
          placeholder="タグ名"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <input
          type="color"
          className="h-8 w-10 rounded border border-gray-300 dark:border-gray-600"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
        <button
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          disabled={name.trim() === ''}
          onClick={add}
        >
          追加
        </button>
      </div>
      {tags.length === 0 ? (
        <p className="text-xs text-gray-400">タグがありません。</p>
      ) : (
        <ul className="flex flex-wrap gap-1">
          {tags.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-white"
              style={{ backgroundColor: t.color ?? '#6b7280' }}
            >
              {t.name}
              <button
                className="opacity-80 hover:opacity-100"
                onClick={() => removeTag(t.id)}
                aria-label={`${t.name} を削除`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
