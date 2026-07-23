import { endInstant, formatCountdown, startInstant, statusAt } from '../lib/time'
import type { ServerRegion, TimelineEvent } from '../types'

const URGENT_MS = 72 * 3_600_000

type Props = { events: TimelineEvent[]; server: ServerRegion; now: number }

function urgencyColor(msLeft: number): string {
  if (msLeft < 24 * 3_600_000) return 'text-urgent'
  if (msLeft < URGENT_MS) return 'text-geo'
  return 'text-dim'
}

export function CommandDeck({ events, server, now }: Props) {
  const live = events.filter((e) => statusAt(e, now, server) === 'live')

  const endingSoon = live
    .map((e) => ({ e, left: (endInstant(e, server) ?? Infinity) - now }))
    .filter((x) => x.left < URGENT_MS)
    .sort((a, b) => a.left - b.left)
    .slice(0, 3)

  const banners = live.filter((e) => e.lane === 'character-wish' || e.lane === 'weapon-wish')

  const next = events
    .filter((e) => statusAt(e, now, server) === 'upcoming')
    .map((e) => ({ e, until: startInstant(e, server) - now }))
    .sort((a, b) => a.until - b.until)[0]

  return (
    <section className="space-y-3">
      {endingSoon.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-3">
          {endingSoon.map(({ e, left }) => (
            <div key={e.id} className="bg-surface border-l-2 border-urgent p-3">
              <div className={`text-[11px] tracking-[0.08em] uppercase ${urgencyColor(left)}`}>
                Ends in {formatCountdown(left)}
              </div>
              <div className="mt-1 text-sm leading-snug">{e.name}</div>
            </div>
          ))}
        </div>
      )}

      {banners.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {banners.map((e) => (
            <div key={e.id} className="bg-surface flex items-center gap-3 rounded-xl p-3">
              <span
                className="size-9 shrink-0 rounded-full"
                style={{ background: e.color }}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="truncate text-sm">
                  {e.featured?.filter((f) => f.rarity === 5).map((f) => f.name).join(', ') || e.name}
                </div>
                <div className="text-dim truncate text-[11px]">
                  {e.name}
                  {e.end && ` · ${formatCountdown((endInstant(e, server) ?? now) - now)} left`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {next && (
        <div className="text-dim text-[11px]">
          Next up: <span className="text-text">{next.e.name}</span> in {formatCountdown(next.until)}
        </div>
      )}
    </section>
  )
}
