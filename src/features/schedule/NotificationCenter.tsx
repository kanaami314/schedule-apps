/**
 * 通知（§16）。GitHub Pages では常駐プッシュができないため（M-4）、当面は
 * 「アプリ起動中／Service Worker 生存中」に限定して通知する。将来はサーバー移行後に
 * 真のバックグラウンド通知へ拡張する。通知ロジックはデータとして保持している。
 *
 * 実装範囲:
 * - 通知欄(§16.7): 未配置・期限超過(§16.4)・〆切間近タスクを画面内テキストで表示（OS許可不要・常時）。
 * - 起動中のOS通知: 当日の各予定の 準備開始/移動開始/開始前/開始時刻 を、有効化かつ
 *   通知許可があるときに配信（§16.1/§16.2）。個別予定で無効化されたものは除外。
 * - 日次振り返りリマインダ(§16.8): 設定時刻（既定22:00）に起動中なら通知。
 * 終了通知(§16.3、完了/未完了アクション付き) は Service Worker が必要で今後（[[project-status]]）。
 */

import { useEffect, useMemo, useState } from 'react'
import type { Category, FlexibleTask, Id, ScheduleDefinition } from '../../domain/types'
import { scheduleDay } from '../../domain/scheduler/scheduleDay'
import type { PlacedItem } from '../../domain/scheduler/placement'
import { planNotifications, type PlanNotifyInput } from '../../domain/notifications/schedule'
import { useAppStore } from '../../store/appStore'

const cardClass = 'rounded-lg border border-gray-200 p-4 dark:border-gray-700'

const KIND_LABEL: Record<PlacedItem['kind'], string> = {
  fixed: '固定予定',
  flexible: 'タスク',
  free: '自由活動',
  routine: '生活ルーチン',
  break: '休憩',
}

const DEADLINE_NEAR_DAYS = 3

function todayIso(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

export function NotificationCenter() {
  const definitions = useAppStore((s) => s.definitions)
  const categories = useAppStore((s) => s.categories)
  const records = useAppStore((s) => s.records)
  const notifyEnabled = useAppStore((s) => s.notifyEnabled)
  const setNotifyEnabled = useAppStore((s) => s.setNotifyEnabled)
  const beforeMinutes = useAppStore((s) => s.notifyBeforeMinutes)
  const setBeforeMinutes = useAppStore((s) => s.setNotifyBeforeMinutes)
  const reflectionTime = useAppStore((s) => s.notifyReflectionTime)
  const setReflectionTime = useAppStore((s) => s.setNotifyReflectionTime)

  const supported = typeof Notification !== 'undefined'
  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : 'denied',
  )

  const date = todayIso(new Date())

  const categoryMap = useMemo(
    () => new Map<Id, Category>(categories.map((c) => [c.id, c])),
    [categories],
  )
  const defById = useMemo(
    () => new Map<Id, ScheduleDefinition>(definitions.map((d) => [d.id, d])),
    [definitions],
  )

  // 当日のスケジュール（通知欄・OS通知の両方で使う）。
  const { timeline, unplaced } = useMemo(
    () => scheduleDay({ date, definitions, categories: categoryMap }),
    [date, definitions, categoryMap],
  )

  // §16.4: 〆切間近の柔軟タスク（残り D 日以内、期限超過は除く）。
  const deadlineNear = useMemo(() => {
    const now = Date.now()
    return definitions
      .filter((d): d is FlexibleTask => d.kind === 'flexible')
      .filter((t) => {
        const remainingDays = (Date.parse(t.deadline) - now) / 86_400_000
        return remainingDays >= 0 && remainingDays <= DEADLINE_NEAR_DAYS
      })
      .sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline))
  }, [definitions])

  // §16.4: 期限超過。期限を過ぎ、完了しておらず、実績時間が推定所要に達していない柔軟タスク。
  const overdue = useMemo(() => {
    const now = Date.now()
    return definitions
      .filter((d): d is FlexibleTask => d.kind === 'flexible')
      .filter((t) => {
        if (Date.parse(t.deadline) >= now) return false
        const recs = records.filter((r) => r.sourceId === t.id)
        if (recs.some((r) => r.status === 'completed')) return false
        const actualSum = recs.reduce(
          (s, r) =>
            s +
            (r.actualStart && r.actualEnd
              ? Math.max(0, (Date.parse(r.actualEnd) - Date.parse(r.actualStart)) / 60_000)
              : 0),
          0,
        )
        return actualSum < t.estimatedDuration
      })
      .sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline))
  }, [definitions, records])

  // OS通知の入力（当日の各予定）。個別に無効化された予定は除外（§16 優先順位）。
  const notifyInputs = useMemo<PlanNotifyInput[]>(() => {
    return timeline.flatMap((item) => {
      const def = item.sourceId ? defById.get(item.sourceId) : undefined
      const override = def && 'notification' in def ? def.notification : undefined
      if (override?.enabled === false) return []
      const before = override?.beforeStartMinutes ?? beforeMinutes
      const input: PlanNotifyInput = {
        label: item.label ?? KIND_LABEL[item.kind],
        startMin: item.interval.start,
        beforeMin: before,
      }
      if (def?.kind === 'fixed') {
        input.prepMin = def.prepTime?.duration
        input.travelMin = def.travelTime?.duration
      }
      return [input]
    })
  }, [timeline, defById, beforeMinutes])

  // 起動中のOS通知をスケジュールする（有効かつ許可あり）。
  useEffect(() => {
    if (!notifyEnabled || !supported || Notification.permission !== 'granted') return
    const now = new Date()
    const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
    const events = planNotifications(notifyInputs, nowMin)
    const timers = events.map((ev) =>
      window.setTimeout(
        () => {
          try {
            new Notification(ev.title, { body: ev.body })
          } catch {
            // 通知生成に失敗しても無視。
          }
        },
        Math.max(0, (ev.atMin - nowMin) * 60_000),
      ),
    )
    return () => timers.forEach((t) => clearTimeout(t))
  }, [notifyEnabled, supported, notifyInputs])

  // §16.8: 日次振り返りのリマインダを設定時刻に通知する（起動中のみ）。
  useEffect(() => {
    if (!notifyEnabled || !supported || Notification.permission !== 'granted') return
    const [h, m] = reflectionTime.split(':').map(Number)
    const now = new Date()
    const target = new Date(now)
    target.setHours(h, m, 0, 0)
    const delay = target.getTime() - now.getTime()
    if (delay < 0) return // 今日の予定時刻を過ぎていれば今日は通知しない。
    const timer = window.setTimeout(() => {
      try {
        new Notification('日次振り返り', { body: '今日の振り返りを記録しましょう' })
      } catch {
        // 無視。
      }
    }, delay)
    return () => clearTimeout(timer)
  }, [notifyEnabled, supported, reflectionTime])

  async function toggle(value: boolean) {
    if (value && supported && Notification.permission === 'default') {
      const result = await Notification.requestPermission()
      setPermission(result)
    }
    setNotifyEnabled(value)
  }

  const noticeCount = unplaced.length + overdue.length + deadlineNear.length

  return (
    <div className={cardClass}>
      {/* 起動中通知の設定 */}
      <div className="mb-3 flex flex-wrap items-center gap-3 border-b border-gray-100 pb-3 dark:border-gray-800">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notifyEnabled} onChange={(e) => toggle(e.target.checked)} />
          起動中の通知を有効化
        </label>
        <label className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300">
          開始前
          <input
            type="number"
            min={0}
            className="w-14 rounded border border-gray-300 px-1 py-0.5 text-sm dark:border-gray-600 dark:bg-gray-800"
            value={beforeMinutes}
            onChange={(e) => setBeforeMinutes(Number(e.target.value))}
          />
          分
        </label>
        <label className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300">
          振り返り
          <input
            type="time"
            className="rounded border border-gray-300 px-1 py-0.5 text-sm dark:border-gray-600 dark:bg-gray-800"
            value={reflectionTime}
            onChange={(e) => setReflectionTime(e.target.value)}
          />
        </label>
        {notifyEnabled && supported && permission !== 'granted' && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            ブラウザの通知許可が必要です（許可されるまでOS通知は出ません）
          </span>
        )}
        {!supported && (
          <span className="text-xs text-gray-400">この環境はOS通知に非対応です</span>
        )}
      </div>

      {/* 通知欄（§16.7）: OS許可の有無に関わらず画面内に表示 */}
      <h3 className="mb-2 text-sm font-semibold">
        通知欄
        {noticeCount > 0 && <span className="ml-1 text-xs text-gray-400">{noticeCount}</span>}
      </h3>
      {noticeCount === 0 ? (
        <p className="text-xs text-gray-400">今日の通知はありません。</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {overdue.map((t) => (
            <li key={`o-${t.id}`} className="font-medium text-red-700 dark:text-red-300">
              🚨 期限超過: {t.name}（{t.deadline.replace('T', ' ')}）
            </li>
          ))}
          {unplaced.map((u) => (
            <li key={`u-${u.task.id}`} className="text-red-600 dark:text-red-400">
              ⚠ 未配置: {u.task.name}
            </li>
          ))}
          {deadlineNear.map((t) => (
            <li key={`d-${t.id}`} className="text-orange-600 dark:text-orange-400">
              ⏰ 〆切間近: {t.name}（{t.deadline.replace('T', ' ')}）
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
