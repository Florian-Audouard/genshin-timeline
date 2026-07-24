import { normKey, slugId } from './sources'
import type { Clock, Featured, LaneId, TimelineEvent } from '../../src/types'

/**
 * Historical reconstruction of the whole timeline, back to launch. Two frozen
 * inputs sit under research/data/ (see research/FINDINGS.md for provenance):
 *
 *  - paimon_banners.js     — every wish banner, 2020-09-28 → 2026-07, with clean
 *                            rosters. Authoritative for the three wish lanes.
 *  - timeline_archive.json — paimon.moe's timeline reconstructed from git history,
 *                            2021-02 → 2026-06. Everything except wishes.
 *
 * The transforms here are pure so they can be unit-tested; build-history.ts does
 * the file IO and writes public/data/history.json once.
 */

/** paimon.moe hosts historical event art here; verified hotlinkable (FINDINGS §6). */
const IMAGE_BASE = 'https://paimon.moe/images/events/'

/**
 * Wish banners in the archive carry no announcement art (unlike the live
 * calendar, which ships HoYoverse splash images). We supply the real
 * promotional banner art scraped from game8's banner-history page — the dated
 * rows in research/data/g8_banners.tsv plus the name-keyed reduction in
 * research/data/g8_banner_art.json (see research/FINDINGS.md §6, and
 * resolveBannerArt below for how the two are joined). Banners that still
 * resolve nothing render as plain colour bars, exactly as before.
 */
export type BannerArtMap = Record<string, { image: string }>

/** One dated row of research/data/g8_banners.tsv: name, start, end, image. */
export type G8Row = { name: string; start: string; end: string; image: string }

const DAY_MS = 86_400_000
/** Longest plausible banner run — real phases are ~3 weeks, launch windows ~6. */
const MAX_RUN_DAYS = 45

/**
 * game8's table shows dates without years; the scrape inferred them and got the
 * start year wrong on rows crossing a year boundary ("2025-03-17 → 2026-04-07"
 * for a three-week run). When the span is impossible, the start year that makes
 * it a plausible run is the real one. Unrepairable rows are kept as-is — a row
 * no launch window matches is simply never used.
 */
function repairStartYear(start: string, end: string): string {
  const span = (Date.parse(end) - Date.parse(start)) / DAY_MS
  if (Number.isNaN(span) || (span > 0 && span <= MAX_RUN_DAYS)) return start
  for (const bump of [1, -1]) {
    const candidate = `${Number(start.slice(0, 4)) + bump}${start.slice(4)}`
    const s = (Date.parse(end) - Date.parse(candidate)) / DAY_MS
    if (s > 0 && s <= MAX_RUN_DAYS) return candidate
  }
  return start
}

/** `name<TAB>YYYY-MM-DD<TAB>YYYY-MM-DD<TAB>url` per line; malformed lines are dropped. */
export function parseG8Tsv(tsv: string): G8Row[] {
  const rows: G8Row[] = []
  for (const line of tsv.split('\n')) {
    const [name, start, end, image] = line.split('\t')
    if (!name || !start || !end || !image) continue
    rows.push({
      name: name.trim(),
      start: repairStartYear(start.trim(), end.trim()),
      end: end.trim(),
      image: image.trim(),
    })
  }
  return rows
}

/** The join key for a banner occurrence: normalised name + launch date. */
export function artKey(name: string, start: string): string {
  return `${normKey(name)}@${start.slice(0, 10)}`
}

/**
 * Resolve promo art per banner *occurrence*, keyed by artKey. Three passes:
 *
 *  1. A g8 row launching the same day with the same (normalised) name — reruns
 *     get the art of that specific run, not the map's one-image-per-name.
 *  2. The name-keyed map, as before.
 *  3. Elimination inside each launch window. game8 labels most weapon runs
 *     literally "Phase 1"/"Phase 2" (verified: those images are Epitome
 *     Invocation promo art), so a phase-labelled row may only ever art the
 *     weapon lane; a single remaining named row pairs with a single remaining
 *     artless banner of any lane. This is the only way to art the weapon lane —
 *     paimon names every weapon banner "Epitome Invocation" while game8 never
 *     does, so no name key can join them. Ambiguous windows are left untouched.
 */
export function resolveBannerArt(
  entries: ReadonlyArray<Pick<BannerEntry, 'name' | 'start'> & { lane: LaneId }>,
  rows: readonly G8Row[],
  art: BannerArtMap,
): Map<string, string> {
  const resolved = new Map<string, string>()
  const claimed = new Set<G8Row>()
  const rowsByDate = new Map<string, G8Row[]>()
  for (const r of rows) {
    const bucket = rowsByDate.get(r.start)
    if (bucket) bucket.push(r)
    else rowsByDate.set(r.start, [r])
  }

  for (const e of entries) {
    const match = (rowsByDate.get(e.start.slice(0, 10)) ?? []).find(
      (r) => !claimed.has(r) && normKey(r.name) === normKey(e.name),
    )
    if (match) {
      resolved.set(artKey(e.name, e.start), match.image)
      claimed.add(match)
    }
  }

  for (const e of entries) {
    const key = artKey(e.name, e.start)
    const image = art[normKey(e.name)]?.image
    if (!resolved.has(key) && image) resolved.set(key, image)
  }

  const PHASE_ROW = /^phase\s*\d+$/i
  const entriesByDate = new Map<string, (typeof entries)[number][]>()
  for (const e of entries) {
    const date = e.start.slice(0, 10)
    const bucket = entriesByDate.get(date)
    if (bucket) bucket.push(e)
    else entriesByDate.set(date, [e])
  }
  const pair = (e: (typeof entries)[number], r: G8Row) => {
    resolved.set(artKey(e.name, e.start), r.image)
    claimed.add(r)
  }
  for (const [date, es] of entriesByDate) {
    const windowRows = rowsByDate.get(date) ?? []
    const phase = windowRows.filter((r) => !claimed.has(r) && PHASE_ROW.test(r.name))
    const weapons = es.filter(
      (e) => e.lane === 'weapon-wish' && !resolved.has(artKey(e.name, e.start)),
    )
    if (phase.length === 1 && weapons.length === 1) pair(weapons[0]!, phase[0]!)

    const named = windowRows.filter((r) => !claimed.has(r) && !PHASE_ROW.test(r.name))
    const artless = es.filter((e) => !resolved.has(artKey(e.name, e.start)))
    if (named.length === 1 && artless.length === 1) pair(artless[0]!, named[0]!)
  }

  return resolved
}

/** A single banner entry as stored in research/data/paimon_banners.js. */
export type BannerEntry = {
  name: string
  shortName?: string
  start: string
  end: string
  color: string
  featured?: string[]
  featuredRare?: string[]
  version?: string
  timezoneDependent?: boolean
}

/** The top-level shape of paimon_banners.js. */
export type BannersFile = {
  beginners?: BannerEntry[]
  standard?: BannerEntry[]
  characters?: BannerEntry[]
  weapons?: BannerEntry[]
  chronicled?: BannerEntry[]
}

/** A single row of research/data/timeline_archive.json. */
export type ArchiveRow = {
  name: string
  start: string
  end?: string | null
  color: string
  image?: string
  url?: string
  description?: string
  timezoneDependent?: boolean
}

const WALL_CLOCK = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

/**
 * Repair the handful of malformed dates in the git-reconstructed archive
 * ("2021-04-8", "202110-21", "2026-0116" — single-digit fields and a dropped
 * separator) into canonical `YYYY-MM-DD HH:mm:ss`. Returns null if the string
 * can't be salvaged, so callers can drop the row rather than crash the app.
 */
export function normalizeWallClock(s: string): string | null {
  if (WALL_CLOCK.test(s)) return s
  const [date, time] = s.trim().split(' ')
  if (!date || !time || !/^\d{2}:\d{2}:\d{2}$/.test(time)) return null

  const parts = date.split('-')
  let y: string, m: string, d: string
  if (parts.length === 3) {
    ;[y, m, d] = parts as [string, string, string]
  } else if (parts.length === 2 && parts[0]!.length === 6) {
    y = parts[0]!.slice(0, 4); m = parts[0]!.slice(4); d = parts[1]!
  } else if (parts.length === 2 && parts[1]!.length === 4) {
    y = parts[0]!; m = parts[1]!.slice(0, 2); d = parts[1]!.slice(2)
  } else {
    return null
  }

  const norm = `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')} ${time}`
  return WALL_CLOCK.test(norm) ? norm : null
}

/** "polar_star" → "Polar Star" — the roster arrays store lowercase slugs. */
export function titleCaseSlug(slug: string): string {
  return slug
    .split('_')
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function roster(entry: BannerEntry): Featured[] {
  const fives = (entry.featured ?? []).map((s) => ({ name: titleCaseSlug(s), rarity: 5 as const }))
  const fours = (entry.featuredRare ?? []).map((s) => ({ name: titleCaseSlug(s), rarity: 4 as const }))
  return [...fives, ...fours]
}

function bannerRow(entry: BannerEntry, lane: LaneId, resolved: Map<string, string>): TimelineEvent {
  const featured = roster(entry)
  const image = resolved.get(artKey(entry.name, entry.start))
  return {
    id: slugId(entry.name, entry.start),
    name: entry.name,
    lane,
    start: entry.start,
    end: entry.end,
    // Every wish banner starts at the same absolute instant worldwide (Asia
    // wall-clock), regardless of the timezoneDependent flag being present.
    clock: 'absolute',
    color: entry.color,
    ...(featured.length > 0 ? { featured } : {}),
    ...(image ? { image } : {}),
    ...(entry.version ? { version: entry.version } : {}),
    source: 'archive',
  }
}

/**
 * The three wish lanes, straight from paimon_banners.js. `beginners`/`standard`
 * are the permanent banners (fake 2000–2200 dates) and are skipped — they are
 * not timeline events. Art is resolved per occurrence via resolveBannerArt.
 */
export function fromBanners(
  file: BannersFile,
  art: BannerArtMap = {},
  rows: readonly G8Row[] = [],
): TimelineEvent[] {
  const lanes: [BannerEntry[], LaneId][] = [
    [file.characters ?? [], 'character-wish'],
    [file.weapons ?? [], 'weapon-wish'],
    [file.chronicled ?? [], 'chronicled'],
  ]
  const resolved = resolveBannerArt(
    lanes.flatMap(([entries, lane]) => entries.map((b) => ({ ...b, lane }))),
    rows,
    art,
  )
  return lanes.flatMap(([entries, lane]) => entries.map((b) => bannerRow(b, lane, resolved)))
}

/**
 * Classify an archive row by its name. The reconstruction's numeric lane index
 * is unreliable — paimon reordered its lanes across revisions — but the names
 * are stable. Wishes are handled by fromBanners, so this never returns a wish
 * lane; callers drop wish-strips before classifying (see isWishStrip).
 */
export function archiveLane(name: string): LaneId {
  const n = name.toLowerCase()
  if (n.includes('abyss')) return 'abyss'
  if (n.includes('imaginarium theater')) return 'theater'
  if (n.includes('stygian')) return 'stygian'
  if (n.includes('ley line')) return 'leyline'
  if (n.includes('battle pass')) return 'battlepass'
  return 'event'
}

/**
 * True for the banner strips that duplicate paimon_banners.js. Every character,
 * weapon (Epitome Invocation) and chronicled banner in the archive has "Banner"
 * in its name; no genuine event does. Dropping these leaves wishes sourced only
 * from the cleaner banners file.
 */
export function isWishStrip(name: string): boolean {
  return /banner/i.test(name)
}

/** Everything except wishes: events, abyss, theater, stygian, leyline, battle pass. */
export function fromArchive(rows: ArchiveRow[]): TimelineEvent[] {
  const out: TimelineEvent[] = []
  for (const row of rows) {
    if (!row.name || !row.start || isWishStrip(row.name)) continue
    const start = normalizeWallClock(row.start)
    if (!start) continue // unrecoverable date — drop rather than crash the timeline
    const end = row.end ? normalizeWallClock(row.end) : null
    const lane = archiveLane(row.name)
    const clock: Clock = row.timezoneDependent ? 'absolute' : 'server'
    out.push({
      id: slugId(row.name, start),
      name: row.name,
      lane,
      start,
      end,
      clock,
      color: row.color,
      ...(row.image ? { image: `${IMAGE_BASE}${row.image}` } : {}),
      ...(row.url ? { url: row.url } : {}),
      ...(row.description ? { description: row.description } : {}),
      source: 'archive',
    })
  }
  return out
}

/**
 * The full frozen history: wishes from the banners file, everything else from
 * the archive, sorted by start. Any duplicate (same name + start) keeps the
 * first occurrence — banners are added first so they win over any archive stray.
 */
export function buildHistory(
  banners: BannersFile,
  archive: ArchiveRow[],
  art: BannerArtMap = {},
  rows: readonly G8Row[] = [],
): TimelineEvent[] {
  const merged = [...fromBanners(banners, art, rows), ...fromArchive(archive)]
  const seen = new Set<string>()
  const unique: TimelineEvent[] = []
  for (const e of merged) {
    const key = `${normKey(e.name)}@${e.start.slice(0, 10)}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(e)
  }
  return unique.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
}
