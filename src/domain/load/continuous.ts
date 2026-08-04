/**
 * 連続負荷量の追跡と休憩の要否判定（§12 / C-2 / C-4）。
 *
 * 予定・回復区間・自由活動を時系列に畳み込み、総合累積負荷（連続負荷量）を追跡する。
 * 総合累積負荷が閾値を超えたら休憩が必要と判定する。
 *
 * 注意: 実際に休憩をタイムラインへ挿入し、後続予定をずらす処理はスケジューラ層が担う（C-4）。
 * 本モジュールは「どこで・どれだけの休憩が要るか」を判定する純粋な計算エンジン。
 */

import type { DrainEffectSetting, Minutes, RecoveryEffectSetting, ResolvedLoad } from '../types'
import type { RecoveryIntervalType } from './recovery'
import { applyRecovery } from './recovery'
import { applyFreeActivity } from './freeActivity'
import { addCumulative, cumulativeLoad, ZERO_CUMULATIVE, type CumulativeLoad } from './score'

// ---------------------------------------------------------------------------
// 状態と休憩要否（§12, §12.1）
// ---------------------------------------------------------------------------

/** 総合累積負荷の状態（§12）。 */
export type LoadState = 'normal' | 'accumulating' | 'high' | 'veryHigh'

/** 総合累積負荷の状態境界（§12）。 */
export const LOAD_STATE_THRESHOLDS = {
  /** これ以上で「負荷蓄積」。 */
  accumulating: 4.0,
  /** これ以上で「高負荷連続」（休憩を自動配置）。 */
  high: 6.0,
  /** これ以上で「非常に高い」（長めの休憩を自動配置）。 */
  veryHigh: 8.0,
} as const

/** 休憩を配置できる最小時間（§12: これ未満しか確保できなければ配置しない）。 */
export const BREAK_MIN_MINUTES: Minutes = 5

/** 総合累積負荷から状態を判定する（§12）。 */
export function loadState(total: number): LoadState {
  if (total < LOAD_STATE_THRESHOLDS.accumulating) return 'normal'
  if (total < LOAD_STATE_THRESHOLDS.high) return 'accumulating'
  if (total < LOAD_STATE_THRESHOLDS.veryHigh) return 'high'
  return 'veryHigh'
}

/** 休憩の要件（§12, §12.1）。 */
export interface BreakRequirement {
  state: LoadState
  /** 必須か（6.0以上は自動配置＝必須, §12 / C-4）。 */
  mandatory: boolean
  /** 望ましい休憩時間（分, §12.1）。空きに応じて短縮しうる。 */
  targetMinutes: Minutes
  /** これ未満しか確保できなければ配置しない（§12）。 */
  minMinutes: Minutes
}

/**
 * 総合累積負荷から休憩要件を返す。休憩不要（4.0未満）なら null。
 * - 4.0〜6.0未満: 任意・目標10分（空きがあれば短い休憩を検討, §12.1 5〜10分）
 * - 6.0〜8.0未満: 必須・15分
 * - 8.0以上: 必須・30分
 */
export function breakRequirement(total: number): BreakRequirement | null {
  const state = loadState(total)
  switch (state) {
    case 'normal':
      return null
    case 'accumulating':
      return { state, mandatory: false, targetMinutes: 10, minMinutes: BREAK_MIN_MINUTES }
    case 'high':
      return { state, mandatory: true, targetMinutes: 15, minMinutes: BREAK_MIN_MINUTES }
    case 'veryHigh':
      return { state, mandatory: true, targetMinutes: 30, minMinutes: BREAK_MIN_MINUTES }
  }
}

/**
 * 実際に配置する休憩時間を、確保できる空き時間から決める（§12 / M-1）。
 * 目標時間を上限に、空きに合わせて短縮する。5分未満しか取れなければ null（配置しない）。
 *
 * @returns 配置する休憩の分数。配置しない場合は null。
 */
export function resolveBreakMinutes(total: number, availableMinutes: Minutes): Minutes | null {
  const req = breakRequirement(total)
  if (!req) return null
  const minutes = Math.min(req.targetMinutes, availableMinutes)
  if (minutes < req.minMinutes) return null
  return minutes
}

// ---------------------------------------------------------------------------
// 時系列の畳み込み（§11.3 加算 + §13 回復 + §6 自由活動）
// ---------------------------------------------------------------------------

/** 時系列上の1区間。累積負荷を増減させる単位。 */
export type LoadSegment =
  /** 固定予定・柔軟なタスク等の負荷を伴う予定枠。分割枠はその時間で渡す。 */
  | { type: 'load'; load: ResolvedLoad; minutes: Minutes }
  /** 回復区間（休憩/睡眠/食事/入浴/未配置）。 */
  | { type: 'recovery'; interval: RecoveryIntervalType; minutes: Minutes }
  /** 自由活動。 */
  | {
      type: 'free'
      minutes: Minutes
      recoveryEffects?: readonly RecoveryEffectSetting[]
      drainEffects?: readonly DrainEffectSetting[]
    }
  /** 占有はするが累積負荷を増減しない区間（家事など, §13で回復区間に含めない）。 */
  | { type: 'neutral'; minutes: Minutes }

/** 1区間を適用した後の累積負荷を返す。 */
export function applySegment(current: CumulativeLoad, segment: LoadSegment): CumulativeLoad {
  switch (segment.type) {
    case 'load':
      return addCumulative(current, cumulativeLoad(segment.load, segment.minutes))
    case 'recovery':
      return applyRecovery(current, segment.interval, segment.minutes)
    case 'free':
      return applyFreeActivity(current, {
        durationMinutes: segment.minutes,
        recoveryEffects: segment.recoveryEffects,
        drainEffects: segment.drainEffects,
      })
    case 'neutral':
      return current
  }
}

/**
 * 時系列の区間列を順に畳み込み、最終的な累積負荷を返す。
 * @param segments 時系列順の区間列
 * @param initial 開始時点の累積負荷（既定は0＝完全リセット後, C-2）
 */
export function foldLoad(
  segments: readonly LoadSegment[],
  initial: CumulativeLoad = ZERO_CUMULATIVE,
): CumulativeLoad {
  return segments.reduce(applySegment, initial)
}

/** 畳み込みの各ステップ結果（区間適用直後の累積負荷）。 */
export interface LoadStep {
  segment: LoadSegment
  after: CumulativeLoad
}

/**
 * 各区間適用後の累積負荷の履歴を返す（休憩挿入位置の検討に使用, C-4）。
 */
export function foldLoadTrace(
  segments: readonly LoadSegment[],
  initial: CumulativeLoad = ZERO_CUMULATIVE,
): LoadStep[] {
  const steps: LoadStep[] = []
  let current = initial
  for (const segment of segments) {
    current = applySegment(current, segment)
    steps.push({ segment, after: current })
  }
  return steps
}
