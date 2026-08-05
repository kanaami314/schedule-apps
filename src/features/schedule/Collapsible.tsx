/**
 * 詳細項目の折りたたみ表示。既定は畳んでおき、必要なときだけ展開する（見た目のスッキリ化）。
 * 開閉状態は呼び出し側が持つ（編集時は自動展開したい等の制御をフォーム側で行うため）。
 */

import type { ReactNode } from 'react'

export function Collapsible({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="rounded border border-gray-200 dark:border-gray-700">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-1 px-2 py-1.5 text-left text-xs font-medium text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <span className="text-gray-400">{open ? '▾' : '▸'}</span>
        {title}
      </button>
      {open && (
        <div className="space-y-2 border-t border-gray-100 px-2 py-2 dark:border-gray-800">{children}</div>
      )}
    </div>
  )
}
