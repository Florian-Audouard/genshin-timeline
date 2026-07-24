import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { buildHistory, parseG8Tsv } from './history'
import { stripLaneStyle } from '../../src/lib/lanes'
import type { ArchiveRow, BannerArtMap, BannersFile } from './history'
import type { TimelinePayload } from '../../src/types'

/**
 * One-time build of the frozen history file. Reads the two committed research
 * inputs, transforms them into TimelineEvents, and writes public/data/history.json.
 * The scheduled ingest never touches this file — run it by hand and commit the
 * result when the historical inputs change:
 *
 *   bun run build:history
 */

const ARCHIVE = 'research/data/timeline_archive.json'
const BANNERS = '../../research/data/paimon_banners.js'
const BANNER_ART = 'research/data/g8_banner_art.json'
const BANNER_TSV = 'research/data/g8_banners.tsv'
const OUT_DIR = 'public/data'
const OUT_FILE = `${OUT_DIR}/history.json`

async function main() {
  const archive = JSON.parse(await readFile(ARCHIVE, 'utf8')) as ArchiveRow[]
  const { banners } = (await import(BANNERS)) as { banners: BannersFile }
  const art = JSON.parse(await readFile(BANNER_ART, 'utf8')) as BannerArtMap
  const rows = parseG8Tsv(await readFile(BANNER_TSV, 'utf8'))

  const events = buildHistory(banners, archive, art, rows)
  if (events.length === 0) {
    console.error('error: built 0 history events — refusing to write')
    process.exit(1)
  }

  // Constant lanes (abyss/leyline/theater/stygian) don't persist a color/image —
  // their look is a lane constant reapplied at render (see stripLaneStyle).
  const payload: TimelinePayload = {
    generatedAt: new Date().toISOString(),
    events: stripLaneStyle(events),
  }

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  const first = events[0]!.start.slice(0, 10)
  const last = events[events.length - 1]!.start.slice(0, 10)
  console.log(`wrote ${OUT_FILE} — ${events.length} events, ${first} → ${last}`)
}

main().catch((err) => {
  console.error(`build-history failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
