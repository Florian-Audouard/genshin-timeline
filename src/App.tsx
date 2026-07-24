import { useEffect, useMemo, useState } from 'react'
import { CommandDeck } from './components/CommandDeck'
import { EventDetail } from './components/EventDetail'
import { TimelineGantt } from './components/TimelineGantt'
import { TimelineRiver } from './components/TimelineRiver'
import { useTimeline } from './data/useTimeline'
import { formatCountdown } from './lib/time'
import { dataExtent } from './lib/timeline'
import { useServer } from './state/store'
import { useIsDesktop } from './state/useIsDesktop'
import { SERVER_OFFSET } from './types'
import type { ServerRegion, TimelineEvent } from './types'

const SERVER_LABEL: Record<ServerRegion, string> = {
  asia: 'Asia',
  europe: 'Europe',
  america: 'America',
  cht: 'TW, HK, MO',
}

export function App() {
  const state = useTimeline()
  const [server, setServer] = useServer()
  const [now, setNow] = useState(() => Date.now())
  const isDesktop = useIsDesktop()
  const [selected, setSelected] = useState<TimelineEvent | null>(null)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Span the whole dataset (past and future) so nothing is clipped, padded a few
  // days on each side and always including "now". Falls back to a window around
  // now before the data has loaded.
  const events = state.status === 'ready' ? state.payload.events : null
  const viewWindow = useMemo(() => {
    const pad = 3 * 86_400_000
    const extent = events ? dataExtent(events, server) : null
    const from = Math.min(extent?.from ?? now - 7 * 86_400_000, now) - pad
    const to = Math.max(extent?.to ?? now + 45 * 86_400_000, now) + pad
    return { from, to }
  }, [events, server, now])

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-gold text-sm tracking-[0.12em] uppercase">Genshin timeline</h1>
        <select
          value={server}
          onChange={(e) => setServer(e.target.value as ServerRegion)}
          className="bg-surface border-border text-dim rounded-md border px-2 py-1 text-xs"
          aria-label="Server region"
        >
          {(Object.keys(SERVER_OFFSET) as ServerRegion[]).map((r) => (
            <option key={r} value={r}>{SERVER_LABEL[r]}</option>
          ))}
        </select>
      </header>

      {state.status === 'loading' && <p className="text-dim text-sm">Loading…</p>}
      {state.status === 'error' && (
        <p className="text-urgent text-sm">Couldn't load timeline data. {state.error}</p>
      )}
      {state.status === 'ready' && (
        <>
          <CommandDeck events={state.payload.events} server={server} now={now} />
          {isDesktop ? (
            <TimelineGantt
              events={state.payload.events}
              window={viewWindow}
              server={server}
              now={now}
              onSelect={setSelected}
            />
          ) : (
            <TimelineRiver
              events={state.payload.events}
              window={viewWindow}
              server={server}
              now={now}
              onSelect={setSelected}
            />
          )}
        </>
      )}

      <EventDetail event={selected} server={server} now={now} onClose={() => setSelected(null)} />

      {state.status === 'ready' && (() => {
        const ageHours = (now - Date.parse(state.payload.generatedAt)) / 3_600_000
        return (
          <p className={ageHours > 36 ? 'text-urgent text-[11px]' : 'text-dim text-[11px]'}>
            {ageHours > 36
              ? `Data is ${Math.floor(ageHours / 24)} days old — the ingest may have stopped.`
              : `Updated ${formatCountdown(now - Date.parse(state.payload.generatedAt))} ago`}
          </p>
        )
      })()}
    </main>
  )
}
