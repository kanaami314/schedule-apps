import { describe, expect, it } from 'vitest'
import { planNotifications } from './schedule'

describe('planNotifications', () => {
  it('開始前と開始時刻の通知を出す（既定の予定）', () => {
    const events = planNotifications([{ label: 'ゼミ', startMin: 600, beforeMin: 5 }], 0)
    expect(events).toEqual([
      { atMin: 595, title: 'まもなく開始', body: 'ゼミ（5分後に開始）' },
      { atMin: 600, title: '開始時刻', body: 'ゼミ' },
    ])
  })

  it('固定予定は準備開始・移動開始も出す（準備→移動→開始の順）', () => {
    const events = planNotifications(
      [{ label: '会議', startMin: 600, beforeMin: 5, prepMin: 15, travelMin: 30 }],
      0,
    )
    // 準備開始 = 600-15-30 = 555、移動開始 = 600-30 = 570、開始前 = 595、開始 = 600
    expect(events.map((e) => e.atMin)).toEqual([555, 570, 595, 600])
    expect(events[0].title).toBe('準備開始')
    expect(events[1].title).toBe('移動開始')
  })

  it('基準時刻より前の通知は除外する', () => {
    const events = planNotifications([{ label: 'ゼミ', startMin: 600, beforeMin: 5 }], 596)
    expect(events).toEqual([{ atMin: 600, title: '開始時刻', body: 'ゼミ' }])
  })

  it('開始前分が0なら開始前通知を出さない', () => {
    const events = planNotifications([{ label: '休憩', startMin: 600, beforeMin: 0 }], 0)
    expect(events).toEqual([{ atMin: 600, title: '開始時刻', body: '休憩' }])
  })

  it('複数予定を atMin 昇順にまとめる', () => {
    const events = planNotifications(
      [
        { label: 'B', startMin: 700, beforeMin: 5 },
        { label: 'A', startMin: 600, beforeMin: 5 },
      ],
      0,
    )
    expect(events.map((e) => e.atMin)).toEqual([595, 600, 695, 700])
  })
})
