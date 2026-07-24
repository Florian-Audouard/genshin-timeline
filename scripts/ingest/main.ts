import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fetchAll } from './sources'
import { merge } from './merge'
import { resolveColors } from './colors'
import { stripLaneStyle } from '../../src/lib/lanes'
import type { OverrideFile } from './merge'
import type { TimelineEvent, TimelinePayload } from '../../src/types'

const OUT_DIR = 'public/data'
const OUT_FILE = `${OUT_DIR}/current.json`

/**
 * Append-only upsert into the accumulating store: every live row is inserted or
 * updated by id, and nothing is ever removed. This is what turns a live snapshot
 * (which only reports the current ~30-day window) into a growing archive — once
 * an event scrolls out of the feed, its last-known-good row stays here forever.
 */
function upsertById(store: TimelineEvent[], incoming: TimelineEvent[]): TimelineEvent[] {
  const byId = new Map(store.map((e) => [e.id, e]))
  for (const e of incoming) byId.set(e.id, e)
  return [...byId.values()].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
}

async function readOverrides(): Promise<OverrideFile> {
  try {
    const parsed = JSON.parse(await readFile('data/overrides.json', 'utf8'))
    return { rows: parsed.rows ?? [] }
  } catch {
    return { rows: [] }
  }
}

/** The last-written payload, used as the color cache. Absent on the first run. */
async function readPreviousPayload(): Promise<TimelinePayload | null> {
  try {
    return JSON.parse(await readFile(OUT_FILE, 'utf8')) as TimelinePayload
  } catch {
    return null
  }
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const offline = args.has('--offline')
  const dry = args.has('--dry')

  const raw = await fetchAll(offline)
  const { events, warnings } = merge(raw, await readOverrides())

  // Derive each bar's fill from its banner art, reusing colors already resolved
  // in the previous payload so unchanged images are never re-fetched.
  const previous = await readPreviousPayload()
  const { events: colored, warnings: colorWarnings } = await resolveColors(events, previous, {
    offline,
  })
  warnings.push(...colorWarnings)

  for (const w of warnings) console.warn(`warn: ${w}`)

  // Accumulate: fold this run's live rows into whatever the store already holds.
  // A failed fetch can no longer wipe history — it just upserts nothing.
  const store = upsertById(previous?.events ?? [], colored)

  if (store.length === 0) {
    console.error('error: store is empty — refusing to write a degraded dataset')
    process.exit(1)
  }

  // Constant lanes never persist a color/image — their look is a lane constant
  // (LANE_STYLE), reapplied at render. Strip only on the way out so the store
  // above stays usable as the next run's color cache.
  const payload: TimelinePayload = {
    generatedAt: new Date().toISOString(),
    events: stripLaneStyle(store),
  }
  const json = `${JSON.stringify(payload, null, 2)}\n`

  if (dry) {
    let prevJson = ''
    try { prevJson = await readFile(OUT_FILE, 'utf8') } catch { prevJson = '' }
    const changed = prevJson !== json
    console.log(`${colored.length} live rows → ${store.length} in store, ${warnings.length} warnings`)
    console.log(changed ? 'would write: content changed' : 'would write: no change')
    for (const e of colored) console.log(`  ${e.lane.padEnd(16)} ${e.start}  ${e.name}`)
    return
  }

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(OUT_FILE, json, 'utf8')
  console.log(`wrote ${OUT_FILE} — ${store.length} events (${colored.length} live), ${warnings.length} warnings`)
}

main().catch((err) => {
  console.error(`ingest failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
