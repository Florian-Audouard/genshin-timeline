import { endInstant, formatCountdown, startInstant, statusAt } from '../lib/time'
import { inWindow } from '../lib/timeline'
import type { Window } from '../lib/timeline'
import type { ServerRegion, TimelineEvent } from '../types'

type Props = {
  events: TimelineEvent[]
  window: Window
  server: ServerRegion
  now: number
  onSelect: (e: TimelineEvent) => void
}

function dayKey(instant: number): string {
  return new Date(instant).toISOString().slice(0, 10)
}

function dayLabel(key: string, todayKey: string): string {
  if (key === todayKey) return 'Today'
  const d = new Date(`${key}T00:00:00Z`)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function TimelineRiver({ events, window: win, server, now, onSelect }: Props) {
  const todayKey = dayKey(now)
  const visible = events.filter((e) => inWindow(e, win, server))

  const groups = new Map<string, TimelineEvent[]>()
  for (const e of visible) {
    const anchor = statusAt(e, now, server) === 'live' ? now : startInstant(e, server)
    const key = dayKey(anchor)
    const bucket = groups.get(key)
    if (bucket) bucket.push(e)
    else groups.set(key, [e])
  }

  const days = [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1))

  return (
    <section className="timeline-scroll h-full space-y-4 overflow-y-auto px-4 pb-4">
      {days.map(([key, dayEvents]) => (
        <div key={key} className="flex gap-3">
          <div className="w-14 shrink-0 pt-1 text-right">
            <div className={key === todayKey ? 'text-urgent text-[11px]' : 'text-dim text-[11px]'}>
              {key === todayKey ? 'today' : ''}
            </div>
            <div className="text-sm">{dayLabel(key, todayKey)}</div>
          </div>
          <div className="border-border min-w-0 flex-1 space-y-1.5 border-l pl-3">
            {dayEvents.map((e) => {
              const end = endInstant(e, server)
              const live = statusAt(e, now, server) === 'live'
              return (
                <button
                  key={e.id}
                  onClick={() => onSelect(e)}
                  className="bg-surface flex w-full items-center justify-between gap-2 rounded-lg p-2.5 text-left"
                  style={{ borderLeft: `2px solid ${e.color}` }}
                >
                  <span className="min-w-0 truncate text-xs">{e.name}</span>
                  <span className="text-dim shrink-0 text-[11px]">
                    {live && end !== null
                      ? `${formatCountdown(end - now)} left`
                      : live
                        ? 'live'
                        : 'starts'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}
