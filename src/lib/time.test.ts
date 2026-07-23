import { describe, expect, it } from 'vitest'
import {
  parseWallClock, toInstant, startInstant, endInstant, statusAt, formatCountdown,
} from './time'
import type { TimelineEvent } from '../types'

const ev = (over: Partial<TimelineEvent>): TimelineEvent => ({
  id: 'x', name: 'x', lane: 'event',
  start: '2026-07-21 18:00:00', end: '2026-08-11 14:59:00',
  clock: 'server', color: '#fff', source: 'calendar',
  ...over,
})

describe('parseWallClock', () => {
  it('reads the string as UTC parts, not local time', () => {
    expect(parseWallClock('2026-07-21 18:00:00')).toBe(Date.UTC(2026, 6, 21, 18, 0, 0))
  })

  it('handles a midnight boundary', () => {
    expect(parseWallClock('2026-01-01 00:00:00')).toBe(Date.UTC(2026, 0, 1, 0, 0, 0))
  })

  it('throws on a malformed string rather than returning NaN', () => {
    expect(() => parseWallClock('2026-07-21T18:00:00Z')).toThrow(/wall clock/i)
    expect(() => parseWallClock('')).toThrow(/wall clock/i)
  })
})

describe('toInstant', () => {
  it('resolves an absolute clock to the same instant on every server', () => {
    const asia = toInstant('2026-07-21 18:00:00', 'absolute', 'asia')
    const eu = toInstant('2026-07-21 18:00:00', 'absolute', 'europe')
    const us = toInstant('2026-07-21 18:00:00', 'absolute', 'america')
    expect(eu).toBe(asia)
    expect(us).toBe(asia)
  })

  it('stores an absolute clock as Asia +8', () => {
    expect(toInstant('2026-07-21 18:00:00', 'absolute', 'europe'))
      .toBe(Date.UTC(2026, 6, 21, 10, 0, 0))
  })

  it('staggers a server clock by the viewer server offset', () => {
    const asia = toInstant('2026-07-24 10:00:00', 'server', 'asia')
    const eu = toInstant('2026-07-24 10:00:00', 'server', 'europe')
    expect(eu - asia).toBe(7 * 3_600_000)
  })

  it('treats cht as +8, same as asia', () => {
    expect(toInstant('2026-07-24 10:00:00', 'server', 'cht'))
      .toBe(toInstant('2026-07-24 10:00:00', 'server', 'asia'))
  })

  it('shifts an america server clock 13 hours later than asia', () => {
    const asia = toInstant('2026-07-24 10:00:00', 'server', 'asia')
    const us = toInstant('2026-07-24 10:00:00', 'server', 'america')
    expect(us - asia).toBe(13 * 3_600_000)
  })
})

describe('endInstant', () => {
  it('returns null for an open-ended event', () => {
    expect(endInstant(ev({ end: null }), 'asia')).toBeNull()
  })
})

describe('statusAt', () => {
  const now = Date.UTC(2026, 6, 24, 0, 0, 0)

  it('reports upcoming before the start', () => {
    const e = ev({ start: '2026-08-01 10:00:00', end: '2026-08-10 10:00:00' })
    expect(statusAt(e, now, 'asia')).toBe('upcoming')
  })

  it('reports live inside the window', () => {
    const e = ev({ start: '2026-07-01 10:00:00', end: '2026-08-10 10:00:00' })
    expect(statusAt(e, now, 'asia')).toBe('live')
  })

  it('reports ended after the end', () => {
    const e = ev({ start: '2026-06-01 10:00:00', end: '2026-06-10 10:00:00' })
    expect(statusAt(e, now, 'asia')).toBe('ended')
  })

  it('reports an open-ended started event as live, never ended', () => {
    const e = ev({ start: '2026-06-01 10:00:00', end: null })
    expect(statusAt(e, now, 'asia')).toBe('live')
  })
})

describe('formatCountdown', () => {
  it('shows days and hours past a day', () => {
    expect(formatCountdown(2 * 86_400_000 + 14 * 3_600_000)).toBe('2d 14h')
  })

  it('shows hours and minutes under a day', () => {
    expect(formatCountdown(14 * 3_600_000 + 3 * 60_000)).toBe('14h 3m')
  })

  it('shows minutes only under an hour', () => {
    expect(formatCountdown(3 * 60_000)).toBe('3m')
  })

  it('rounds down rather than up', () => {
    expect(formatCountdown(2 * 86_400_000 + 14 * 3_600_000 + 59 * 60_000)).toBe('2d 14h')
  })

  it('clamps negatives to zero', () => {
    expect(formatCountdown(-5000)).toBe('0m')
  })
})
