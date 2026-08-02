/**
 * インメモリのリポジトリ実装（テスト・開発用）。
 * データは Map に保持し、永続化しない。返り値はコピーではなく参照なので、
 * 呼び出し側は取得したオブジェクトを直接変更しないこと。
 */

import type { Id } from '../domain/types'
import type { AppRepository, Collection } from './repository'

class MapCollection<T extends { id: Id }> implements Collection<T> {
  private readonly store = new Map<Id, T>()

  async all(): Promise<T[]> {
    return [...this.store.values()]
  }

  async get(id: Id): Promise<T | undefined> {
    return this.store.get(id)
  }

  async put(item: T): Promise<void> {
    this.store.set(item.id, item)
  }

  async bulkPut(items: readonly T[]): Promise<void> {
    for (const item of items) this.store.set(item.id, item)
  }

  async delete(id: Id): Promise<void> {
    this.store.delete(id)
  }

  async clear(): Promise<void> {
    this.store.clear()
  }
}

/** インメモリのリポジトリを生成する。 */
export function createMemoryRepository(): AppRepository {
  return {
    categories: new MapCollection(),
    definitions: new MapCollection(),
    projects: new MapCollection(),
    goals: new MapCollection(),
    tags: new MapCollection(),
    wishlist: new MapCollection(),
  }
}
