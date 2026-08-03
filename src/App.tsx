import { useEffect } from 'react'
import { useAppStore } from './store/appStore'
import { ScheduleManager } from './features/schedule/ScheduleManager'
import { DaySchedule } from './features/schedule/DaySchedule'
import { CategoryManager } from './features/schedule/CategoryManager'
import { TaskList } from './features/schedule/TaskList'
import { Home } from './features/schedule/Home'

function App() {
  const init = useAppStore((s) => s.init)
  const loaded = useAppStore((s) => s.loaded)

  useEffect(() => {
    void init()
  }, [init])

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">タイムスケジューラ</h1>
        <p className="text-sm text-gray-500">予定を登録すると IndexedDB に保存されます。</p>
      </header>
      {loaded ? (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-lg font-semibold">ホーム</h2>
            <Home />
          </section>
          <ScheduleManager />
          <section>
            <h2 className="mb-3 text-lg font-semibold">カテゴリ</h2>
            <CategoryManager />
          </section>
          <section>
            <h2 className="mb-3 text-lg font-semibold">タスク一覧</h2>
            <TaskList />
          </section>
          <section>
            <h2 className="mb-3 text-lg font-semibold">自動スケジュール</h2>
            <DaySchedule />
          </section>
        </div>
      ) : (
        <p className="text-gray-500">読み込み中…</p>
      )}
    </div>
  )
}

export default App
