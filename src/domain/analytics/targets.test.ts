import { describe, expect, it } from 'vitest'
import type { Category } from '../types'
import { validateTargetChange } from './targets'

const cat = (id: string, partial: Partial<Category> = {}): Category => ({ id, name: id, ...partial })

describe('validateTargetChange（§20.6）', () => {
  const base: Category[] = [
    cat('parent', { weeklyTargetMinutes: 600 }),
    cat('childA', { parentId: 'parent', weeklyTargetMinutes: 300 }),
    cat('childB', { parentId: 'parent', weeklyTargetMinutes: 200 }),
  ]

  it('親の目標が子合計以上なら許可', () => {
    expect(validateTargetChange(base, 'parent', 'weeklyTargetMinutes', 500).ok).toBe(true)
  })

  it('親の目標が子合計を下回ると拒否', () => {
    const r = validateTargetChange(base, 'parent', 'weeklyTargetMinutes', 400) // 子合計500
    expect(r.ok).toBe(false)
  })

  it('子＋兄弟が親の目標を超えると拒否', () => {
    // childA を 500 に → 500 + childB200 = 700 > 親600
    expect(validateTargetChange(base, 'childA', 'weeklyTargetMinutes', 500).ok).toBe(false)
  })

  it('子＋兄弟が親の目標以内なら許可', () => {
    expect(validateTargetChange(base, 'childA', 'weeklyTargetMinutes', 350).ok).toBe(true) // 350+200=550<=600
  })

  it('親に目標が無ければ子は制約なし', () => {
    const noParentTarget: Category[] = [
      cat('p'),
      cat('c', { parentId: 'p' }),
    ]
    expect(validateTargetChange(noParentTarget, 'c', 'weeklyTargetMinutes', 9999).ok).toBe(true)
  })

  it('クリア（undefined）は常に許可', () => {
    expect(validateTargetChange(base, 'parent', 'weeklyTargetMinutes', undefined).ok).toBe(true)
  })
})
