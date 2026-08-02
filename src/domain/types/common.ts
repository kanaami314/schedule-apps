/**
 * ドメイン共通の基本型。
 *
 * 仕様書 `time_scheduler_requirements.md` の各章に対応する型をここに定義する。
 * 識別子は英語、コメントで日本語の仕様用語と章番号を併記する。
 */

/** エンティティの一意識別子（UUID 文字列を想定）。 */
export type Id = string

// ---------------------------------------------------------------------------
// 時間の表現
// ---------------------------------------------------------------------------

/**
 * 分単位の時間量（所要時間・移動時間・必要時間など）。
 * 累積負荷計算では「時間単位」を用いるため、必要に応じて 60 で割って変換する（§11.3 / C-1）。
 */
export type Minutes = number

/** ローカル日付。ISO 8601 の `YYYY-MM-DD` 形式。 */
export type IsoDate = string

/** ローカル時刻。`HH:mm` 形式（24時間表記）。 */
export type IsoTime = string

/** ローカル日時。ISO 8601 の `YYYY-MM-DDTHH:mm` 形式（タイムゾーンなし＝端末ローカル）。 */
export type IsoDateTime = string

/**
 * 時刻の範囲（開始・終了）。同日内の `HH:mm` を保持する。
 * 日をまたぐ範囲は配置側で `IsoDateTime` に展開して扱う。
 */
export interface TimeRange {
  /** 開始時刻 `HH:mm`。 */
  start: IsoTime
  /** 終了時刻 `HH:mm`。 */
  end: IsoTime
}

// ---------------------------------------------------------------------------
// 曜日・繰り返し（§4.3）
// ---------------------------------------------------------------------------

/** 曜日。0=日曜 〜 6=土曜（JavaScript の `Date.getDay()` と一致）。 */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

/**
 * 繰り返し設定（§4.3）。
 * 毎週・隔週などでは曜日を指定できる。判別可能ユニオンで表現する。
 */
export type RepeatRule =
  | { kind: 'none' }
  | { kind: 'daily' }
  /** 毎週：指定曜日に繰り返す。 */
  | { kind: 'weekly'; weekdays: Weekday[] }
  /**
   * 隔週：指定曜日に、基準日を起点として1週おきに繰り返す。
   * `anchorDate` を基準に「何週目か」を判定する。
   */
  | { kind: 'biweekly'; weekdays: Weekday[]; anchorDate: IsoDate }
  /** 毎月：指定日（1〜31）に繰り返す。 */
  | { kind: 'monthly'; dayOfMonth: number }

// ---------------------------------------------------------------------------
// 負荷（§8.3 / §11）
// ---------------------------------------------------------------------------

/**
 * 負荷レベルの数値化（§11.1）。
 * 低い=1 / 普通=2 / 高い=3。
 */
export type LoadLevel = 1 | 2 | 3

/** 負荷レベルの意味を表す定数。 */
export const LoadLevel = {
  /** 低い */
  Low: 1,
  /** 普通 */
  Normal: 2,
  /** 高い */
  High: 3,
} as const satisfies Record<string, LoadLevel>

/**
 * 負荷プロファイル（未解決）。
 *
 * 予定・タスク・カテゴリに個別設定される負荷。各項目は任意で、
 * 未設定の項目は継承（個別 → カテゴリ → 初期値「普通」, §8.3 / I-3）で解決する。
 */
export interface LoadProfile {
  /** 必要な集中度。 */
  focus?: LoadLevel
  /** 精神的負荷。 */
  mental?: LoadLevel
  /** 身体的負荷。 */
  physical?: LoadLevel
}

/**
 * 継承適用後の負荷（解決済み）。3項目すべてが確定している。
 * 負荷計算（単位負荷量・累積負荷量, §11）はこの型を入力とする。
 */
export interface ResolvedLoad {
  focus: LoadLevel
  mental: LoadLevel
  physical: LoadLevel
}
