/** ID生成と日時のユーティリティ。 */

import type { IsoDateTime } from '../domain/types'

/** 一意なID（UUID）を生成する。 */
export function newId(): string {
  return crypto.randomUUID()
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** 現在のローカル日時を `YYYY-MM-DDTHH:mm` 形式で返す。 */
export function nowLocalIso(): IsoDateTime {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
