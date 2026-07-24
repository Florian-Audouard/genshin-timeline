import { useEffect, useMemo, useRef, useState } from 'react'
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
import type { ServerRegion, TimelineEvent, TimelineHandle } from './types'

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
  const timeline = useRef<TimelineHandle>(null)

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

  const freshness =
    state.status === 'ready'
      ? (() => {
          const ageHours = (now - Date.parse(state.payload.generatedAt)) / 3_600_000
          return {
            stale: ageHours > 36,
            text:
              ageHours > 36
                ? `Data ${Math.floor(ageHours / 24)}d old`
                : `Updated ${formatCountdown(now - Date.parse(state.payload.generatedAt))} ago`,
          }
        })()
      : null

  // The page itself never scrolls: the shell fills the viewport and only the
  // timeline pane scrolls inside it, so the wheel always drives the timeline.
  return (
    <main className="flex h-dvh flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 px-4 py-2">
        <h1 className="text-gold shrink-0 text-sm tracking-[0.12em] uppercase">Genshin timeline</h1>
        <span className="border-border hidden h-4 border-l sm:block" />
        {freshness && (
          <span className={`hidden text-[11px] sm:block ${freshness.stale ? 'text-urgent' : 'text-dim'}`}>
            {freshness.text}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {state.status === 'ready' && (
            <button
              type="button"
              onClick={() => timeline.current?.scrollToNow()}
              className="bg-surface border-border text-gold hover:border-gold rounded-md border px-2 py-1 text-xs"
            >
              Today
            </button>
          )}
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
        </div>
      </header>

      {state.status === 'loading' && <p className="text-dim px-4 text-sm">Loading…</p>}
      {state.status === 'error' && (
        <p className="text-urgent px-4 text-sm">Couldn't load timeline data. {state.error}</p>
      )}
      {state.status === 'ready' && (
        <>
          <CommandDeck events={state.payload.events} server={server} now={now} />
          <div className="min-h-0 flex-1">
            {isDesktop ? (
              <TimelineGantt
                ref={timeline}
                events={state.payload.events}
                window={viewWindow}
                server={server}
                now={now}
                onSelect={setSelected}
              />
            ) : (
              <TimelineRiver
                ref={timeline}
                events={state.payload.events}
                window={viewWindow}
                server={server}
                now={now}
                onSelect={setSelected}
              />
            )}
          </div>
        </>
      )}

      <EventDetail event={selected} server={server} now={now} onClose={() => setSelected(null)} />
    </main>
  )
}
