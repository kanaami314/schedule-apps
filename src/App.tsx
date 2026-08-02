import { useEffect } from 'react'
import { useAppStore } from './store/appStore'
import { ScheduleManager } from './features/schedule/ScheduleManager'

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
        <ScheduleManager />
      ) : (
        <p className="text-gray-500">読み込み中…</p>
      )}
    </div>
  )
}

export default App
