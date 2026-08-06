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
  LongTermGoal,
  Project,
  ScheduleDefinition,
  Tag,
  WishlistItem,
} from '../domain/types'
import { createDexieRepository, type AppRepository } from '../data'
import { createSupabaseRepository } from '../data/supabaseRepository'
import { supabase } from '../lib/supabase'

// サーバー主導: ログイン中のセッションで RLS が効く Supabase リポジトリを使う。
const repository: AppRepository = createSupabaseRepository(supabase)

/** init の重複実行を防ぐ（StrictMode の二重呼び出し対策）。ログアウトで null に戻す。 */
let initPromise: Promise<void> | null = null

/** 初回ログイン時のローカル取り込み済みフラグ（アカウント単位, localStorage）。 */
const LOCAL_IMPORT_FLAG_PREFIX = 'schedule-app.localImported.'

/** 全コレクションをまとめて読み込む。 */
async function loadAll(repo: AppRepository) {
  const [categories, definitions, records, reflections, wishlist, goals, projects, tags] =
    await Promise.all([
      repo.categories.all(),
      repo.definitions.all(),
      repo.records.all(),
      repo.reflections.all(),
      repo.wishlist.all(),
      repo.goals.all(),
      repo.projects.all(),
      repo.tags.all(),
    ])
  return { categories, definitions, records, reflections, wishlist, goals, projects, tags }
}

/**
 * ローカル(IndexedDB)の既存データを、ログイン中アカウントのクラウドへ取り込む。
 * 何か1件でも取り込んだら true。既存 id は upsert で上書き（ローカル優先）。
 */
async function importLocalData(): Promise<boolean> {
  const local = createDexieRepository()
  const d = await loadAll(local)
  const total =
    d.categories.length +
    d.definitions.length +
    d.records.length +
    d.reflections.length +
    d.wishlist.length +
    d.goals.length +
    d.projects.length +
    d.tags.length
  if (total === 0) return false
  await repository.categories.bulkPut(d.categories)
  await repository.definitions.bulkPut(d.definitions)
  await repository.records.bulkPut(d.records)
  await repository.reflections.bulkPut(d.reflections)
  await repository.wishlist.bulkPut(d.wishlist)
  await repository.goals.bulkPut(d.goals)
  await repository.projects.bulkPut(d.projects)
  await repository.tags.bulkPut(d.tags)
  return true
}

/** 最低限モード（§23）の永続化キー。テーブルではなく localStorage に保持する。 */
const MINIMAL_MODE_KEY = 'schedule-app.minimalMode'

function loadMinimalMode(): boolean {
  try {
    return localStorage.getItem(MINIMAL_MODE_KEY) === '1'
  } catch {
    return false
  }
}

/** 通知設定（§16）の永続化キー。起動中限定通知のためのユーザー設定。 */
const NOTIFY_ENABLED_KEY = 'schedule-app.notifyEnabled'
const NOTIFY_BEFORE_KEY = 'schedule-app.notifyBeforeMinutes'
const NOTIFY_REFLECTION_KEY = 'schedule-app.notifyReflectionTime'

function loadNotifyEnabled(): boolean {
  try {
    return localStorage.getItem(NOTIFY_ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

function loadNotifyBefore(): number {
  try {
    const v = Number(localStorage.getItem(NOTIFY_BEFORE_KEY))
    return Number.isFinite(v) && v >= 0 ? v : 5
  } catch {
    return 5
  }
}

function loadNotifyReflectionTime(): string {
  try {
    const v = localStorage.getItem(NOTIFY_REFLECTION_KEY)
    return v && /^\d{2}:\d{2}$/.test(v) ? v : '22:00'
  } catch {
    return '22:00'
  }
}

/**
 * 予定変更が再スケジューリング対象か（§17.2）。
 * 予定名・メモ・オンライン情報・通知設定・タグ・プロジェクトだけの変更は再計算しない。
 * それ以外（時刻・負荷・カテゴリ・繰り返し等）の変更は再計算対象。
 */
function affectsSchedule(
  prev: ScheduleDefinition | undefined,
  next: ScheduleDefinition,
): boolean {
  if (!prev) return true // 新規作成は常に再計算。
  const relevant = (d: ScheduleDefinition): string => {
    const clone = { ...d } as Record<string, unknown>
    for (const k of ['name', 'notes', 'onlineInfo', 'notification', 'tagIds', 'projectId', 'updatedAt']) {
      delete clone[k]
    }
    return JSON.stringify(clone)
  }
  return relevant(prev) !== relevant(next)
}

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
  /** やりたいこと候補（§10）。 */
  wishlist: WishlistItem[]
  /** 長期目標（§9）。 */
  goals: LongTermGoal[]
  /** プロジェクト（§9）。 */
  projects: Project[]
  /** タグ（§8.2）。 */
  tags: Tag[]
  /** 最低限モード（§23）。表示・入力を簡略化する（内部データ・計算は共通）。 */
  minimalMode: boolean
  /** 起動中の通知（§16）を有効にするか。既定 false（ユーザーの明示的な許可が必要）。 */
  notifyEnabled: boolean
  /** 開始前通知の分数（§16.1、既定5分）。 */
  notifyBeforeMinutes: number
  /** 日次振り返り通知の時刻（§16.8、`HH:mm`、既定22:00）。 */
  notifyReflectionTime: string
  /** 再スケジューリングが起きるたびに増える版番号（§16.5 の配置完了通知トリガ）。 */
  scheduleVersion: number

  /** 永続化層から全データを読み込む（初回は初期カテゴリを投入）。 */
  init(): Promise<void>
  /** ログアウト時に、読み込み済みデータを破棄して未初期化状態に戻す。 */
  reset(): void
  /** 最低限モードを切り替える（localStorage に保持）。 */
  setMinimalMode(value: boolean): void
  /** 起動中の通知の有効/無効を切り替える（localStorage に保持）。 */
  setNotifyEnabled(value: boolean): void
  /** 開始前通知の分数を設定する（localStorage に保持）。 */
  setNotifyBeforeMinutes(value: number): void
  /** 日次振り返り通知の時刻を設定する（localStorage に保持）。 */
  setNotifyReflectionTime(value: string): void
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
  /** やりたいこと候補を追加または更新する（§10）。 */
  saveWishlistItem(item: WishlistItem): Promise<void>
  /** やりたいこと候補を削除する。 */
  removeWishlistItem(id: Id): Promise<void>
  /** 長期目標を追加または更新する（§9）。 */
  saveGoal(goal: LongTermGoal): Promise<void>
  /** 長期目標を削除する。 */
  removeGoal(id: Id): Promise<void>
  /** プロジェクトを追加または更新する（§9）。 */
  saveProject(project: Project): Promise<void>
  /** プロジェクトを削除する。 */
  removeProject(id: Id): Promise<void>
  /** タグを追加または更新する（§8.2）。 */
  saveTag(tag: Tag): Promise<void>
  /** タグを削除する。 */
  removeTag(id: Id): Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  loaded: false,
  categories: [],
  definitions: [],
  records: [],
  reflections: [],
  wishlist: [],
  goals: [],
  projects: [],
  tags: [],
  minimalMode: loadMinimalMode(),
  notifyEnabled: loadNotifyEnabled(),
  notifyBeforeMinutes: loadNotifyBefore(),
  notifyReflectionTime: loadNotifyReflectionTime(),
  scheduleVersion: 0,

  setMinimalMode(value) {
    try {
      localStorage.setItem(MINIMAL_MODE_KEY, value ? '1' : '0')
    } catch {
      // localStorage 不可でも状態は更新する。
    }
    set({ minimalMode: value })
  },

  setNotifyEnabled(value) {
    try {
      localStorage.setItem(NOTIFY_ENABLED_KEY, value ? '1' : '0')
    } catch {
      // 無視して状態のみ更新。
    }
    set({ notifyEnabled: value })
  },

  setNotifyBeforeMinutes(value) {
    const v = Number.isFinite(value) && value >= 0 ? value : 5
    try {
      localStorage.setItem(NOTIFY_BEFORE_KEY, String(v))
    } catch {
      // 無視して状態のみ更新。
    }
    set({ notifyBeforeMinutes: v })
  },

  setNotifyReflectionTime(value) {
    const v = /^\d{2}:\d{2}$/.test(value) ? value : '22:00'
    try {
      localStorage.setItem(NOTIFY_REFLECTION_KEY, v)
    } catch {
      // 無視して状態のみ更新。
    }
    set({ notifyReflectionTime: v })
  },

  async init() {
    // 重複呼び出しは同じ Promise を返し、二重投入を防ぐ。
    if (initPromise) return initPromise
    initPromise = (async () => {
      // 1. クラウド（このアカウント）から読み込む。
      let data = await loadAll(repository)

      // 2. 初回ログインなら、この端末のローカル(IndexedDB)データを取り込む（アカウント単位で1回だけ）。
      const uid = (await supabase.auth.getSession()).data.session?.user?.id
      const flagKey = uid ? `${LOCAL_IMPORT_FLAG_PREFIX}${uid}` : null
      if (flagKey) {
        let alreadyImported = true
        try {
          alreadyImported = localStorage.getItem(flagKey) === '1'
        } catch {
          alreadyImported = true // localStorage 不可なら取り込みは行わない。
        }
        if (!alreadyImported) {
          try {
            if (await importLocalData()) data = await loadAll(repository) // 取り込んだら再読込。
          } catch {
            // 取り込み失敗は致命的ではない。通常起動を続ける。
          }
          try {
            localStorage.setItem(flagKey, '1')
          } catch {
            // ignore
          }
        }
      }

      // 3. まだカテゴリが無ければ初期カテゴリを投入する（§8.1）。ID固定なので冪等。
      let categories = data.categories
      if (categories.length === 0) {
        categories = buildDefaultCategories()
        await repository.categories.bulkPut(categories)
      }
      set({ ...data, categories, loaded: true })
    })()
    return initPromise
  },

  reset() {
    initPromise = null
    set({
      loaded: false,
      categories: [],
      definitions: [],
      records: [],
      reflections: [],
      wishlist: [],
      goals: [],
      projects: [],
      tags: [],
    })
  },

  async saveDefinition(def) {
    await repository.definitions.put(def)
    const prev = get().definitions.find((d) => d.id === def.id)
    const rest = get().definitions.filter((d) => d.id !== def.id)
    // §17.2: 名前・メモ等だけの変更では再計算通知を出さない。
    const bump = affectsSchedule(prev, def) ? 1 : 0
    set({ definitions: [...rest, def], scheduleVersion: get().scheduleVersion + bump })
  },

  async removeDefinition(id) {
    await repository.definitions.delete(id)
    // 削除は空き時間が変わるため常に再計算対象（§17.1）。
    set({
      definitions: get().definitions.filter((d) => d.id !== id),
      scheduleVersion: get().scheduleVersion + 1,
    })
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

  async saveWishlistItem(item) {
    await repository.wishlist.put(item)
    const rest = get().wishlist.filter((w) => w.id !== item.id)
    set({ wishlist: [...rest, item] })
  },

  async removeWishlistItem(id) {
    await repository.wishlist.delete(id)
    set({ wishlist: get().wishlist.filter((w) => w.id !== id) })
  },

  async saveGoal(goal) {
    await repository.goals.put(goal)
    const rest = get().goals.filter((g) => g.id !== goal.id)
    set({ goals: [...rest, goal] })
  },

  async removeGoal(id) {
    await repository.goals.delete(id)
    set({ goals: get().goals.filter((g) => g.id !== id) })
  },

  async saveProject(project) {
    await repository.projects.put(project)
    const rest = get().projects.filter((p) => p.id !== project.id)
    set({ projects: [...rest, project] })
  },

  async removeProject(id) {
    await repository.projects.delete(id)
    set({ projects: get().projects.filter((p) => p.id !== id) })
  },

  async saveTag(tag) {
    await repository.tags.put(tag)
    const rest = get().tags.filter((t) => t.id !== tag.id)
    set({ tags: [...rest, tag] })
  },

  async removeTag(id) {
    await repository.tags.delete(id)
    set({ tags: get().tags.filter((t) => t.id !== id) })
  },
}))
