import { useEffect, useState } from 'react'
import { withLaneStyle } from '../lib/lanes'
import type { TimelineEvent, TimelinePayload } from '../types'

export type TimelineState =
  | { status: 'loading' }
  | { status: 'ready'; payload: TimelinePayload }
  | { status: 'error'; error: string }

const WALL_CLOCK = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

/** Guard against a malformed date reaching the renderer, where it would throw and blank the page. */
function hasValidDates(e: TimelineEvent): boolean {
  return WALL_CLOCK.test(e.start) && (e.end === null || WALL_CLOCK.test(e.end))
}

/** Seam key: two sources may both carry an event near the history/live boundary. */
function key(e: TimelineEvent): string {
  return `${e.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}@${e.start.slice(0, 10)}`
}

/**
 * Merge the frozen history with the accumulating live store. `current` wins on
 * any overlap at the seam — it has fresher dates and resolved art. History is
 * best-effort: if it fails to load we still render `current`.
 */
function mergePayloads(current: TimelinePayload, history: TimelinePayload | null): TimelinePayload {
  const seen = new Set(current.events.map(key))
  const historical = (history?.events ?? []).filter((e) => !seen.has(key(e)))
  // Constant lanes ship without a stored color/image; stamp their baked look here
  // so every downstream consumer sees a fully-resolved row.
  const events = [...historical, ...current.events].filter(hasValidDates).map(withLaneStyle)
  return { generatedAt: current.generatedAt, events }
}

async function fetchPayload(url: string): Promise<TimelinePayload> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as TimelinePayload
}

export function useTimeline(): TimelineState {
  const [state, setState] = useState<TimelineState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchPayload('/data/current.json'),
      fetchPayload('/data/history.json').catch(() => null),
    ])
      .then(([current, history]) => {
        if (!cancelled) setState({ status: 'ready', payload: mergePayloads(current, history) })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', error: err instanceof Error ? err.message : String(err) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
