import { endInstant, formatCountdown, startInstant, statusAt } from '../lib/time'
import type { ServerRegion, TimelineEvent } from '../types'

const URGENT_MS = 72 * 3_600_000

type Props = { events: TimelineEvent[]; server: ServerRegion; now: number }

function urgencyColor(msLeft: number): string {
  if (msLeft < 24 * 3_600_000) return 'text-urgent'
  if (msLeft < URGENT_MS) return 'text-geo'
  return 'text-dim'
}

/**
 * One flat strip of status chips above the timeline. Everything lives on a single
 * line — it scrolls sideways rather than growing taller, so the timeline keeps the
 * rest of the viewport height.
 */
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

  if (endingSoon.length === 0 && banners.length === 0 && !next) return null

  return (
    <section className="deck-scroll flex shrink-0 items-center gap-2 overflow-x-auto px-4 pb-2 text-xs whitespace-nowrap">
      {endingSoon.map(({ e, left }) => (
        <span
          key={e.id}
          className="bg-surface border-urgent flex shrink-0 items-center gap-1.5 rounded-r border-l-2 px-2 py-1"
          title={e.name}
        >
          <span className={`tabular-nums ${urgencyColor(left)}`}>{formatCountdown(left)}</span>
          <span className="max-w-40 truncate">{e.name}</span>
        </span>
      ))}

      {banners.map((e) => (
        <span
          key={e.id}
          className="bg-surface flex shrink-0 items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1"
          title={e.name}
        >
          <span className="size-4 shrink-0 rounded-full" style={{ background: e.color }} aria-hidden="true" />
          <span className="max-w-56 truncate">
            {e.featured?.filter((f) => f.rarity === 5).map((f) => f.name).join(', ') || e.name}
          </span>
          {e.end && (
            <span className="text-dim tabular-nums">
              {formatCountdown((endInstant(e, server) ?? now) - now)}
            </span>
          )}
        </span>
      ))}

      {next && (
        <span className="text-dim shrink-0 py-1">
          Next: <span className="text-text">{next.e.name}</span> in{' '}
          <span className="tabular-nums">{formatCountdown(next.until)}</span>
        </span>
      )}
    </section>
  )
}
