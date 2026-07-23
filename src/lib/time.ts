import { ASIA_OFFSET, SERVER_OFFSET } from '../types'
import type { Clock, ServerRegion, TimelineEvent } from '../types'

export type EventStatus = 'upcoming' | 'live' | 'ended'

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/
const HOUR = 3_600_000

export function parseWallClock(s: string): number {
  const m = WALL_CLOCK.exec(s)
  if (!m) throw new Error(`not a wall clock string: ${JSON.stringify(s)}`)
  return Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!)
}

export function toInstant(wall: string, clock: Clock, server: ServerRegion): number {
  const offset = clock === 'absolute' ? ASIA_OFFSET : SERVER_OFFSET[server]
  return parseWallClock(wall) - offset * HOUR
}

export function startInstant(ev: TimelineEvent, server: ServerRegion): number {
  return toInstant(ev.start, ev.clock, server)
}

export function endInstant(ev: TimelineEvent, server: ServerRegion): number | null {
  return ev.end === null ? null : toInstant(ev.end, ev.clock, server)
}

export function statusAt(ev: TimelineEvent, now: number, server: ServerRegion): EventStatus {
  if (now < startInstant(ev, server)) return 'upcoming'
  const end = endInstant(ev, server)
  if (end !== null && now >= end) return 'ended'
  return 'live'
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, ms)
  const days = Math.floor(total / 86_400_000)
  const hours = Math.floor((total % 86_400_000) / HOUR)
  const minutes = Math.floor((total % HOUR) / 60_000)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}
