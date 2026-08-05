import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAppStore } from './store/appStore'
import { ScheduleManager } from './features/schedule/ScheduleManager'
import { DaySchedule } from './features/schedule/DaySchedule'
import { CategoryManager } from './features/schedule/CategoryManager'
import { TaskList } from './features/schedule/TaskList'
import { Home } from './features/schedule/Home'
import { Reflection } from './features/schedule/Reflection'
import { BalanceAnalysis } from './features/schedule/BalanceAnalysis'
import { CalendarView } from './features/schedule/CalendarView'
import { GoalProjectManager } from './features/schedule/GoalProjectManager'
import { NotificationCenter } from './features/schedule/NotificationCenter'
import { TagManager } from './features/schedule/TagManager'
import { Modal } from './features/schedule/Modal'

/** 選択中タブの永続化キー。 */
const TAB_KEY = 'schedule-app.activeTab'

// §7: 予定作成はスケジュールタブに統合したため 'plans' タブは廃止。
type TabKey = 'home' | 'tasks' | 'schedule' | 'review' | 'settings'

function loadTab(): TabKey {
  try {
    const v = localStorage.getItem(TAB_KEY)
    // 旧 'plans'（予定タブ）は 'schedule' に統合済み。
    if (v === 'plans') return 'schedule'
    if (v && ['home', 'tasks', 'schedule', 'review', 'settings'].includes(v)) {
      return v as TabKey
    }
  } catch {
    // ignore
  }
  return 'home'
}

/** 予定の作成・変更・削除で再スケジューリングされたことを知らせるトースト（§16.5）。 */
function ScheduleToast() {
  const version = useAppStore((s) => s.scheduleVersion)
  const [show, setShow] = useState(false)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setShow(true)
    const t = setTimeout(() => setShow(false), 2500)
    return () => clearTimeout(t)
  }, [version])

  if (!show) return null
  return (
    <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
      スケジュールを更新しました
    </div>
  )
}

/** セクション見出し付きのラッパ。 */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function App() {
  const init = useAppStore((s) => s.init)
  const loaded = useAppStore((s) => s.loaded)
  const minimalMode = useAppStore((s) => s.minimalMode)
  const setMinimalMode = useAppStore((s) => s.setMinimalMode)

  const [tab, setTab] = useState<TabKey>(loadTab)
  // 予定作成モーダル（§7: スケジュール表示中に前面表示）。
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    void init()
  }, [init])

  function selectTab(next: TabKey) {
    setTab(next)
    try {
      localStorage.setItem(TAB_KEY, next)
    } catch {
      // ignore
    }
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'home', label: 'ホーム' },
    { key: 'tasks', label: 'タスク' },
    { key: 'schedule', label: 'スケジュール' },
    { key: 'review', label: '振り返り・分析' },
    { key: 'settings', label: '分類・設定' },
  ]

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <ScheduleToast />
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">くるリズム</h1>
          <p className="text-sm text-gray-500">暮らしに合わせる自動スケジューラ</p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            checked={minimalMode}
            onChange={(e) => setMinimalMode(e.target.checked)}
          />
          最低限モード
        </label>
      </header>

      {loaded ? (
        <>
          {/* タブバー */}
          <nav className="mb-6 flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => selectTab(t.key)}
                className={`-mb-px rounded-t border-b-2 px-3 py-2 text-sm font-medium ${
                  tab === t.key
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="space-y-8">
            {tab === 'home' && (
              <>
                <Section title="ホーム">
                  <Home />
                </Section>
                <Section title="通知">
                  <NotificationCenter />
                </Section>
              </>
            )}

            {tab === 'tasks' && (
              <Section title="タスク一覧">
                <TaskList />
              </Section>
            )}

            {tab === 'schedule' && (
              <>
                {/* §7: スケジュール表示中に「予定を作成」で前面ポップアップ。 */}
                <div className="flex justify-end">
                  <button
                    onClick={() => setCreateOpen(true)}
                    className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
                  >
                    ＋ 予定を作成
                  </button>
                </div>
                <Section title="自動スケジュール">
                  <DaySchedule />
                </Section>
                <Section title="カレンダー">
                  <CalendarView />
                </Section>
                <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="予定の作成・編集">
                  <ScheduleManager />
                </Modal>
              </>
            )}

            {tab === 'review' && (
              <>
                <Section title="日次振り返り">
                  <Reflection />
                </Section>
                <Section title="バランス分析">
                  <BalanceAnalysis />
                </Section>
              </>
            )}

            {tab === 'settings' && (
              <>
                <Section title="カテゴリ">
                  <CategoryManager />
                </Section>
                {!minimalMode && (
                  <Section title="長期目標・プロジェクト">
                    <GoalProjectManager />
                  </Section>
                )}
                {!minimalMode && (
                  <Section title="タグ">
                    <TagManager />
                  </Section>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <p className="text-gray-500">読み込み中…</p>
      )}
    </div>
  )
}

export default App
