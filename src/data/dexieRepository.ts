/**
 * Dexie/IndexedDB を用いたリポジトリ実装（本番）。
 * `Collection<T>` を Dexie の Table へ委譲する薄いアダプタ。
 */

import type { Table } from 'dexie'
import type { Id } from '../domain/types'
import { AppDatabase, db as defaultDb } from './db'
import type { AppRepository, Collection } from './repository'

class TableCollection<T extends { id: Id }> implements Collection<T> {
  private readonly table: Table<T, Id>

  constructor(table: Table<T, Id>) {
    this.table = table
  }

  async all(): Promise<T[]> {
    return this.table.toArray()
  }

  async get(id: Id): Promise<T | undefined> {
    return this.table.get(id)
  }

  async put(item: T): Promise<void> {
    await this.table.put(item)
  }

  async bulkPut(items: readonly T[]): Promise<void> {
    await this.table.bulkPut(items as T[])
  }

  async delete(id: Id): Promise<void> {
    await this.table.delete(id)
  }

  async clear(): Promise<void> {
    await this.table.clear()
  }
}

/** Dexie データベースからリポジトリを生成する。既定は共有の `db` インスタンス。 */
export function createDexieRepository(database: AppDatabase = defaultDb): AppRepository {
  return {
    categories: new TableCollection(database.categories),
    definitions: new TableCollection(database.definitions),
    projects: new TableCollection(database.projects),
    goals: new TableCollection(database.goals),
    tags: new TableCollection(database.tags),
    wishlist: new TableCollection(database.wishlist),
    records: new TableCollection(database.records),
    reflections: new TableCollection(database.reflections),
  }
}
