import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { fetchAll } from './sources'
import { merge } from './merge'
import type { LaneId } from '../../src/types'

const FIXTURES = 'scripts/ingest/__fixtures__'

type PythonRow = {
  lane: 'event' | 'banner' | 'challenge'
  name: string
  start: string | null
  end: string | null
}

// The reference uses three coarse lanes; the app splits them into nine.
function collapse(lane: LaneId): PythonRow['lane'] {
  if (lane === 'character-wish' || lane === 'weapon-wish' || lane === 'chronicled') return 'banner'
  if (lane === 'abyss' || lane === 'theater') return 'challenge'
  return 'event'
}

// Compare to the minute. The reference writes ':00' seconds for an end bound;
// the port writes ':59', because an event billed as ending 03:59 runs through
// that whole minute. That difference is intentional and is the only one allowed.
const minute = (s: string) => s.slice(0, 16)

const key = (lane: string, name: string, start: string, end: string) =>
  `${lane}|${name}|${minute(start)}|${minute(end)}`

describe('parity with research/fetch_timeline.py', () => {
  it('produces the same lane, name and window for every fully-dated reference row', async () => {
    const reference: PythonRow[] = JSON.parse(
      await readFile(`${FIXTURES}/python-reference.json`, 'utf8'),
    )
    const { events } = merge(await fetchAll(true, FIXTURES), { rows: [] })

    const ours = new Set(events.map((e) => key(collapse(e.lane), e.name, e.start, e.end ?? e.start)))
    const theirs = reference
      .filter((r) => r.start && r.end)
      .map((r) => key(r.lane, r.name, r.start!, r.end!))

    const missing = theirs.filter((k) => !ours.has(k))
    expect(missing).toEqual([])
  })

  it('resolves at least as many rows as the reference', async () => {
    const reference: PythonRow[] = JSON.parse(
      await readFile(`${FIXTURES}/python-reference.json`, 'utf8'),
    )
    const { events } = merge(await fetchAll(true, FIXTURES), { rows: [] })
    expect(events.length).toBeGreaterThanOrEqual(reference.filter((r) => r.start && r.end).length)
  })
})
