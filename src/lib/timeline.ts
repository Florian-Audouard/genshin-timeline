import { endInstant, startInstant } from './time'
import { SERVER_OFFSET } from '../types'
import type { LaneId, ServerRegion, TimelineEvent } from '../types'

export type Window = { from: number; to: number }

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

export type DayCell = {
  /** Instant of this day's server-local midnight. */
  instant: number
  /** Left edge as a percentage of the window span (may fall outside 0–100 at the edges). */
  leftPct: number
  /** Day of the month, 1–31. */
  day: number
  /** Short month name — only set on the first day of a month (and the first cell), else null. */
  monthLabel: string | null
  isToday: boolean
  isMonthStart: boolean
}

/**
 * Enumerate the days spanned by `win` as an axis, one cell per server-local day.
 *
 * Boundaries are computed at server-local midnight so gridlines line up with the
 * clock the events are scheduled against, not UTC.
 */
export function dayAxis(win: Window, server: ServerRegion, now: number): DayCell[] {
  const offset = SERVER_OFFSET[server] * HOUR_MS
  const span = win.to - win.from
  const midnightOf = (t: number): number => {
    const d = new Date(t + offset)
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - offset
  }

  const todayMidnight = midnightOf(now)
  const start = midnightOf(win.from)
  const days: DayCell[] = []

  for (let m = start; m < win.to; m += DAY_MS) {
    const d = new Date(m + offset)
    const day = d.getUTCDate()
    const isMonthStart = day === 1
    const monthLabel =
      isMonthStart || days.length === 0
        ? d.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' })
        : null
    days.push({
      instant: m,
      leftPct: ((m - win.from) / span) * 100,
      day,
      monthLabel,
      isToday: m === todayMidnight,
      isMonthStart,
    })
  }

  return days
}

export type PositionedEvent = {
  event: TimelineEvent
  leftPct: number
  widthPct: number
}

/**
 * The full time span covered by `events` — earliest start to latest end — so the
 * timeline can show every event, past and future, instead of a fixed window.
 * Recurring events with no end contribute only their start. Returns null when
 * there are no events.
 */
export function dataExtent(events: TimelineEvent[], server: ServerRegion): Window | null {
  let from = Number.POSITIVE_INFINITY
  let to = Number.NEGATIVE_INFINITY
  for (const ev of events) {
    const start = startInstant(ev, server)
    const end = endInstant(ev, server) ?? start
    if (start < from) from = start
    if (end > to) to = end
  }
  return Number.isFinite(from) ? { from, to } : null
}

export function inWindow(ev: TimelineEvent, win: Window, server: ServerRegion): boolean {
  const start = startInstant(ev, server)
  const end = endInstant(ev, server) ?? Number.POSITIVE_INFINITY
  return start < win.to && end > win.from
}

export function packRows(events: TimelineEvent[], server: ServerRegion): TimelineEvent[][] {
  const sorted = [...events].sort((a, b) => startInstant(a, server) - startInstant(b, server))
  const rows: TimelineEvent[][] = []
  const rowEnds: number[] = []

  for (const ev of sorted) {
    const start = startInstant(ev, server)
    const end = endInstant(ev, server) ?? Number.POSITIVE_INFINITY
    const idx = rowEnds.findIndex((rowEnd) => rowEnd <= start)
    if (idx === -1) {
      rows.push([ev])
      rowEnds.push(end)
    } else {
      rows[idx]!.push(ev)
      rowEnds[idx] = end
    }
  }
  return rows
}

export function position(ev: TimelineEvent, win: Window, server: ServerRegion): PositionedEvent {
  const span = win.to - win.from
  const start = startInstant(ev, server)
  const end = endInstant(ev, server) ?? win.to
  const left = ((Math.max(start, win.from) - win.from) / span) * 100
  const right = ((Math.min(end, win.to) - win.from) / span) * 100
  return {
    event: ev,
    leftPct: Math.max(0, Math.min(100, left)),
    widthPct: Math.max(0, Math.min(100, right - left)),
  }
}

export function laneRows(
  events: TimelineEvent[],
  lane: LaneId,
  win: Window,
  server: ServerRegion,
): PositionedEvent[][] {
  const selected = events.filter((ev) => ev.lane === lane && inWindow(ev, win, server))
  return packRows(selected, server).map((row) => row.map((ev) => position(ev, win, server)))
}
