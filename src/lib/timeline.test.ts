import { describe, expect, it } from 'vitest'
import { inWindow, packRows, position, laneRows, dayAxis } from './timeline'
import type { TimelineEvent } from '../types'
import { parseWallClock } from './time'

const ev = (start: string, end: string | null, over: Partial<TimelineEvent> = {}): TimelineEvent => ({
  id: `${start}`, name: start, lane: 'event',
  start, end, clock: 'absolute', color: '#fff', source: 'calendar',
  ...over,
})

const win = {
  from: parseWallClock('2026-07-01 00:00:00') - 8 * 3_600_000,
  to: parseWallClock('2026-07-31 00:00:00') - 8 * 3_600_000,
}

describe('inWindow', () => {
  it('includes an event fully inside', () => {
    expect(inWindow(ev('2026-07-10 00:00:00', '2026-07-12 00:00:00'), win, 'asia')).toBe(true)
  })

  it('includes an event straddling the start edge', () => {
    expect(inWindow(ev('2026-06-20 00:00:00', '2026-07-05 00:00:00'), win, 'asia')).toBe(true)
  })

  it('includes an event straddling the end edge', () => {
    expect(inWindow(ev('2026-07-28 00:00:00', '2026-08-15 00:00:00'), win, 'asia')).toBe(true)
  })

  it('excludes an event entirely before', () => {
    expect(inWindow(ev('2026-05-01 00:00:00', '2026-05-10 00:00:00'), win, 'asia')).toBe(false)
  })

  it('excludes an event entirely after', () => {
    expect(inWindow(ev('2026-09-01 00:00:00', '2026-09-10 00:00:00'), win, 'asia')).toBe(false)
  })

  it('includes an open-ended event that has started', () => {
    expect(inWindow(ev('2026-07-05 00:00:00', null), win, 'asia')).toBe(true)
  })
})

describe('packRows', () => {
  it('keeps non-overlapping events on one row', () => {
    const rows = packRows([
      ev('2026-07-01 00:00:00', '2026-07-05 00:00:00'),
      ev('2026-07-06 00:00:00', '2026-07-10 00:00:00'),
    ], 'asia')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveLength(2)
  })

  it('splits overlapping events onto separate rows', () => {
    const rows = packRows([
      ev('2026-07-01 00:00:00', '2026-07-10 00:00:00'),
      ev('2026-07-05 00:00:00', '2026-07-15 00:00:00'),
    ], 'asia')
    expect(rows).toHaveLength(2)
  })

  it('reuses the first free row for a third event', () => {
    const rows = packRows([
      ev('2026-07-01 00:00:00', '2026-07-10 00:00:00'),
      ev('2026-07-05 00:00:00', '2026-07-15 00:00:00'),
      ev('2026-07-11 00:00:00', '2026-07-14 00:00:00'),
    ], 'asia')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveLength(2)
  })

  it('treats an open-ended event as occupying its row indefinitely', () => {
    const rows = packRows([
      ev('2026-07-01 00:00:00', null),
      ev('2026-07-05 00:00:00', '2026-07-10 00:00:00'),
    ], 'asia')
    expect(rows).toHaveLength(2)
  })

  it('returns an empty array for no events', () => {
    expect(packRows([], 'asia')).toEqual([])
  })
})

describe('position', () => {
  it('places a mid-window event proportionally', () => {
    const p = position(ev('2026-07-16 00:00:00', '2026-07-31 00:00:00'), win, 'asia')
    expect(p.leftPct).toBeCloseTo(50, 1)
    expect(p.widthPct).toBeCloseTo(50, 1)
  })

  it('clamps an event that starts before the window', () => {
    const p = position(ev('2026-06-01 00:00:00', '2026-07-16 00:00:00'), win, 'asia')
    expect(p.leftPct).toBe(0)
    expect(p.widthPct).toBeCloseTo(50, 1)
  })

  it('clamps an open-ended event to the window end', () => {
    const p = position(ev('2026-07-16 00:00:00', null), win, 'asia')
    expect(p.leftPct + p.widthPct).toBeCloseTo(100, 1)
  })
})

describe('dayAxis', () => {
  // win spans 2026-07-01 00:00 → 2026-07-31 00:00 in Asia (UTC+8): 30 days.
  it('emits one aligned cell per server-local day', () => {
    const days = dayAxis(win, 'asia', win.from)
    expect(days).toHaveLength(30)
    expect(days[0]!.day).toBe(1)
    expect(days[0]!.leftPct).toBeCloseTo(0, 6)
    expect(days[29]!.day).toBe(30)
  })

  it('labels the month only on the first cell and each month start', () => {
    const augWin = {
      from: parseWallClock('2026-07-30 00:00:00') - 8 * 3_600_000,
      to: parseWallClock('2026-08-03 00:00:00') - 8 * 3_600_000,
    }
    const days = dayAxis(augWin, 'asia', augWin.from)
    const labelled = days.filter((d) => d.monthLabel !== null)
    expect(labelled.map((d) => d.day)).toEqual([30, 1]) // first cell (Jul 30) + Aug 1
    expect(days.find((d) => d.day === 1)!.isMonthStart).toBe(true)
    expect(days.find((d) => d.day === 31)!.monthLabel).toBeNull()
  })

  it('flags exactly one cell as today', () => {
    const midDay = win.from + 6 * 3_600_000
    expect(dayAxis(win, 'asia', midDay).filter((d) => d.isToday)).toHaveLength(1)
  })

  it('keeps cells on midnight when the window opens mid-day', () => {
    const midDay = win.from + 6 * 3_600_000
    const days = dayAxis({ from: midDay, to: win.to }, 'asia', midDay)
    // The first cell is the midnight before the window opens, so it sits 6h
    // (a quarter day) to the left of the window's edge.
    expect(days[0]!.leftPct).toBeLessThan(0)
    expect(days[1]!.instant - days[0]!.instant).toBe(86_400_000)
  })
})

describe('laneRows', () => {
  it('selects only the requested lane and positions it', () => {
    const rows = laneRows([
      ev('2026-07-02 00:00:00', '2026-07-08 00:00:00', { lane: 'event' }),
      ev('2026-07-02 00:00:00', '2026-07-08 00:00:00', { lane: 'abyss' }),
    ], 'event', win, 'asia')
    expect(rows).toHaveLength(1)
    expect(rows[0]![0]!.event.lane).toBe('event')
    expect(rows[0]![0]!.leftPct).toBeGreaterThan(0)
  })
})
