import { describe, expect, it } from 'vitest'
import type { Category } from '../types'
import { LoadLevel } from '../types'
import { categoryChain, resolveLoad } from './inheritance'

function makeCategories(list: Category[]): Map<string, Category> {
  return new Map(list.map((c) => [c.id, c]))
}

describe('resolveLoad (§8.3 / I-3)', () => {
  it('個別設定を最優先する', () => {
    const cats = makeCategories([{ id: 'c1', name: '研究', loadDefaults: { focus: 1, mental: 1 } }])
    const resolved = resolveLoad({ focus: 3 }, 'c1', cats)
    // focus は個別の 3、mental はカテゴリの 1、physical はどこにもないので普通(2)
    expect(resolved).toEqual({ focus: 3, mental: 1, physical: LoadLevel.Normal })
  })

  it('項目ごとに独立して継承する（親カテゴリへ遡る）', () => {
    const cats = makeCategories([
      { id: 'parent', name: '研究', loadDefaults: { focus: 3, physical: 1 } },
      { id: 'child', name: '実験', parentId: 'parent', loadDefaults: { mental: 3 } },
    ])
    const resolved = resolveLoad(undefined, 'child', cats)
    // mental は子(3)、focus/physical は子になく親(3,1)へ遡る
    expect(resolved).toEqual({ focus: 3, mental: 3, physical: 1 })
  })

  it('個別・カテゴリともに無ければすべて普通(2)', () => {
    const cats = makeCategories([{ id: 'c1', name: '交友' }])
    expect(resolveLoad(undefined, 'c1', cats)).toEqual({ focus: 2, mental: 2, physical: 2 })
  })

  it('カテゴリ未指定でも普通(2)にフォールバックする', () => {
    expect(resolveLoad(undefined, undefined, new Map())).toEqual({
      focus: 2,
      mental: 2,
      physical: 2,
    })
  })

  it('子が値を持てば親を見ない', () => {
    const cats = makeCategories([
      { id: 'parent', name: '研究', loadDefaults: { focus: 1 } },
      { id: 'child', name: '実験', parentId: 'parent', loadDefaults: { focus: 3 } },
    ])
    expect(resolveLoad(undefined, 'child', cats).focus).toBe(3)
  })
})

describe('categoryChain', () => {
  it('割り当て→親→最上位の順に並ぶ', () => {
    const cats = makeCategories([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B', parentId: 'a' },
      { id: 'c', name: 'C', parentId: 'b' },
    ])
    expect(categoryChain('c', cats).map((c) => c.id)).toEqual(['c', 'b', 'a'])
  })

  it('親参照が循環しても無限ループしない', () => {
    const cats = makeCategories([
      { id: 'x', name: 'X', parentId: 'y' },
      { id: 'y', name: 'Y', parentId: 'x' },
    ])
    expect(categoryChain('x', cats).map((c) => c.id)).toEqual(['x', 'y'])
  })
})
