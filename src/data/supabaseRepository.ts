/**
 * Supabase(PostgreSQL) を用いたリポジトリ実装（サーバー主導）。
 *
 * 各コレクションは (user_id, id, data jsonb, version, updated_at) の共通テーブルへ対応。
 * - 読み取り: `select data`（RLS が自分の行だけに絞る）。
 * - 書き込み: `put_row` RPC（version付き原子的 upsert）。
 * - 一括投入: `bulk_put` RPC。
 * アカウント間の分離は DB 側の RLS が強制するため、クライアントは user_id を意識しない。
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Id } from '../domain/types'
import type { AppRepository, Collection } from './repository'

/** data JSONB を保持する行。 */
interface Row<T> {
  data: T
}

class SupabaseCollection<T extends { id: Id }> implements Collection<T> {
  private readonly client: SupabaseClient
  private readonly table: string

  constructor(client: SupabaseClient, table: string) {
    this.client = client
    this.table = table
  }

  async all(): Promise<T[]> {
    const { data, error } = await this.client.from(this.table).select('data')
    if (error) throw error
    return (data as Row<T>[]).map((r) => r.data)
  }

  async get(id: Id): Promise<T | undefined> {
    const { data, error } = await this.client
      .from(this.table)
      .select('data')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    return (data as Row<T> | null)?.data
  }

  async put(item: T): Promise<void> {
    // p_expected_version=null: バージョン確認なしの upsert（原子的・RLS 適用）。
    const { error } = await this.client.rpc('put_row', {
      p_table: this.table,
      p_id: item.id,
      p_data: item,
      p_expected_version: null,
    })
    if (error) throw error
  }

  async bulkPut(items: readonly T[]): Promise<void> {
    if (items.length === 0) return
    const { error } = await this.client.rpc('bulk_put', {
      p_table: this.table,
      p_rows: items.map((i) => ({ id: i.id, data: i })),
    })
    if (error) throw error
  }

  async delete(id: Id): Promise<void> {
    const { error } = await this.client.from(this.table).delete().eq('id', id)
    if (error) throw error
  }

  async clear(): Promise<void> {
    // 自分の全行を削除（RLS で他人の行は対象外）。gte '' で全 id を対象にする。
    const { error } = await this.client.from(this.table).delete().gte('id', '')
    if (error) throw error
  }
}

/** Supabase クライアントからリポジトリを生成する（認証済みセッション前提）。 */
export function createSupabaseRepository(client: SupabaseClient): AppRepository {
  const c = <T extends { id: Id }>(table: string) => new SupabaseCollection<T>(client, table)
  return {
    categories: c('categories'),
    definitions: c('definitions'),
    projects: c('projects'),
    goals: c('goals'),
    tags: c('tags'),
    wishlist: c('wishlist'),
    records: c('records'),
    reflections: c('reflections'),
  }
}
