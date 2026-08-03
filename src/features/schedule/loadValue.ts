/**
 * 負荷入力フォームの値ヘルパー（コンポーネントと分離し Fast Refresh 警告を避ける）。
 */

import type { LoadLevel, LoadProfile } from '../../domain/types'

/** 3項目すべてが確定した負荷（フォーム内部状態）。 */
export interface LoadValue {
  focus: LoadLevel
  mental: LoadLevel
  physical: LoadLevel
}

/** 既定値（すべて普通）。 */
export const DEFAULT_LOAD: LoadValue = { focus: 2, mental: 2, physical: 2 }

/** フォーム値を LoadProfile へ変換する（保存用）。 */
export function toLoadProfile(value: LoadValue): LoadProfile {
  return { focus: value.focus, mental: value.mental, physical: value.physical }
}

/** LoadProfile をフォーム値へ変換する（編集時の初期値）。未設定項目は既定（普通）。 */
export function fromLoadProfile(profile?: LoadProfile): LoadValue {
  return {
    focus: profile?.focus ?? DEFAULT_LOAD.focus,
    mental: profile?.mental ?? DEFAULT_LOAD.mental,
    physical: profile?.physical ?? DEFAULT_LOAD.physical,
  }
}
