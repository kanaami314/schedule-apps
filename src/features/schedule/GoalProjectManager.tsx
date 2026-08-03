/**
 * 長期目標・プロジェクトの管理（§9）。
 * 目標を作成・削除し、プロジェクトを作成（最大1つの目標に紐付け）・削除する。
 * 予定として自動配置はしない（分類・集約のための構造）。
 * タスクへのプロジェクト紐付けUIは今後（[[project-status]]）。
 */

import { useState } from 'react'
import type { LongTermGoal, Project } from '../../domain/types'
import { useAppStore } from '../../store/appStore'
import { newId } from '../../lib/ids'

const inputClass =
  'w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800'
const cardClass = 'rounded-lg border border-gray-200 p-4 dark:border-gray-700'
const buttonClass =
  'rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40'

function GoalSection() {
  const goals = useAppStore((s) => s.goals)
  const saveGoal = useAppStore((s) => s.saveGoal)
  const removeGoal = useAppStore((s) => s.removeGoal)
  const [name, setName] = useState('')

  function add() {
    const trimmed = name.trim()
    if (!trimmed) return
    const goal: LongTermGoal = { id: newId(), name: trimmed }
    void saveGoal(goal)
    setName('')
  }

  return (
    <div className={cardClass}>
      <h3 className="mb-3 font-semibold">長期目標</h3>
      <div className="mb-2 flex gap-2">
        <input
          className={inputClass}
          placeholder="目標名"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className={buttonClass} disabled={name.trim() === ''} onClick={add}>
          追加
        </button>
      </div>
      {goals.length === 0 ? (
        <p className="text-xs text-gray-400">目標がありません。</p>
      ) : (
        <ul className="space-y-1">
          {goals.map((g) => (
            <li key={g.id} className="flex items-center justify-between text-sm">
              <span>{g.name}</span>
              <button className="text-xs text-red-600 hover:underline" onClick={() => removeGoal(g.id)}>
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ProjectSection() {
  const goals = useAppStore((s) => s.goals)
  const projects = useAppStore((s) => s.projects)
  const saveProject = useAppStore((s) => s.saveProject)
  const removeProject = useAppStore((s) => s.removeProject)
  const [name, setName] = useState('')
  const [goalId, setGoalId] = useState('')

  const goalName = new Map(goals.map((g) => [g.id, g.name]))

  function add() {
    const trimmed = name.trim()
    if (!trimmed) return
    const project: Project = { id: newId(), name: trimmed, goalId: goalId || undefined }
    void saveProject(project)
    setName('')
    setGoalId('')
  }

  return (
    <div className={cardClass}>
      <h3 className="mb-3 font-semibold">プロジェクト</h3>
      <div className="mb-2 space-y-2">
        <input
          className={inputClass}
          placeholder="プロジェクト名"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex gap-2">
          <select className={inputClass} value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">（長期目標なし）</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button className={buttonClass} disabled={name.trim() === ''} onClick={add}>
            追加
          </button>
        </div>
      </div>
      {projects.length === 0 ? (
        <p className="text-xs text-gray-400">プロジェクトがありません。</p>
      ) : (
        <ul className="space-y-1">
          {projects.map((p) => (
            <li key={p.id} className="flex items-center justify-between text-sm">
              <span>
                {p.name}
                {p.goalId && goalName.has(p.goalId) && (
                  <span className="ml-2 text-xs text-gray-500">🎯 {goalName.get(p.goalId)}</span>
                )}
              </span>
              <button
                className="text-xs text-red-600 hover:underline"
                onClick={() => removeProject(p.id)}
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function GoalProjectManager() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <GoalSection />
      <ProjectSection />
    </div>
  )
}
