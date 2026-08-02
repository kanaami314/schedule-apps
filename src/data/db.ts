/**
 * Dexie（IndexedDB）スキーマ定義。
 *
 * GitHub Pages 等の静的ホスティングではサーバーを持てないため、
 * データはブラウザ内の IndexedDB に保存する（将来サーバーへ差し替え可能, README 参照）。
 */

import Dexie, { type Table } from 'dexie'
import type {
  Category,
  Id,
  LongTermGoal,
  Project,
  ScheduleDefinition,
  Tag,
  WishlistItem,
} from '../domain/types'

export class AppDatabase extends Dexie {
  categories!: Table<Category, Id>
  definitions!: Table<ScheduleDefinition, Id>
  projects!: Table<Project, Id>
  goals!: Table<LongTermGoal, Id>
  tags!: Table<Tag, Id>
  wishlist!: Table<WishlistItem, Id>

  constructor(name = 'schedule-app') {
    super(name)
    // インデックス: 主キー id と、絞り込みに使う項目。
    // ('kind' や 'categoryId' は判別可能ユニオンの一部にのみ存在するが、
    //  Dexie は値が存在するレコードだけをインデックスするため問題ない。)
    this.version(1).stores({
      categories: 'id, parentId',
      definitions: 'id, kind, categoryId, projectId',
      projects: 'id, goalId',
      goals: 'id',
      tags: 'id',
      wishlist: 'id',
    })
  }
}

/** 既定のデータベースインスタンス（ブラウザ実行時に使用）。 */
export const db = new AppDatabase()
