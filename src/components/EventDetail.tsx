import { endInstant, formatCountdown, startInstant, statusAt } from '../lib/time'
import type { ServerRegion, TimelineEvent } from '../types'

type Props = {
  event: TimelineEvent | null
  server: ServerRegion
  now: number
  onClose: () => void
}

function localString(instant: number): string {
  return new Date(instant).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function EventDetail({ event, server, now, onClose }: Props) {
  if (!event) return null

  const start = startInstant(event, server)
  const end = endInstant(event, server)
  const status = statusAt(event, now, server)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-surface border-border w-full max-w-md rounded-2xl border p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={event.name}
      >
        {event.image && (
          <img
            src={event.image}
            alt=""
            className="mb-4 h-32 w-full rounded-xl object-cover"
            loading="lazy"
          />
        )}
        <h2 className="text-base">{event.name}</h2>

        <dl className="text-dim mt-3 space-y-1 text-xs">
          <div className="flex justify-between gap-4">
            <dt>Starts</dt>
            <dd className="text-text">{localString(start)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Ends</dt>
            <dd className="text-text">{end === null ? 'Open-ended' : localString(end)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>{status === 'upcoming' ? 'Starts in' : 'Time left'}</dt>
            <dd className="text-text">
              {status === 'ended'
                ? 'Ended'
                : formatCountdown(status === 'upcoming' ? start - now : (end ?? now) - now)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Clock</dt>
            <dd className="text-text">
              {event.clock === 'absolute' ? 'Fixed worldwide' : 'Your server time'}
            </dd>
          </div>
        </dl>

        {event.featured && event.featured.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {event.featured.map((f) => (
              <li
                key={f.name}
                className={`rounded-full px-2 py-0.5 text-[11px] ${
                  f.rarity === 5 ? 'bg-gold-deep text-gold' : 'bg-surface-hi text-dim'
                }`}
              >
                {f.name}
              </li>
            ))}
          </ul>
        )}

        {event.description && (
          <p className="text-dim mt-3 text-xs leading-relaxed">{event.description}</p>
        )}

        <div className="mt-4 flex items-center justify-between">
          {event.url ? (
            <a
              href={event.url}
              target="_blank"
              rel="noreferrer"
              className="text-gold text-xs underline"
            >
              Official announcement
            </a>
          ) : <span />}
          <button onClick={onClose} className="text-dim text-xs">Close</button>
        </div>
      </div>
    </div>
  )
}
