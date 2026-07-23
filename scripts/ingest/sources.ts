import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Clock, Element, LaneId, TimelineEvent } from '../../src/types'

const CACHE_DIR = '.cache'
const ASIA_OFFSET_MS = 8 * 3_600_000

const CALENDAR_URL = 'https://api.ennead.cc/mihoyo/genshin/calendar'
const AMBER_URL = 'https://gi.yatta.moe/assets/data/event.json'
const ANN_BASE = 'https://sg-hk4e-api.hoyoverse.com/common/hk4e_global/announcement/api'
const ANN_QUERY =
  '?game=hk4e&game_biz=hk4e_global&lang=en&bundle_id=hk4e_global' +
  '&platform=pc&region=os_asia&level=60&uid=100000000'

export type CalendarCharacter = { name: string; rarity: string; element: string; icon: string }
export type CalendarEvent = {
  id: number; name: string; description: string; image_url: string
  start_time: string; end_time: string
}
export type CalendarBanner = {
  name: string; version: string; start_time: string; end_time: string
  characters: CalendarCharacter[]; weapons: CalendarCharacter[]
}
export type CalendarPayload = {
  events: CalendarEvent[]
  banners: CalendarBanner[]
  challenges: CalendarEvent[]
}
export type AnnItem = { ann_id: number; title: string; banner: string; content?: string }
export type AmberEvent = { name: Record<string, string>; banner?: Record<string, string> }
export type AmberPayload = Record<string, AmberEvent>
export type RawSources = {
  calendar: CalendarPayload
  announcements: AnnItem[]
  amber: AmberPayload
}

const DEFAULT_COLOR: Record<LaneId, string> = {
  'character-wish': '#b38df0',
  'weapon-wish': '#d3bc8e',
  chronicled: '#8fdfea',
  event: '#4cc2f1',
  stygian: '#ff6640',
  leyline: '#a5c83b',
  abyss: '#2a2f47',
  theater: '#f0b73a',
  battlepass: '#5fd7a6',
}

export function slugId(name: string, start: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug}@${start.replace(' ', 'T')}`
}

/**
 * Join key for matching a name across sources. Removes every non-alphanumeric
 * character rather than collapsing it to a separator — this must stay identical
 * to `norm_name` in research/fetch_timeline.py:108 or the parity test drifts.
 */
export function normKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function amberIndex(payload: AmberPayload): Map<string, AmberEvent> {
  const map = new Map<string, AmberEvent>()
  for (const entry of Object.values(payload)) {
    const en = entry.name?.EN
    if (en) map.set(normKey(en), entry)
  }
  return map
}

export function laneFor(
  kind: 'event' | 'banner' | 'challenge',
  name: string,
  hasCharacters: boolean,
): LaneId {
  const n = name.toLowerCase()
  if (n.includes('chronicled')) return 'chronicled'
  if (kind === 'banner') return hasCharacters ? 'character-wish' : 'weapon-wish'
  if (n.includes('abyss')) return 'abyss'
  if (n.includes('imaginarium theater')) return 'theater'
  if (n.includes('stygian')) return 'stygian'
  if (n.includes('ley line overflow')) return 'leyline'
  if (n.includes('battle pass')) return 'battlepass'
  return 'event'
}

export function clockFor(lane: LaneId): Clock {
  return lane === 'character-wish' || lane === 'weapon-wish' ||
    lane === 'chronicled' || lane === 'battlepass'
    ? 'absolute'
    : 'server'
}

function toAsiaWallClock(unixSeconds: string): string {
  const n = Number(unixSeconds)
  if (!Number.isFinite(n) || n <= 0) return ''
  return new Date(n * 1000 + ASIA_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ')
}

function toElement(raw: string): Element | undefined {
  const e = raw.toLowerCase()
  const known: Element[] = ['pyro', 'hydro', 'anemo', 'electro', 'dendro', 'cryo', 'geo']
  return known.find((k) => k === e)
}

function roster(chars: CalendarCharacter[]): TimelineEvent['featured'] {
  return chars.map((c) => {
    const element = toElement(c.element)
    return {
      name: c.name,
      rarity: c.rarity === '5' ? (5 as const) : (4 as const),
      ...(element ? { element } : {}),
    }
  })
}

export function fromCalendar(payload: CalendarPayload): TimelineEvent[] {
  const rows: TimelineEvent[] = []

  const plain = (items: CalendarEvent[], kind: 'event' | 'challenge') => {
    for (const it of items) {
      const lane = laneFor(kind, it.name, false)
      const start = toAsiaWallClock(it.start_time)
      const end = toAsiaWallClock(it.end_time)
      rows.push({
        id: slugId(it.name, start || String(it.id)),
        name: it.name,
        lane,
        start,
        end: end || null,
        clock: clockFor(lane),
        color: DEFAULT_COLOR[lane],
        ...(it.image_url ? { image: it.image_url } : {}),
        ...(it.description ? { description: it.description } : {}),
        source: 'calendar',
      })
    }
  }

  plain(payload.events, 'event')
  plain(payload.challenges, 'challenge')

  for (const b of payload.banners) {
    const lane = laneFor('banner', b.name, b.characters.length > 0)
    const start = toAsiaWallClock(b.start_time)
    const end = toAsiaWallClock(b.end_time)
    rows.push({
      id: slugId(b.name, start || b.name),
      name: b.name,
      lane,
      start,
      end: end || null,
      clock: clockFor(lane),
      color: DEFAULT_COLOR[lane],
      featured: roster([...b.characters, ...b.weapons]),
      ...(b.version ? { version: b.version } : {}),
      source: 'calendar',
    })
  }

  return rows
}

async function cached(key: string, url: string, offline: boolean, dir: string): Promise<string> {
  const path = join(dir, `${key}.json`)
  if (offline) return readFile(path, 'utf8')

  const res = await fetch(url)
  if (!res.ok) throw new Error(`${key}: HTTP ${res.status} from ${url}`)
  const body = await res.text()
  await mkdir(dir, { recursive: true })
  await writeFile(path, body, 'utf8')
  return body
}

export async function fetchAll(offline: boolean, dir: string = CACHE_DIR): Promise<RawSources> {
  const [calendarRaw, amberRaw, annListRaw] = await Promise.all([
    cached('calendar', CALENDAR_URL, offline, dir),
    cached('amber', AMBER_URL, offline, dir),
    cached('ann-list', `${ANN_BASE}/getAnnList${ANN_QUERY}`, offline, dir),
  ])

  const annContentRaw = await cached('ann-content', `${ANN_BASE}/getAnnContent${ANN_QUERY}`, offline, dir)
  const contentList = JSON.parse(annContentRaw).data?.list ?? []

  const listData = JSON.parse(annListRaw).data?.list ?? []
  const listItems: AnnItem[] = listData.flatMap((group: { list?: AnnItem[] }) => group.list ?? [])
  const contentById = new Map<number, string>(
    contentList.map((c: { ann_id: number; content: string }) => [c.ann_id, c.content]),
  )

  return {
    calendar: JSON.parse(calendarRaw) as CalendarPayload,
    amber: JSON.parse(amberRaw) as AmberPayload,
    announcements: listItems.map((it) => ({ ...it, content: contentById.get(it.ann_id) ?? '' })),
  }
}
