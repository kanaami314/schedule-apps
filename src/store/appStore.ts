/**
 * アプリのグローバル状態（Zustand）。
 *
 * データアクセスはリポジトリ抽象（既定は Dexie/IndexedDB 実装）に委譲する。
 * UI はこのストア経由でのみデータを読み書きする。
 */

import { create } from 'zustand'
import type {
  ActivityRecord,
  Category,
  DailyReflection,
  Id,
  ScheduleDefinition,
} from '../domain/types'
import { createDexieRepository, type AppRepository } from '../data'

const repository: AppRepository = createDexieRepository()

/** init の重複実行を防ぐ（StrictMode の二重呼び出し対策）。 */
let initPromise: Promise<void> | null = null

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
  // ID は固定にし、二重投入されても upsert で1件に収束するようにする（冪等）。
  return DEFAULT_CATEGORY_SEEDS.map((seed, index) => ({
    id: `default-category-${index}`,
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
  /** 実績記録（§14）。 */
  records: ActivityRecord[]
  /** 日次振り返り（§19）。 */
  reflections: DailyReflection[]

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
  /** 実績記録を追加または更新して永続化する（§14）。 */
  saveRecord(record: ActivityRecord): Promise<void>
  /** 日次振り返りを追加または更新して永続化する（§19）。 */
  saveReflection(reflection: DailyReflection): Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  loaded: false,
  categories: [],
  definitions: [],
  records: [],
  reflections: [],

  async init() {
    // 重複呼び出しは同じ Promise を返し、二重投入を防ぐ。
    if (initPromise) return initPromise
    initPromise = (async () => {
      const [loadedCategories, definitions, records, reflections] = await Promise.all([
        repository.categories.all(),
        repository.definitions.all(),
        repository.records.all(),
        repository.reflections.all(),
      ])
      // 初回のみ初期カテゴリを投入する（§8.1）。ID固定なので冪等。
      let categories = loadedCategories
      if (categories.length === 0) {
        categories = buildDefaultCategories()
        await repository.categories.bulkPut(categories)
      }
      set({ categories, definitions, records, reflections, loaded: true })
    })()
    return initPromise
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

  async saveRecord(record) {
    await repository.records.put(record)
    const rest = get().records.filter((r) => r.id !== record.id)
    set({ records: [...rest, record] })
  },

  async saveReflection(reflection) {
    await repository.reflections.put(reflection)
    const rest = get().reflections.filter((r) => r.id !== reflection.id)
    set({ reflections: [...rest, reflection] })
  },
}))
