/**
 * 長期目標・プロジェクト・タグ・やりたいこと候補（§9, §10）。
 */

import type { Id } from './common'

/**
 * 長期目標（§9）。
 * 任意登録・複数作成可。予定として自動配置はしない。
 */
export interface LongTermGoal {
  id: Id
  name: string
  memo?: string
}

/**
 * プロジェクト（§9）。
 * - 最大1つの長期目標に関連付けられる（`goalId`）。
 * - 複数の柔軟なタスクを関連付けられる（逆参照はタスク側の `projectId`）。
 * - 予定として自動配置はしない。
 */
export interface Project {
  id: Id
  name: string
  /** 関連する長期目標（最大1つ）。 */
  goalId?: Id
  memo?: string
}

/** タグ。予定・タスクに複数付与できる自由分類。 */
export interface Tag {
  id: Id
  name: string
  color?: string
}

/**
 * やりたいこと候補（§10）。
 * 登録項目は候補名のみ。自動配置・推薦には使用しない。
 * ここから予定を作成できる（テンプレート引き継ぎは作成フロー側で扱う）。
 */
export interface WishlistItem {
  id: Id
  /** 候補名。 */
  name: string
}
