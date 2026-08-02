import { describe, expect, it } from 'vitest'
import { LoadLevel } from './common'
import type {
  Category,
  FixedEvent,
  FlexibleTask,
  FreeActivity,
  LifeRoutine,
  ScheduleDefinition,
} from './index'

/**
 * 型定義がドメインの代表的なデータを表現できることの最小確認。
 * （主目的は型のコンパイル検証。実行時アサーションは軽微。）
 */
describe('domain types', () => {
  it('LoadLevel constants map to 1/2/3', () => {
    expect([LoadLevel.Low, LoadLevel.Normal, LoadLevel.High]).toEqual([1, 2, 3])
  })

  it('can build a minimal-mode fixed event (name/date/time only)', () => {
    const e: FixedEvent = {
      id: 'f1',
      kind: 'fixed',
      createdAt: '2026-08-02T10:00',
      updatedAt: '2026-08-02T10:00',
      name: '研究ミーティング',
      date: '2026-08-03',
      time: { start: '10:00', end: '11:30' },
    }
    expect(e.kind).toBe('fixed')
  })

  it('can build a splittable flexible task with related fixed event', () => {
    const t: FlexibleTask = {
      id: 't1',
      kind: 'flexible',
      createdAt: '2026-08-02T10:00',
      updatedAt: '2026-08-02T10:00',
      name: '発表資料を作成',
      deadline: '2026-08-05T09:00',
      estimatedDuration: 180,
      priority: 'high',
      splittable: true,
      minChunk: 30,
      deadlineStrictness: 'strict',
      relatedFixed: { fixedEventId: 'f1', condition: 'completeBeforeStart' },
      load: { focus: LoadLevel.High, mental: LoadLevel.High },
    }
    expect(t.splittable).toBe(true)
  })

  it('can build a free activity with recovery and drain effects', () => {
    const a: FreeActivity = {
      id: 'a1',
      kind: 'free',
      createdAt: '2026-08-02T10:00',
      updatedAt: '2026-08-02T10:00',
      name: 'ゲーム',
      duration: 60,
      recoveryEffects: [
        { effect: 'refresh', intensity: 3 },
        { effect: 'achievement', intensity: 2 },
      ],
      drainEffects: [{ effect: 'focus', intensity: 2 }],
    }
    expect(a.recoveryEffects).toHaveLength(2)
  })

  it('can build a life routine with multiple occurrences', () => {
    const r: LifeRoutine = {
      id: 'r1',
      kind: 'routine',
      createdAt: '2026-08-02T10:00',
      updatedAt: '2026-08-02T10:00',
      routineType: 'meal',
      occurrences: [
        { allowedRange: { start: '06:00', end: '10:00' }, requiredTime: 30 },
        { allowedRange: { start: '11:00', end: '15:00' }, requiredTime: 45 },
        { allowedRange: { start: '17:00', end: '22:00' }, requiredTime: 60 },
      ],
    }
    expect(r.occurrences).toHaveLength(3)
  })

  it('discriminated union narrows on kind', () => {
    const items: ScheduleDefinition[] = []
    const category: Category = { id: 'c1', name: '研究' }
    expect(items).toHaveLength(0)
    expect(category.name).toBe('研究')
  })
})
