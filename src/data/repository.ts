/**
 * ストレージ非依存のリポジトリ抽象。
 *
 * UI・ドメインロジックはこのインターフェースにのみ依存する。
 * 実装は差し替え可能:
 *   - インメモリ（テスト・開発用）: `createMemoryRepository`
 *   - Dexie/IndexedDB（本番, GitHub Pages 等の静的ホスティング）: `createDexieRepository`
 *   - 将来のサーバーバックエンド: 同インターフェースを満たす別実装
 */

import type {
  ActivityRecord,
  Category,
  Id,
  LongTermGoal,
  Project,
  ScheduleDefinition,
  Tag,
  WishlistItem,
} from '../domain/types'

/** id を持つエンティティの汎用コレクション（非同期CRUD）。 */
export interface Collection<T extends { id: Id }> {
  /** 全件取得。 */
  all(): Promise<T[]>
  /** id で1件取得。存在しなければ undefined。 */
  get(id: Id): Promise<T | undefined>
  /** 追加または更新（upsert）。 */
  put(item: T): Promise<void>
  /** 複数の追加または更新。 */
  bulkPut(items: readonly T[]): Promise<void>
  /** id で削除。存在しなくてもエラーにしない。 */
  delete(id: Id): Promise<void>
  /** 全件削除。 */
  clear(): Promise<void>
}

/** アプリ全体のデータアクセス入口。 */
export interface AppRepository {
  categories: Collection<Category>
  /** 予定定義4種（固定予定/柔軟なタスク/自由活動/生活ルーチン）。 */
  definitions: Collection<ScheduleDefinition>
  projects: Collection<Project>
  goals: Collection<LongTermGoal>
  tags: Collection<Tag>
  wishlist: Collection<WishlistItem>
  /** 実績記録（§14）。 */
  records: Collection<ActivityRecord>
}
