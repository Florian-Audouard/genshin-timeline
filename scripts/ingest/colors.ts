import { dominantColor } from './palette'
import { DEFAULT_COLOR } from './sources'
import { LANE_STYLE } from '../../src/lib/lanes'
import type { LaneId, TimelineEvent, TimelinePayload } from '../../src/types'

/**
 * Lanes whose fill is a fixed color, never derived from per-event art: the
 * recurring challenges (their banners collapse to a muddy near-navy or, for
 * stygian, near-black), plus the battle pass. The challenges bake their look in
 * LANE_STYLE; the battle pass keeps its DEFAULT_COLOR.
 */
const FIXED_COLOR_LANES = new Set<LaneId>([
  ...(Object.keys(LANE_STYLE) as LaneId[]),
  'battlepass',
])

export type ResolveOptions = {
  /** Skip all network access; reuse cached colors only, else keep the lane default. */
  offline?: boolean
  /** Injectable for tests. Fetches an image URL to a raw buffer. */
  fetchImage?: (url: string) => Promise<Buffer>
  /** Injectable for tests. Extracts a `#rrggbb` color from an image buffer. */
  extract?: (buf: Buffer) => Promise<string>
}

async function defaultFetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Reuse map from the previously written payload: `imageUrl -> color`, but only
 * for events whose stored color actually diverged from their lane default. A
 * color equal to the default means last run either had no art or failed to
 * resolve it — either way we want to try again, not cache the miss forever.
 */
function reuseMap(previous: TimelinePayload | null): Map<string, string> {
  const map = new Map<string, string>()
  if (!previous) return map
  for (const e of previous.events) {
    if (e.image && e.color && e.color !== DEFAULT_COLOR[e.lane]) map.set(e.image, e.color)
  }
  return map
}

/**
 * Fill each event's `color` from its banner art. Overrides keep their hand-set
 * color; imageless events keep the lane default; already-resolved art is reused
 * from `previous` so each image is decoded at most once across runs. A fetch or
 * decode failure falls back to the lane default and is reported, never fatal.
 */
export async function resolveColors(
  events: TimelineEvent[],
  previous: TimelinePayload | null,
  opts: ResolveOptions = {},
): Promise<{ events: TimelineEvent[]; warnings: string[] }> {
  const fetchImage = opts.fetchImage ?? defaultFetchImage
  const extract = opts.extract ?? dominantColor
  const cache = reuseMap(previous)
  const warnings: string[] = []

  const resolved = await Promise.all(
    events.map(async (e): Promise<TimelineEvent> => {
      if (e.source === 'override' || !e.image || FIXED_COLOR_LANES.has(e.lane)) return e

      const cached = cache.get(e.image)
      if (cached) return { ...e, color: cached }

      if (opts.offline) return e

      try {
        const color = await extract(await fetchImage(e.image))
        return { ...e, color }
      } catch (err) {
        warnings.push(
          `color unresolved for "${e.name}" (${e.image}): ${err instanceof Error ? err.message : String(err)}`,
        )
        return e
      }
    }),
  )

  return { events: resolved, warnings }
}
