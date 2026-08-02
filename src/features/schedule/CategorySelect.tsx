/**
 * カテゴリ選択（ストアのカテゴリ一覧から選ぶ）。予定・タスクのフォームで使う。
 */

import { useMemo } from 'react'
import { useAppStore } from '../../store/appStore'

const selectClass =
  'w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800'
const labelClass = 'block text-xs font-medium text-gray-600 dark:text-gray-300'

export function CategorySelect(props: {
  value: string
  onChange: (id: string) => void
  label?: string
}) {
  const categories = useAppStore((s) => s.categories)
  const sorted = useMemo(
    () => [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [categories],
  )

  return (
    <div>
      <label className={labelClass}>{props.label ?? 'カテゴリ'}</label>
      <select className={selectClass} value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        <option value="">（未選択）</option>
        {sorted.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  )
}
