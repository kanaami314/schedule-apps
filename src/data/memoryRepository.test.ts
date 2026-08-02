import { describe, expect, it } from 'vitest'
import type { Category, FixedEvent } from '../domain/types'
import { createMemoryRepository } from './memoryRepository'

const category = (id: string, name: string): Category => ({ id, name })

const fixed = (id: string, name: string): FixedEvent => ({
  id,
  kind: 'fixed',
  createdAt: '2026-08-02T10:00',
  updatedAt: '2026-08-02T10:00',
  name,
  date: '2026-08-03',
  time: { start: '10:00', end: '11:00' },
})

describe('memoryRepository — Collection の契約', () => {
  it('put / get / all で保存・取得できる', async () => {
    const repo = createMemoryRepository()
    await repo.categories.put(category('c1', '研究'))
    expect(await repo.categories.get('c1')).toEqual(category('c1', '研究'))
    expect(await repo.categories.all()).toHaveLength(1)
  })

  it('同じ id への put は上書き（upsert）', async () => {
    const repo = createMemoryRepository()
    await repo.categories.put(category('c1', '研究'))
    await repo.categories.put(category('c1', '実験'))
    expect((await repo.categories.get('c1'))?.name).toBe('実験')
    expect(await repo.categories.all()).toHaveLength(1)
  })

  it('bulkPut で複数保存できる', async () => {
    const repo = createMemoryRepository()
    await repo.categories.bulkPut([category('a', 'A'), category('b', 'B')])
    expect(await repo.categories.all()).toHaveLength(2)
  })

  it('delete で削除、存在しない id でもエラーにしない', async () => {
    const repo = createMemoryRepository()
    await repo.categories.put(category('c1', '研究'))
    await repo.categories.delete('c1')
    await repo.categories.delete('missing')
    expect(await repo.categories.get('c1')).toBeUndefined()
  })

  it('未登録 id の get は undefined', async () => {
    const repo = createMemoryRepository()
    expect(await repo.categories.get('none')).toBeUndefined()
  })

  it('コレクションは互いに独立している', async () => {
    const repo = createMemoryRepository()
    await repo.categories.put(category('c1', '研究'))
    await repo.definitions.put(fixed('f1', 'ゼミ'))
    expect(await repo.categories.all()).toHaveLength(1)
    expect(await repo.definitions.all()).toHaveLength(1)
    await repo.categories.clear()
    expect(await repo.categories.all()).toHaveLength(0)
    expect(await repo.definitions.all()).toHaveLength(1)
  })

  it('判別可能ユニオンの定義を保存・取得できる', async () => {
    const repo = createMemoryRepository()
    await repo.definitions.put(fixed('f1', 'ゼミ'))
    const got = await repo.definitions.get('f1')
    expect(got?.kind).toBe('fixed')
    expect(got?.name).toBe('ゼミ')
  })
})
