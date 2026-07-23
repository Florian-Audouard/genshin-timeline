import { useEffect, useMemo, useState } from 'react'
import { CommandDeck } from './components/CommandDeck'
import { TimelineGantt } from './components/TimelineGantt'
import { useTimeline } from './data/useTimeline'
import { useServer } from './state/store'
import { SERVER_OFFSET } from './types'
import type { ServerRegion } from './types'

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

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const viewWindow = useMemo(
    () => ({ from: now - 7 * 86_400_000, to: now + 45 * 86_400_000 }),
    [now],
  )

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
          <TimelineGantt
            events={state.payload.events}
            window={viewWindow}
            server={server}
            now={now}
            onSelect={() => {}}
          />
        </>
      )}
    </main>
  )
}
