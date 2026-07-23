import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fetchAll } from './sources'
import { merge } from './merge'
import type { OverrideFile } from './merge'
import type { TimelinePayload } from '../../src/types'

const OUT_DIR = 'public/data'
const OUT_FILE = `${OUT_DIR}/current.json`
const WINDOW_BACK_DAYS = 30
const WINDOW_FORWARD_DAYS = 120

async function readOverrides(): Promise<OverrideFile> {
  try {
    const parsed = JSON.parse(await readFile('data/overrides.json', 'utf8'))
    return { rows: parsed.rows ?? [] }
  } catch {
    return { rows: [] }
  }
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const offline = args.has('--offline')
  const dry = args.has('--dry')

  const raw = await fetchAll(offline)
  const { events, warnings } = merge(raw, await readOverrides())

  const now = Date.now()
  const from = new Date(now - WINDOW_BACK_DAYS * 86_400_000).toISOString().slice(0, 10)
  const to = new Date(now + WINDOW_FORWARD_DAYS * 86_400_000).toISOString().slice(0, 10)
  const windowed = events.filter((e) => e.start.slice(0, 10) <= to && (e.end ?? '9999') >= from)

  for (const w of warnings) console.warn(`warn: ${w}`)

  if (windowed.length === 0) {
    console.error('error: merged 0 events — refusing to write a degraded dataset')
    process.exit(1)
  }

  const payload: TimelinePayload = {
    generatedAt: new Date().toISOString(),
    events: windowed,
  }
  const json = `${JSON.stringify(payload, null, 2)}\n`

  if (dry) {
    let previous = ''
    try { previous = await readFile(OUT_FILE, 'utf8') } catch { previous = '' }
    const changed = previous !== json
    console.log(`${windowed.length} events, ${warnings.length} warnings`)
    console.log(changed ? 'would write: content changed' : 'would write: no change')
    for (const e of windowed) console.log(`  ${e.lane.padEnd(16)} ${e.start}  ${e.name}`)
    return
  }

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(OUT_FILE, json, 'utf8')
  console.log(`wrote ${OUT_FILE} — ${windowed.length} events, ${warnings.length} warnings`)
}

main().catch((err) => {
  console.error(`ingest failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
