import { describe, expect, it } from 'vitest'
import {
  duration,
  freeGaps,
  mergeIntervals,
  overlaps,
  totalDuration,
  type Interval,
} from './intervals'

const iv = (start: number, end: number): Interval => ({ start, end })

describe('duration / overlaps', () => {
  it('duration は長さ、負は0', () => {
    expect(duration(iv(60, 90))).toBe(30)
    expect(duration(iv(90, 60))).toBe(0)
  })
  it('overlaps は境界接触を含まない', () => {
    expect(overlaps(iv(0, 60), iv(30, 90))).toBe(true)
    expect(overlaps(iv(0, 60), iv(60, 90))).toBe(false)
  })
})

describe('mergeIntervals', () => {
  it('重なり・隣接を結合する', () => {
    expect(mergeIntervals([iv(0, 30), iv(30, 60), iv(50, 70)])).toEqual([iv(0, 70)])
  })
  it('離れた区間はそのまま、start昇順', () => {
    expect(mergeIntervals([iv(100, 120), iv(0, 30)])).toEqual([iv(0, 30), iv(100, 120)])
  })
})

describe('freeGaps', () => {
  const day = iv(0, 1440) // 1日

  it('占有なしなら window 全体', () => {
    expect(freeGaps(day, [])).toEqual([day])
  })

  it('占有区間の前後に空きを返す', () => {
    // 9:00-10:30 と 13:00-14:00 が埋まっている
    const busy = [iv(540, 630), iv(780, 840)]
    expect(freeGaps(day, busy)).toEqual([iv(0, 540), iv(630, 780), iv(840, 1440)])
  })

  it('window 外や重なる占有を正しく丸める', () => {
    const window = iv(600, 720) // 10:00-12:00
    const busy = [iv(0, 660), iv(700, 900)] // 前後にはみ出す
    expect(freeGaps(window, busy)).toEqual([iv(660, 700)])
  })

  it('隙間なく埋まっていれば空配列', () => {
    expect(freeGaps(iv(0, 100), [iv(0, 50), iv(50, 100)])).toEqual([])
  })

  it('totalDuration で空きの合計を測れる', () => {
    const gaps = freeGaps(iv(0, 100), [iv(20, 40)])
    expect(totalDuration(gaps)).toBe(80)
  })
})
