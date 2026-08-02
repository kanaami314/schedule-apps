/**
 * タスク一覧（§15 の一部）。柔軟なタスクを期限の近さで分類して表示する。
 * 〆切間近（既定3日以内）/ 今週（7日以内）/ それ以降。
 * TODO: 未配置・今日・やりたいこと候補は今後追加（[[project-status]]）。
 */

import { useMemo } from 'react'
import type { FlexibleTask } from '../../domain/types'
import { useAppStore } from '../../store/appStore'

/** 〆切間近のしきい値（日）。既定3日（§15.1）。 */
const DEADLINE_NEAR_DAYS = 3

interface Bucket {
  key: string
  title: string
  className: string
  tasks: FlexibleTask[]
}

function hoursUntil(deadline: string, now: number): number {
  return (Date.parse(deadline) - now) / 3_600_000
}

export function TaskList() {
  const definitions = useAppStore((s) => s.definitions)
  const categories = useAppStore((s) => s.categories)
  const categoryName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  )

  const buckets = useMemo<Bucket[]>(() => {
    const now = Date.now()
    const tasks = definitions
      .filter((d): d is FlexibleTask => d.kind === 'flexible')
      .sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline))

    const near: FlexibleTask[] = []
    const thisWeek: FlexibleTask[] = []
    const later: FlexibleTask[] = []
    for (const t of tasks) {
      const h = hoursUntil(t.deadline, now)
      if (h <= DEADLINE_NEAR_DAYS * 24) near.push(t)
      else if (h <= 7 * 24) thisWeek.push(t)
      else later.push(t)
    }
    return [
      { key: 'near', title: '〆切間近', className: 'text-red-600 dark:text-red-400', tasks: near },
      { key: 'week', title: '今週', className: 'text-amber-600 dark:text-amber-400', tasks: thisWeek },
      { key: 'later', title: 'それ以降', className: 'text-gray-500', tasks: later },
    ]
  }, [definitions])

  const total = buckets.reduce((n, b) => n + b.tasks.length, 0)
  if (total === 0) {
    return <p className="text-sm text-gray-500">柔軟なタスクがありません。</p>
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {buckets.map((bucket) => (
        <div key={bucket.key} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
          <h4 className={`mb-2 text-sm font-semibold ${bucket.className}`}>
            {bucket.title}
            <span className="ml-1 text-xs text-gray-400">{bucket.tasks.length}</span>
          </h4>
          {bucket.tasks.length === 0 ? (
            <p className="text-xs text-gray-400">なし</p>
          ) : (
            <ul className="space-y-1">
              {bucket.tasks.map((t) => (
                <li key={t.id} className="text-sm">
                  <span className="font-medium">{t.name}</span>
                  <div className="text-xs text-gray-500">
                    {t.deadline.replace('T', ' ')} / {t.estimatedDuration}分
                    {t.categoryId && categoryName.has(t.categoryId) && (
                      <span className="ml-1">· {categoryName.get(t.categoryId)}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}
