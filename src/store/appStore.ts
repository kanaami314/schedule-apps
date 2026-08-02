/**
 * アプリのグローバル状態（Zustand）。
 *
 * データアクセスはリポジトリ抽象（既定は Dexie/IndexedDB 実装）に委譲する。
 * UI はこのストア経由でのみデータを読み書きする。
 */

import { create } from 'zustand'
import type { Category, Id, ScheduleDefinition } from '../domain/types'
import { createDexieRepository, type AppRepository } from '../data'
import { newId } from '../lib/ids'

const repository: AppRepository = createDexieRepository()

/** 初期カテゴリ（§8.1）と既定色。最上位カテゴリとして投入する。 */
const DEFAULT_CATEGORY_SEEDS: { name: string; color: string }[] = [
  { name: '学校', color: '#3b82f6' },
  { name: '研究', color: '#8b5cf6' },
  { name: '就活', color: '#ef4444' },
  { name: 'アルバイト', color: '#f59e0b' },
  { name: '勉強', color: '#10b981' },
  { name: '趣味', color: '#ec4899' },
  { name: '生活', color: '#6b7280' },
  { name: '健康', color: '#14b8a6' },
  { name: '交友', color: '#f97316' },
]

function buildDefaultCategories(): Category[] {
  return DEFAULT_CATEGORY_SEEDS.map((seed, index) => ({
    id: newId(),
    name: seed.name,
    color: seed.color,
    order: index,
  }))
}

interface AppState {
  /** 初回読み込みが完了したか。 */
  loaded: boolean
  categories: Category[]
  definitions: ScheduleDefinition[]

  /** 永続化層から全データを読み込む（初回は初期カテゴリを投入）。 */
  init(): Promise<void>
  /** 予定定義を追加または更新して永続化する。 */
  saveDefinition(def: ScheduleDefinition): Promise<void>
  /** 予定定義を削除する。 */
  removeDefinition(id: Id): Promise<void>
  /** カテゴリを追加または更新する。 */
  saveCategory(category: Category): Promise<void>
  /** カテゴリを削除する。 */
  removeCategory(id: Id): Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  loaded: false,
  categories: [],
  definitions: [],

  async init() {
    const [loadedCategories, definitions] = await Promise.all([
      repository.categories.all(),
      repository.definitions.all(),
    ])
    // 初回のみ初期カテゴリを投入する（§8.1）。
    let categories = loadedCategories
    if (categories.length === 0) {
      categories = buildDefaultCategories()
      await repository.categories.bulkPut(categories)
    }
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

  async removeCategory(id) {
    await repository.categories.delete(id)
    set({ categories: get().categories.filter((c) => c.id !== id) })
  },
}))
