/**
 * 負荷（集中度・精神的負荷・身体的負荷）の入力コンポーネント（§11.1）。
 * 各項目 低(1)/普通(2)/高(3)。固定予定・柔軟なタスクのフォームで再利用する。
 */

import type { LoadLevel } from '../../domain/types'
import type { LoadValue } from './loadValue'

const LEVELS: { value: LoadLevel; label: string }[] = [
  { value: 1, label: '低' },
  { value: 2, label: '普通' },
  { value: 3, label: '高' },
]

const selectClass =
  'w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800'
const labelClass = 'block text-xs font-medium text-gray-600 dark:text-gray-300'

function LoadSelect(props: {
  label: string
  value: LoadLevel
  onChange: (v: LoadLevel) => void
}) {
  return (
    <div className="flex-1">
      <label className={labelClass}>{props.label}</label>
      <select
        className={selectClass}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value) as LoadLevel)}
      >
        {LEVELS.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function LoadFields(props: { value: LoadValue; onChange: (v: LoadValue) => void }) {
  const { value, onChange } = props
  return (
    <div>
      <p className={`${labelClass} mb-1`}>負荷</p>
      <div className="flex gap-2">
        <LoadSelect
          label="集中度"
          value={value.focus}
          onChange={(focus) => onChange({ ...value, focus })}
        />
        <LoadSelect
          label="精神"
          value={value.mental}
          onChange={(mental) => onChange({ ...value, mental })}
        />
        <LoadSelect
          label="身体"
          value={value.physical}
          onChange={(physical) => onChange({ ...value, physical })}
        />
      </div>
    </div>
  )
}
