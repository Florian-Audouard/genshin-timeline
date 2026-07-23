import { extractWindow, stripTags } from './announcements'
import { amberIndex, clockFor, fromCalendar, normKey, slugId } from './sources'
import type { AnnItem, RawSources } from './sources'
import type { LaneId, TimelineEvent } from '../../src/types'

export type OverrideRow = {
  name: string
  lane: LaneId
  start: string
  end: string | null
  clock: 'server' | 'absolute'
  color: string
  image?: string
  url?: string
  description?: string
}

export type OverrideFile = { rows: OverrideRow[] }

export type MergeResult = { events: TimelineEvent[]; warnings: string[] }

const WISH_TITLE = /Event Wish\s*[“"]([^”"]+)[”"]/i
const WISH_LANES: LaneId[] = ['character-wish', 'weapon-wish', 'chronicled']

/**
 * One-directional, exactly as research/fetch_timeline.py:121 does it: the
 * calendar name must be a substring of the announcement title, never the
 * reverse. Matching both ways makes short titles swallow unrelated events.
 */
function matchAnnouncement(name: string, anns: AnnItem[]): AnnItem | undefined {
  const n = normKey(name)
  if (!n) return undefined
  return anns.find((a) => normKey(stripTags(a.title)).includes(n))
}

/**
 * The calendar names a banner after its featured character; the official
 * announcement carries the wish's actual name. Recover it by finding the wish
 * announcement that mentions one of this banner's 5-stars.
 */
function wishAnnouncement(featured: TimelineEvent['featured'], anns: AnnItem[]) {
  const fives = (featured ?? []).filter((f) => f.rarity === 5).map((f) => f.name)
  if (fives.length === 0) return undefined
  return anns.find((a) => {
    const title = stripTags(a.title)
    if (!/Event Wish|Epitome/i.test(title)) return false
    return fives.some((n) => title.includes(n))
  })
}

export function merge(raw: RawSources, overrides: OverrideFile): MergeResult {
  const warnings: string[] = []
  const rows = fromCalendar(raw.calendar)
  const amber = amberIndex(raw.amber)
  const resolved: TimelineEvent[] = []

  for (const row of rows) {
    const isWish = WISH_LANES.includes(row.lane)
    const ann = isWish
      ? wishAnnouncement(row.featured, raw.announcements) ??
        matchAnnouncement(row.name, raw.announcements)
      : matchAnnouncement(row.name, raw.announcements)

    let next = { ...row }

    if (isWish && ann) {
      const titled = WISH_TITLE.exec(stripTags(ann.title))
      if (titled) next = { ...next, name: titled[1]! }
    }

    if (!next.start && ann?.content) {
      const win = extractWindow(ann.content)
      if (win) next = { ...next, start: win.start, end: win.end, source: 'announcement' }
    }

    const amberBanner = amber.get(normKey(next.name))?.banner?.EN
    if (amberBanner) next = { ...next, image: amberBanner }
    if (!next.image && ann?.banner) next = { ...next, image: ann.banner }
    if (!next.url && ann) {
      next = { ...next, url: `https://www.hoyolab.com/article/${ann.ann_id}` }
    }

    if (!next.start) {
      warnings.push(`no date resolved for "${next.name}" — dropped`)
      continue
    }

    next.id = slugId(next.name, next.start)
    resolved.push(next)
  }

  for (const row of overrides.rows) {
    const lane = row.lane
    const id = slugId(row.name, row.start)
    const idx = resolved.findIndex(
      (e) => e.lane === lane && normKey(e.name) === normKey(row.name),
    )
    const built: TimelineEvent = {
      id,
      name: row.name,
      lane,
      start: row.start,
      end: row.end,
      clock: row.clock ?? clockFor(lane),
      color: row.color,
      ...(row.image ? { image: row.image } : {}),
      ...(row.url ? { url: row.url } : {}),
      ...(row.description ? { description: row.description } : {}),
      source: 'override',
    }
    if (idx === -1) resolved.push(built)
    else resolved[idx] = built
  }

  resolved.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
  return { events: resolved, warnings }
}
