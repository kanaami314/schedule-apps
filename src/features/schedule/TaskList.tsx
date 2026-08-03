/**
 * タスク一覧（§15）。柔軟なタスクを期限で分類し、今日置けなかったタスクを警告表示する。
 *
 * 仕様(§15)は「今日 / 今週 / 〆切間近 / 未配置 / やりたいこと候補」の一覧を挙げる。
 * 定義に曖昧さがあるため、以下の既定解釈で実装する（後から調整可, §26）:
 * - 今日: 期限が本日中または超過（C-3 の締切区分「0: 期限超過・当日」に対応）
 * - 〆切間近: 本日より後で、期限までの残りが D 日以内（既定3日, §15.1）
 * - 今週: それ以降で 7 日以内
 * - それ以降: 上記以外
 *   （締切の近い順に排他分類。1タスクは1つの期限バケットに入る）
 * - 未配置: 本日の既定稼働窓(07:00–23:00)で自動配置したとき置けなかったタスク（§16.6）。
 *   期限バケットとは重なる「警告リスト」として上部に表示する。
 * - やりたいこと候補(§10/§15): 名前だけを登録する候補。末尾に追加/一覧表示する。
 */

import { useMemo, useState } from 'react'
import type { Category, FlexibleTask, Id } from '../../domain/types'
import { scheduleDay } from '../../domain/scheduler/scheduleDay'
import { newId } from '../../lib/ids'
import { useAppStore } from '../../store/appStore'

/** 〆切間近のしきい値（日）。既定3日（§15.1）。 */
const DEADLINE_NEAR_DAYS = 3

/** 未配置判定に用いる本日の既定稼働窓（07:00–23:00）。 */
const TODAY_WINDOW = { start: 7 * 60, end: 23 * 60 }

type Tier = 'today' | 'near' | 'week' | 'later'

interface Bucket {
  key: Tier
  title: string
  className: string
  tasks: FlexibleTask[]
}

const pad = (n: number) => String(n).padStart(2, '0')

function isoDate(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function hoursUntil(deadline: string, now: number): number {
  return (Date.parse(deadline) - now) / 3_600_000
}

/** 期限からタスクの締切バケットを決める（近い順に排他）。 */
function classify(task: FlexibleTask, now: number, today: string): Tier {
  // 期限日が本日以前（超過・当日）なら「今日」。
  if (task.deadline.slice(0, 10) <= today) return 'today'
  const h = hoursUntil(task.deadline, now)
  if (h <= DEADLINE_NEAR_DAYS * 24) return 'near'
  if (h <= 7 * 24) return 'week'
  return 'later'
}

/** やりたいこと候補（§10）。名前だけを登録・一覧・削除する。 */
function Wishlist() {
  const wishlist = useAppStore((s) => s.wishlist)
  const saveWishlistItem = useAppStore((s) => s.saveWishlistItem)
  const removeWishlistItem = useAppStore((s) => s.removeWishlistItem)
  const [name, setName] = useState('')

  function add() {
    const trimmed = name.trim()
    if (!trimmed) return
    void saveWishlistItem({ id: newId(), name: trimmed })
    setName('')
  }

  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <h4 className="mb-2 text-sm font-semibold text-gray-600 dark:text-gray-300">
        やりたいこと候補
        <span className="ml-1 text-xs text-gray-400">{wishlist.length}</span>
      </h4>
      <div className="mb-2 flex gap-2">
        <input
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
          placeholder="やってみたいこと"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button
          className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          disabled={name.trim() === ''}
          onClick={add}
        >
          追加
        </button>
      </div>
      {wishlist.length === 0 ? (
        <p className="text-xs text-gray-400">候補がありません。</p>
      ) : (
        <ul className="flex flex-wrap gap-1">
          {wishlist.map((w) => (
            <li
              key={w.id}
              className="flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-sm dark:bg-gray-700"
            >
              <span>{w.name}</span>
              <button
                className="text-xs text-gray-400 hover:text-red-600"
                onClick={() => removeWishlistItem(w.id)}
                aria-label={`${w.name} を削除`}
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

export function TaskList() {
  const definitions = useAppStore((s) => s.definitions)
  const categories = useAppStore((s) => s.categories)
  const categoryName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  )

  const { buckets, unplaced } = useMemo(() => {
    const nowDate = new Date()
    const now = nowDate.getTime()
    const today = isoDate(nowDate)

    const tasks = definitions
      .filter((d): d is FlexibleTask => d.kind === 'flexible')
      .sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline))

    const grouped: Record<Tier, FlexibleTask[]> = { today: [], near: [], week: [], later: [] }
    for (const t of tasks) grouped[classify(t, now, today)].push(t)

    const buckets: Bucket[] = [
      { key: 'today', title: '今日', className: 'text-red-600 dark:text-red-400', tasks: grouped.today },
      { key: 'near', title: '〆切間近', className: 'text-orange-600 dark:text-orange-400', tasks: grouped.near },
      { key: 'week', title: '今週', className: 'text-amber-600 dark:text-amber-400', tasks: grouped.week },
      { key: 'later', title: 'それ以降', className: 'text-gray-500', tasks: grouped.later },
    ]

    // 未配置: 本日の既定窓で自動配置して置けなかった柔軟タスク（§16.6）。
    const categoryMap = new Map<Id, Category>(categories.map((c) => [c.id, c]))
    const { unplaced: unplacedResult } = scheduleDay({
      date: today,
      definitions,
      categories: categoryMap,
      window: TODAY_WINDOW,
    })
    const unplaced = unplacedResult.map((u) => u.task)

    return { buckets, unplaced }
  }, [definitions, categories])

  const total = buckets.reduce((n, b) => n + b.tasks.length, 0)
  if (total === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-500">柔軟なタスクがありません。</p>
        <Wishlist />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {unplaced.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/40">
          <h4 className="mb-1 text-sm font-semibold text-red-700 dark:text-red-300">
            未配置
            <span className="ml-1 text-xs text-red-400">{unplaced.length}</span>
          </h4>
          <p className="mb-2 text-xs text-red-500 dark:text-red-400">
            今日の稼働時間（{pad(TODAY_WINDOW.start / 60)}:00–{pad(TODAY_WINDOW.end / 60)}:00）に収まりませんでした。
          </p>
          <ul className="space-y-1">
            {unplaced.map((t) => (
              <li key={t.id} className="text-sm">
                <span className="font-medium">{t.name}</span>
                <span className="ml-2 text-xs text-red-500">
                  期限 {t.deadline.replace('T', ' ')} / {t.estimatedDuration}分
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      <Wishlist />
    </div>
  )
}
