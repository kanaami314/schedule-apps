import { useEffect } from 'react'
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

function App() {
  const init = useAppStore((s) => s.init)
  const loaded = useAppStore((s) => s.loaded)
  const minimalMode = useAppStore((s) => s.minimalMode)
  const setMinimalMode = useAppStore((s) => s.setMinimalMode)

  useEffect(() => {
    void init()
  }, [init])

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">タイムスケジューラ</h1>
          <p className="text-sm text-gray-500">予定を登録すると IndexedDB に保存されます。</p>
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
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-lg font-semibold">ホーム</h2>
            <Home />
          </section>
          <section>
            <h2 className="mb-3 text-lg font-semibold">通知</h2>
            <NotificationCenter />
          </section>
          <ScheduleManager />
          <section>
            <h2 className="mb-3 text-lg font-semibold">カテゴリ</h2>
            <CategoryManager />
          </section>
          {!minimalMode && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">長期目標・プロジェクト</h2>
              <GoalProjectManager />
            </section>
          )}
          <section>
            <h2 className="mb-3 text-lg font-semibold">タスク一覧</h2>
            <TaskList />
          </section>
          <section>
            <h2 className="mb-3 text-lg font-semibold">自動スケジュール</h2>
            <DaySchedule />
          </section>
          <section>
            <h2 className="mb-3 text-lg font-semibold">カレンダー</h2>
            <CalendarView />
          </section>
          <section>
            <h2 className="mb-3 text-lg font-semibold">日次振り返り</h2>
            <Reflection />
          </section>
          <section>
            <h2 className="mb-3 text-lg font-semibold">バランス分析</h2>
            <BalanceAnalysis />
          </section>
        </div>
      ) : (
        <p className="text-gray-500">読み込み中…</p>
      )}
    </div>
  )
}

export default App
