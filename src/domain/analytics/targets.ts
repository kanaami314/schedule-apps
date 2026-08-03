/**
 * カテゴリ目標時間の制約チェック（§20.6）。
 *
 * 制約: 子カテゴリの目標時間合計は、親カテゴリの目標時間を超えてはならない。
 * 矛盾する設定は登録できない。目標のクリア（未設定/0）は常に許可（制約を緩める方向）。
 */

import type { Category, Id, Minutes } from '../types'

export type TargetField = 'weeklyTargetMinutes' | 'monthlyTargetMinutes'

export interface TargetValidation {
  ok: boolean
  reason?: string
}

/**
 * カテゴリ `id` の目標(`field`)を `minutes` に変更してよいかを検証する。
 * - このカテゴリが親の場合: 新目標は子の目標合計以上でなければならない。
 * - このカテゴリが子の場合: 兄弟＋自分の目標合計が親の目標を超えてはならない。
 */
export function validateTargetChange(
  categories: readonly Category[],
  id: Id,
  field: TargetField,
  minutes: Minutes | undefined,
): TargetValidation {
  const target = categories.find((c) => c.id === id)
  if (!target) return { ok: false, reason: 'カテゴリが見つかりません' }

  // 親としての制約: 子の合計を下回らない。
  const children = categories.filter((c) => c.parentId === id)
  if (children.length > 0 && minutes != null) {
    const childSum = children.reduce((s, c) => s + (c[field] ?? 0), 0)
    if (minutes < childSum) {
      return { ok: false, reason: `子カテゴリの目標合計（${childSum}分）を下回れません` }
    }
  }

  // 子としての制約: 兄弟＋自分の合計が親の目標を超えない。
  if (target.parentId) {
    const parent = categories.find((c) => c.id === target.parentId)
    const parentTarget = parent?.[field]
    if (parentTarget != null) {
      const siblingSum = categories
        .filter((c) => c.parentId === target.parentId && c.id !== id)
        .reduce((s, c) => s + (c[field] ?? 0), 0)
      if ((minutes ?? 0) + siblingSum > parentTarget) {
        return { ok: false, reason: `親カテゴリの目標（${parentTarget}分）を超えます` }
      }
    }
  }

  return { ok: true }
}
