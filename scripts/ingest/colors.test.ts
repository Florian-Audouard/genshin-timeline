import { describe, expect, it } from 'vitest'
import { resolveColors } from './colors'
import type { TimelineEvent, TimelinePayload } from '../../src/types'

const ev = (over: Partial<TimelineEvent> = {}): TimelineEvent => ({
  id: 'e@2026-01-01',
  name: 'Event',
  lane: 'event',
  start: '2026-01-01',
  end: null,
  clock: 'server',
  color: '#4cc2f1', // DEFAULT_COLOR.event
  source: 'calendar',
  ...over,
})

const payload = (events: TimelineEvent[]): TimelinePayload => ({
  generatedAt: '2026-01-01T00:00:00Z',
  events,
})

const extract = async () => '#abcdef'
const fetchImage = async () => Buffer.from([])

describe('resolveColors', () => {
  it('extracts a color for an imaged event', async () => {
    const { events } = await resolveColors([ev({ image: 'http://cdn/a.jpg' })], null, {
      fetchImage,
      extract,
    })
    expect(events[0]!.color).toBe('#abcdef')
  })

  it('leaves an override color untouched', async () => {
    const { events } = await resolveColors(
      [ev({ image: 'http://cdn/a.jpg', color: '#123456', source: 'override' })],
      null,
      { fetchImage, extract },
    )
    expect(events[0]!.color).toBe('#123456')
  })

  it('does not extract for a fixed-color lane even when it has an image', async () => {
    let fetched = 0
    const { events } = await resolveColors(
      [ev({ lane: 'stygian', color: '#1c1724', image: 'http://cdn/a.jpg' })],
      null,
      {
        fetchImage: async () => {
          fetched++
          return Buffer.from([])
        },
        extract,
      },
    )
    expect(events[0]!.color).toBe('#1c1724')
    expect(fetched).toBe(0)
  })

  it('keeps the lane default when there is no image', async () => {
    const { events } = await resolveColors([ev()], null, { fetchImage, extract })
    expect(events[0]!.color).toBe('#4cc2f1')
  })

  it('reuses a previously resolved color instead of fetching', async () => {
    let fetched = 0
    const prev = payload([ev({ image: 'http://cdn/a.jpg', color: '#0a0b0c' })])
    const { events } = await resolveColors([ev({ image: 'http://cdn/a.jpg' })], prev, {
      fetchImage: async () => {
        fetched++
        return Buffer.from([])
      },
      extract,
    })
    expect(events[0]!.color).toBe('#0a0b0c')
    expect(fetched).toBe(0)
  })

  it('does not cache a color equal to the lane default (stays retryable)', async () => {
    // previous run fell back to the default → treat as unresolved and try again
    const prev = payload([ev({ image: 'http://cdn/a.jpg', color: '#4cc2f1' })])
    const { events } = await resolveColors([ev({ image: 'http://cdn/a.jpg' })], prev, {
      fetchImage,
      extract,
    })
    expect(events[0]!.color).toBe('#abcdef')
  })

  it('falls back to the lane default and warns on a fetch failure', async () => {
    const { events, warnings } = await resolveColors([ev({ image: 'http://cdn/a.jpg' })], null, {
      fetchImage: async () => {
        throw new Error('boom')
      },
      extract,
    })
    expect(events[0]!.color).toBe('#4cc2f1')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('boom')
  })

  it('never fetches in offline mode; reuses cache or keeps the default', async () => {
    let fetched = 0
    const prev = payload([ev({ image: 'http://cdn/a.jpg', color: '#0a0b0c' })])
    const { events } = await resolveColors(
      [ev({ image: 'http://cdn/a.jpg' }), ev({ id: 'b', image: 'http://cdn/b.jpg' })],
      prev,
      {
        offline: true,
        fetchImage: async () => {
          fetched++
          return Buffer.from([])
        },
        extract,
      },
    )
    expect(events[0]!.color).toBe('#0a0b0c') // reused
    expect(events[1]!.color).toBe('#4cc2f1') // default, uncached
    expect(fetched).toBe(0)
  })
})
