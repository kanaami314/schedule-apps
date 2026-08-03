/**
 * 通知時刻の算出（§16）。当日のタイムラインから、いつ・何を通知するかを求める純関数。
 *
 * 実配信は「アプリ起動中／Service Worker 生存中」に限定する（M-4）。
 * 通知ロジックはデータとして保持し、将来サーバー移行時に真のバックグラウンド通知へ拡張する。
 *
 * 種別ごとの通知（§16.1/§16.2）:
 * - 固定予定: 準備開始 / 移動開始 / 開始前 / 開始時刻
 * - その他（柔軟タスク・自由活動・生活ルーチン・休憩）: 開始前 / 開始時刻
 * 準備・移動の起点は「準備→移動→開始」の順とみなす（準備開始 = 開始 − 準備 − 移動）。
 */

/** 通知1件。`atMin` は当日 00:00 からの分。 */
export interface NotifyEvent {
  /** 発火時刻（当日 00:00 からの分）。 */
  atMin: number
  title: string
  body: string
}

/** 通知計算の入力となる、当日の1予定。 */
export interface PlanNotifyInput {
  label: string
  /** 開始時刻（当日 00:00 からの分）。 */
  startMin: number
  /** 開始前通知の分数（§16.1、既定5分）。0 以下なら開始前通知なし。 */
  beforeMin: number
  /** 準備時間（分, 固定予定のみ）。 */
  prepMin?: number
  /** 移動時間（分, 固定予定のみ）。 */
  travelMin?: number
}

/**
 * 当日の予定群から、基準時刻(`nowMin`)以降に発火する通知イベントを求める。
 * 過去の時刻の通知は除外し、`atMin` 昇順で返す。
 */
export function planNotifications(
  plans: readonly PlanNotifyInput[],
  nowMin: number,
): NotifyEvent[] {
  const events: NotifyEvent[] = []
  for (const plan of plans) {
    const prep = plan.prepMin ?? 0
    const travel = plan.travelMin ?? 0
    if (prep > 0) {
      events.push({
        atMin: plan.startMin - prep - travel,
        title: '準備開始',
        body: `${plan.label} の準備を始める時刻です`,
      })
    }
    if (travel > 0) {
      events.push({
        atMin: plan.startMin - travel,
        title: '移動開始',
        body: `${plan.label} へ移動を始める時刻です`,
      })
    }
    if (plan.beforeMin > 0) {
      events.push({
        atMin: plan.startMin - plan.beforeMin,
        title: 'まもなく開始',
        body: `${plan.label}（${plan.beforeMin}分後に開始）`,
      })
    }
    events.push({ atMin: plan.startMin, title: '開始時刻', body: plan.label })
  }
  return events
    .filter((e) => e.atMin >= nowMin)
    .sort((a, b) => a.atMin - b.atMin)
}
