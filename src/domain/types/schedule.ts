/**
 * 予定エンティティの定義（§4〜§7）。
 *
 * 設計方針:
 * - ユーザーが作成・保存する「定義」は 4 種類:
 *   固定予定 / 柔軟なタスク / 自由活動 / 生活ルーチン。
 *   これらを判別可能ユニオン `ScheduleDefinition` にまとめる。
 * - 「休憩」(§12) は負荷計算の結果システムが自動生成する配置であり、
 *   ユーザー定義ではないため、この定義ユニオンには含めない（配置レイヤで扱う）。
 * - 最低限モード(§23)対応: 両モードで必須の項目のみ必須にし、
 *   通常モードのみ必須の項目は任意 + 既定値として表現する。
 *   これにより 1 つのデータモデルで両モードを表現し、モード切替でデータを失わない。
 */

import type {
  Id,
  IsoDate,
  IsoDateTime,
  LoadProfile,
  Minutes,
  RepeatRule,
  TimeRange,
  Weekday,
} from './common'

// ---------------------------------------------------------------------------
// 予定種類
// ---------------------------------------------------------------------------

/** 予定の種類（§2）。休憩はシステム自動配置。 */
export type ScheduleKind = 'fixed' | 'flexible' | 'free' | 'routine' | 'break'

/** すべての予定定義に共通する項目。 */
export interface ScheduleBase {
  id: Id
  kind: ScheduleKind
  /** 登録日時（§5.5 の最終タイブレーク・§18 の判定に使用）。 */
  createdAt: IsoDateTime
  /** 最終更新日時。 */
  updatedAt: IsoDateTime
  /** メモ。 */
  notes?: string
  /** 付与タグ（§8.2 の細分化手段の1つ）。 */
  tagIds?: Id[]
}

// ---------------------------------------------------------------------------
// 補助的な列挙・値
// ---------------------------------------------------------------------------

/** 優先度（§5.1）。最低限モードでは任意で、未設定時は `medium` 相当として扱う（§23.3）。 */
export type Priority = 'high' | 'medium' | 'low'

/** 期限の厳しさ（§5.2 / C-3）。厳守 / できれば守る / 目安。未設定時は `preferred`。 */
export type DeadlineStrictness = 'strict' | 'preferred' | 'loose'

/** 自動配置方法（§5.2「自動配置方法」）。自動で配置 / 配置前に確認 / 候補として表示のみ。 */
export type AutoPlacement = 'auto' | 'confirm' | 'suggest'

/**
 * 固定度（§4.2）。固定予定を自動処理でどの程度動かさないか。
 * 既定は `strict`（自動的に移動しない, §25）。暫定的な区分。
 */
export type Fixity = 'strict' | 'normal' | 'flexible'

/**
 * 付随時間（§4.4）。準備・移動・終了後の余裕。
 * 自動スケジューリング上は原則占有時間として扱うが、
 * 他の予定と兼用可能かを個別に設定できる。
 */
export interface AncillaryTime {
  duration: Minutes
  /** 他の予定と兼用可能か（§4.4）。true の場合は占有を緩和できる。 */
  shareable?: boolean
}

/**
 * 予定単位の通知上書き設定（§16）。
 * 通知設定の優先順位は 個別 > 種別 > 全体（§16）。ここは最上位の個別設定。
 * 詳細な通知仕様は今後 notification 層で拡張する。
 */
export interface NotificationOverride {
  /** この予定の通知を有効にするか。false でユーザーの無効化を尊重（§25）。 */
  enabled?: boolean
  /** 予定開始前通知の分数（既定5分, §16.1）。 */
  beforeStartMinutes?: Minutes
  /** 終了通知を行うか（§16.3）。 */
  notifyOnEnd?: boolean
}

// ---------------------------------------------------------------------------
// 1. 固定予定（§4）
// ---------------------------------------------------------------------------

/**
 * 固定予定（§4）。
 * 必須（両モード, §23.2）: 予定名・日付・開始/終了時刻。
 * それ以外は任意（通常モードではカテゴリ・繰り返しも必須だが、型では任意 + 既定で表現）。
 */
export interface FixedEvent extends ScheduleBase {
  kind: 'fixed'
  name: string
  date: IsoDate
  time: TimeRange
  /** 繰り返し設定（§4.3）。未設定時は繰り返しなし。 */
  repeat?: RepeatRule
  categoryId?: Id
  /** 場所（§4.2）。 */
  place?: string
  /** 移動時間（§4.4）。 */
  travelTime?: AncillaryTime
  /** 準備時間（§4.4）。 */
  prepTime?: AncillaryTime
  /** 終了後の余裕時間（§4.4）。 */
  bufferTime?: AncillaryTime
  /** 固定度（§4.2）。 */
  fixity?: Fixity
  /** 参加の必要性（§4.2）。 */
  attendanceRequired?: boolean
  /** オンライン情報（§4.2）。会議URLなど。 */
  onlineInfo?: string
  /** 負荷の個別設定（§4.2 / §11）。未設定項目はカテゴリ→「普通」で継承。 */
  load?: LoadProfile
  projectId?: Id
  notification?: NotificationOverride
}

// ---------------------------------------------------------------------------
// 2. 柔軟なタスク（§5）
// ---------------------------------------------------------------------------

/** 関連固定予定との実行条件（§5.4）。 */
export type RelatedFixedCondition =
  /** 固定予定の開始までに完了する。 */
  | 'completeBeforeStart'
  /** 固定予定の開始前に実行する（空きがなければ配置せず警告, §5.4）。 */
  | 'doBeforeStart'
  /** 固定予定の終了後に実行する。 */
  | 'doAfterEnd'
  /** 固定予定の終了後から実行可能とする。 */
  | 'availableAfterEnd'

/** 関連する固定予定への紐付け（§5.3, §5.4）。繰り返し固定予定は直近1回が対象。 */
export interface RelatedFixedLink {
  fixedEventId: Id
  condition: RelatedFixedCondition
}

/**
 * 柔軟なタスク（§5）。
 * 必須（両モード, §23.3）: タスク名・期限・推定所要時間。
 * 分割可能な場合は最短作業時間が条件付き必須（`splittable === true` のとき `minChunk` 必須）。
 */
export interface FlexibleTask extends ScheduleBase {
  kind: 'flexible'
  name: string
  /** 期限（§5.1）。 */
  deadline: IsoDateTime
  /** 推定所要時間（§5.1）。 */
  estimatedDuration: Minutes
  /** 優先度（§5.1）。未設定時は `medium` 扱い（§23.3）。 */
  priority?: Priority
  /** 分割可能か（§5.1）。未設定時は false 扱い。 */
  splittable?: boolean
  /** 1回の最短作業時間（§5.1: 分割可能なら必須）。 */
  minChunk?: Minutes
  /** 1回の希望作業時間（§5.2）。 */
  preferredChunk?: Minutes
  /** 開始可能日（§5.2）。 */
  startableFrom?: IsoDate
  /** 実行可能曜日（§5.2）。 */
  allowedWeekdays?: Weekday[]
  /** 実行可能時間帯（§5.2）。 */
  allowedTimeRanges?: TimeRange[]
  /** 実行場所（§5.2）。 */
  place?: string
  /** 負荷の個別設定（§5.2 / §11）。 */
  load?: LoadProfile
  /** 期限の厳しさ（§5.2 / C-3）。未設定時は `preferred`。 */
  deadlineStrictness?: DeadlineStrictness
  /** 自動配置方法（§5.2）。 */
  autoPlacement?: AutoPlacement
  /** 関連する固定予定（§5.3, §5.4）。 */
  relatedFixed?: RelatedFixedLink
  categoryId?: Id
  projectId?: Id
  notification?: NotificationOverride
}

// ---------------------------------------------------------------------------
// 3. 自由活動（§6）
// ---------------------------------------------------------------------------

/** 効果の強度（§6.2）。弱い=1 / 普通=2 / 強い=3。 */
export type Intensity = 1 | 2 | 3

/** 回復効果の種類（§6.1）。 */
export type RecoveryEffect =
  /** リラックスできる */
  | 'relax'
  /** 気分転換になる */
  | 'refresh'
  /** ストレスが軽減する */
  | 'stressRelief'
  /** 達成感が得られる */
  | 'achievement'
  /** やる気が上がる */
  | 'motivation'

/** 消耗効果の種類（§6.1）。 */
export type DrainEffect =
  /** 集中力を消耗する */
  | 'focus'
  /** 精神的に疲れる */
  | 'mental'
  /** 身体的に疲れる */
  | 'physical'

/** 効果とその強度の組（§6.2）。 */
export interface RecoveryEffectSetting {
  effect: RecoveryEffect
  intensity: Intensity
}
export interface DrainEffectSetting {
  effect: DrainEffect
  intensity: Intensity
}

/**
 * 自由活動（§6）。ゲーム・ピアノ・ドライブなど。休憩とは区別する。
 * 回復効果・消耗効果とその強度から、累積負荷を増減させる（§6.3〜§6.7 / C-5）。
 */
export interface FreeActivity extends ScheduleBase {
  kind: 'free'
  name: string
  /** 活動時間（§6）。 */
  duration: Minutes
  categoryId?: Id
  place?: string
  /** 回復効果とその強度（§6.1, §6.2）。 */
  recoveryEffects?: RecoveryEffectSetting[]
  /** 消耗効果とその強度（§6.1, §6.2）。 */
  drainEffects?: DrainEffectSetting[]
  notification?: NotificationOverride
}

// ---------------------------------------------------------------------------
// 4. 生活ルーチン（§7）
// ---------------------------------------------------------------------------

/** 生活ルーチンの種類（§7）。 */
export type RoutineType =
  /** 食事 */
  | 'meal'
  /** 入浴 */
  | 'bath'
  /** 睡眠 */
  | 'sleep'
  /** 家事 */
  | 'chore'

/**
 * 生活ルーチンの1回分の設定（§7 / I-4）。
 * 各回ごとに実行可能時間帯と必要時間を個別に持つ（均等分割ではない）。
 */
export interface RoutineOccurrence {
  /** 実行可能時間帯（§7）。 */
  allowedRange: TimeRange
  /** 必要時間（§7）。確保できなければ短縮せず未配置（§7）。 */
  requiredTime: Minutes
}

/**
 * 生活ルーチン（§7）。固定予定の次に優先して自動配置される。
 * `occurrences.length` が「1日あたりの実行回数」に対応する。
 */
export interface LifeRoutine extends ScheduleBase {
  kind: 'routine'
  routineType: RoutineType
  /** 表示名（任意）。未設定なら種類名を用いる。 */
  name?: string
  /** 実行する曜日（§4.3 相当）。未設定なら毎日。 */
  activeWeekdays?: Weekday[]
  /** 1日あたりの各回設定（§7）。 */
  occurrences: RoutineOccurrence[]
  notification?: NotificationOverride
}

// ---------------------------------------------------------------------------
// 予定定義ユニオン
// ---------------------------------------------------------------------------

/**
 * ユーザーが作成・保存する予定定義（§4〜§7）。
 * 休憩(§12)はシステム生成のため含めない（配置レイヤで扱う）。
 */
export type ScheduleDefinition = FixedEvent | FlexibleTask | FreeActivity | LifeRoutine
