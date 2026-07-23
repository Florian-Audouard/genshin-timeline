import { useEffect, useState } from 'react'
import type { TimelinePayload } from '../types'

export type TimelineState =
  | { status: 'loading' }
  | { status: 'ready'; payload: TimelinePayload }
  | { status: 'error'; error: string }

export function useTimeline(): TimelineState {
  const [state, setState] = useState<TimelineState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetch('/data/current.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<TimelinePayload>
      })
      .then((payload) => { if (!cancelled) setState({ status: 'ready', payload }) })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', error: err instanceof Error ? err.message : String(err) })
        }
      })
    return () => { cancelled = true }
  }, [])

  return state
}
