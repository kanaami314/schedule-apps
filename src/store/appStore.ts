/**
 * アプリのグローバル状態（Zustand）。
 *
 * データアクセスはリポジトリ抽象（既定は Dexie/IndexedDB 実装）に委譲する。
 * UI はこのストア経由でのみデータを読み書きする。
 */

import { create } from 'zustand'
import type { Category, Id, ScheduleDefinition } from '../domain/types'
import { createDexieRepository, type AppRepository } from '../data'

const repository: AppRepository = createDexieRepository()

interface AppState {
  /** 初回読み込みが完了したか。 */
  loaded: boolean
  categories: Category[]
  definitions: ScheduleDefinition[]

  /** 永続化層から全データを読み込む。 */
  init(): Promise<void>
  /** 予定定義を追加または更新して永続化する。 */
  saveDefinition(def: ScheduleDefinition): Promise<void>
  /** 予定定義を削除する。 */
  removeDefinition(id: Id): Promise<void>
  /** カテゴリを追加または更新する。 */
  saveCategory(category: Category): Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  loaded: false,
  categories: [],
  definitions: [],

  async init() {
    const [categories, definitions] = await Promise.all([
      repository.categories.all(),
      repository.definitions.all(),
    ])
    set({ categories, definitions, loaded: true })
  },

  async saveDefinition(def) {
    await repository.definitions.put(def)
    const rest = get().definitions.filter((d) => d.id !== def.id)
    set({ definitions: [...rest, def] })
  },

  async removeDefinition(id) {
    await repository.definitions.delete(id)
    set({ definitions: get().definitions.filter((d) => d.id !== id) })
  },

  async saveCategory(category) {
    await repository.categories.put(category)
    const rest = get().categories.filter((c) => c.id !== category.id)
    set({ categories: [...rest, category] })
  },
}))
