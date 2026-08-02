/**
 * 負荷の継承解決（§8.3 / I-3）。
 *
 * 各負荷項目（集中度・精神的負荷・身体的負荷）を、次の優先順で個別に解決する。
 *   1. 予定・タスクの個別設定
 *   2. カテゴリ設定（割り当てカテゴリから最上位へ遡り、最初に見つかった値）
 *   3. 初期値「普通」(= 2)
 *
 * 遡りは項目ごとに独立して行う（ある項目だけ個別設定、別項目はカテゴリ継承、が起こりうる）。
 */

import { LoadLevel } from '../types'
import type { Category, Id, LoadLevel as LoadLevelType, LoadProfile, ResolvedLoad } from '../types'

type Axis = keyof ResolvedLoad

const AXES: readonly Axis[] = ['focus', 'mental', 'physical']

/**
 * カテゴリの継承チェーンを、割り当てカテゴリ → 親 → … → 最上位 の順で返す。
 * 親参照が循環していても無限ループしないよう、訪問済みを記録する。
 */
export function categoryChain(
  categoryId: Id | undefined,
  categories: ReadonlyMap<Id, Category>,
): Category[] {
  const chain: Category[] = []
  const seen = new Set<Id>()
  let current = categoryId ? categories.get(categoryId) : undefined
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    chain.push(current)
    current = current.parentId ? categories.get(current.parentId) : undefined
  }
  return chain
}

/**
 * 個別設定・カテゴリ・初期値から、確定した負荷（3項目すべて）を解決する。
 *
 * @param individual 予定・タスクの個別負荷設定（任意）
 * @param categoryId 割り当てカテゴリ（任意）
 * @param categories id → カテゴリ の参照表
 */
export function resolveLoad(
  individual: LoadProfile | undefined,
  categoryId: Id | undefined,
  categories: ReadonlyMap<Id, Category>,
): ResolvedLoad {
  const chain = categoryChain(categoryId, categories)

  const resolveAxis = (axis: Axis): LoadLevelType => {
    const own = individual?.[axis]
    if (own !== undefined) return own
    for (const category of chain) {
      const inherited = category.loadDefaults?.[axis]
      if (inherited !== undefined) return inherited
    }
    return LoadLevel.Normal
  }

  return {
    focus: resolveAxis('focus'),
    mental: resolveAxis('mental'),
    physical: resolveAxis('physical'),
  }
}

/** 負荷計算で扱う軸の一覧（外部からの反復用）。 */
export { AXES as loadAxes }
