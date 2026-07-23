import { readableOn } from '../lib/color'
import { laneRows } from '../lib/timeline'
import type { Window } from '../lib/timeline'
import { LANES } from '../types'
import type { ServerRegion, TimelineEvent } from '../types'

type Props = {
  events: TimelineEvent[]
  window: Window
  server: ServerRegion
  now: number
  onSelect: (e: TimelineEvent) => void
}

export function TimelineGantt({ events, window: win, server, now, onSelect }: Props) {
  const nowPct = ((now - win.from) / (win.to - win.from)) * 100
  const visible = LANES.map((lane) => ({
    lane,
    rows: laneRows(events, lane.id, win, server),
  })).filter((l) => l.rows.length > 0)

  return (
    <section className="relative">
      {nowPct >= 0 && nowPct <= 100 && (
        <div
          className="bg-urgent pointer-events-none absolute top-0 bottom-0 z-10 w-px"
          style={{ left: `calc(9rem + (100% - 9rem) * ${nowPct / 100})` }}
          aria-hidden="true"
        />
      )}

      {visible.map(({ lane, rows }) => (
        <div key={lane.id} className="border-border flex items-start border-t py-2">
          <div className="text-dim w-36 shrink-0 pt-1 pr-3 text-[11px]">{lane.label}</div>
          <div className="min-w-0 flex-1 space-y-1">
            {rows.map((row, i) => (
              <div key={i} className="relative h-6">
                {row.map(({ event, leftPct, widthPct }) => (
                  <button
                    key={event.id}
                    onClick={() => onSelect(event)}
                    className="absolute inset-y-0 flex items-center overflow-hidden rounded-md px-2 text-left text-[11px] hover:brightness-110"
                    style={{
                      left: `${leftPct}%`,
                      width: `${Math.max(widthPct, 1.5)}%`,
                      background: event.color,
                      color: readableOn(event.color),
                    }}
                    title={event.name}
                  >
                    <span className="truncate">{event.name}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
