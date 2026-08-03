/**
 * ホーム画面（§21）。今日の自動スケジュール結果から「現在の予定」と「次の予定」を示す。
 * - 現在の予定: 予定名・終了時刻（§21.1）
 * - 次の予定: 予定名・開始/終了時刻。現在よりやや目立たせる（§21.2）
 * - 現在/次の予定に開始アクション、実行中の予定に完了アクションを提供（§21）
 *
 * 開始/完了は実績記録（§14）として永続化する:
 * - 開始アクション → 実際の開始時刻を記録し `started`（§14.1）
 * - 完了アクション → 実際の終了時刻を記録し `completed`（§14.2）
 * 完了済みの予定は現在/次の候補から除外する。
 * 未完了申告・再スケジューリング（§14.3）は今後対応（[[project-status]]）。
 */

import { useEffect, useMemo, useState } from 'react'
import type { ActivityRecord, Category, Id } from '../../domain/types'
import { recordId } from '../../domain/types'
import { minutesToTime } from '../../domain/scheduler/intervals'
import { scheduleDay } from '../../domain/scheduler/scheduleDay'
import type { PlacedItem } from '../../domain/scheduler/placement'
import { useAppStore } from '../../store/appStore'

/** 今日の自動配置に使う既定の稼働時間窓（07:00–23:00）。 */
const HOME_WINDOW = { start: 7 * 60, end: 23 * 60 }

const KIND_LABEL: Record<PlacedItem['kind'], string> = {
  fixed: '固定予定',
  flexible: 'タスク',
  free: '自由活動',
  routine: '生活ルーチン',
  break: '休憩',
}

const pad = (n: number) => String(n).padStart(2, '0')

function isoDate(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function isoDateTime(now: Date): string {
  return `${isoDate(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}`
}

export function Home() {
  const definitions = useAppStore((s) => s.definitions)
  const categories = useAppStore((s) => s.categories)
  const records = useAppStore((s) => s.records)
  const saveRecord = useAppStore((s) => s.saveRecord)

  // 1分ごとに現在時刻を更新して表示を最新に保つ。
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const categoryMap = useMemo(
    () => new Map<Id, Category>(categories.map((c) => [c.id, c])),
    [categories],
  )

  const now = useMemo(() => new Date(nowMs), [nowMs])
  const date = isoDate(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()

  // 今日の実績を配置ブロックIDで引けるようにする。
  const recordByItem = useMemo(() => {
    const map = new Map<string, ActivityRecord>()
    for (const r of records) if (r.date === date) map.set(r.itemId, r)
    return map
  }, [records, date])

  const { current, next } = useMemo(() => {
    const referenceTime = isoDateTime(now)
    const { timeline } = scheduleDay({
      date,
      definitions,
      categories: categoryMap,
      window: HOME_WINDOW,
      referenceTime,
    })
    // 完了済みは対象から除く。
    const items = timeline.filter((i) => recordByItem.get(i.id)?.status !== 'completed')
    const current = items.find(
      (i) => i.interval.start <= nowMin && nowMin < i.interval.end,
    )
    const next = items
      .filter((i) => i.interval.start > nowMin)
      .sort((a, b) => a.interval.start - b.interval.start)[0]
    return { current, next }
  }, [now, date, nowMin, definitions, categoryMap, recordByItem])

  function start(item: PlacedItem) {
    const at = isoDateTime(new Date())
    void saveRecord({
      id: recordId(date, item.id),
      date,
      itemId: item.id,
      sourceId: item.sourceId ?? item.id,
      status: 'started',
      actualStart: at,
      createdAt: at,
      updatedAt: at,
    })
  }

  function complete(item: PlacedItem) {
    const at = isoDateTime(new Date())
    const existing = recordByItem.get(item.id)
    void saveRecord({
      id: recordId(date, item.id),
      date,
      itemId: item.id,
      sourceId: item.sourceId ?? item.id,
      status: 'completed',
      actualStart: existing?.actualStart,
      actualEnd: at,
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    })
  }

  const currentStatus = current ? recordByItem.get(current.id)?.status : undefined

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* 現在の予定 */}
      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <p className="mb-1 text-xs font-medium text-gray-500">現在の予定</p>
        {current ? (
          <div>
            <p className="text-lg font-semibold">{current.label ?? KIND_LABEL[current.kind]}</p>
            <p className="mt-0.5 text-sm text-gray-500">
              {KIND_LABEL[current.kind]} · 〜{minutesToTime(current.interval.end)} 終了
            </p>
            {current.kind !== 'break' && (
              <div className="mt-3 flex items-center gap-2">
                {currentStatus === 'started' ? (
                  <>
                    <button
                      className="rounded bg-gray-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
                      onClick={() => complete(current)}
                    >
                      完了にする
                    </button>
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      実行中
                    </span>
                  </>
                ) : (
                  <button
                    className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                    onClick={() => start(current)}
                  >
                    開始する
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400">進行中の予定はありません。</p>
        )}
      </div>

      {/* 次の予定（やや目立たせる, §21.2） */}
      <div className="rounded-lg border-2 border-emerald-500 bg-emerald-50 p-4 dark:border-emerald-600 dark:bg-emerald-950/40">
        <p className="mb-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">次の予定</p>
        {next ? (
          <div>
            <p className="text-lg font-semibold">{next.label ?? KIND_LABEL[next.kind]}</p>
            <p className="mt-0.5 text-sm text-emerald-800 dark:text-emerald-200">
              {KIND_LABEL[next.kind]} · {minutesToTime(next.interval.start)}〜
              {minutesToTime(next.interval.end)}
            </p>
            {next.kind !== 'break' && recordByItem.get(next.id)?.status !== 'started' && (
              <div className="mt-3">
                <button
                  className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                  onClick={() => start(next)}
                >
                  開始する
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400">この先に予定はありません。</p>
        )}
      </div>
    </div>
  )
}
