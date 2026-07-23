import { endInstant, startInstant } from './time'
import type { LaneId, ServerRegion, TimelineEvent } from '../types'

export type Window = { from: number; to: number }

export type PositionedEvent = {
  event: TimelineEvent
  leftPct: number
  widthPct: number
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
