import { useCallback, useState } from 'react'
import { SERVER_OFFSET } from '../types'
import type { ServerRegion } from '../types'

const KEY = 'gt.server'
const REGIONS: ServerRegion[] = ['asia', 'europe', 'america', 'cht']

export function detectServer(offsetMinutes: number): ServerRegion {
  const hours = -offsetMinutes / 60
  let best: ServerRegion = 'asia'
  let bestDelta = Infinity
  for (const region of REGIONS) {
    if (region === 'cht') continue
    const delta = Math.abs(SERVER_OFFSET[region] - hours)
    if (delta < bestDelta) {
      bestDelta = delta
      best = region
    }
  }
  return best
}

export function loadServer(): ServerRegion {
  const stored = localStorage.getItem(KEY)
  if (stored && (REGIONS as string[]).includes(stored)) return stored as ServerRegion
  return detectServer(new Date().getTimezoneOffset())
}

export function saveServer(s: ServerRegion): void {
  localStorage.setItem(KEY, s)
}

export function useServer(): [ServerRegion, (s: ServerRegion) => void] {
  const [server, setServer] = useState<ServerRegion>(loadServer)
  const update = useCallback((s: ServerRegion) => {
    saveServer(s)
    setServer(s)
  }, [])
  return [server, update]
}
