import { describe, expect, it } from 'vitest'
import { merge } from './merge'
import type { RawSources } from './sources'

const encode = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;')

const annWith = (title: string, start: string, end: string) => ({
  ann_id: 1,
  title,
  banner: 'https://cdn/art.jpg',
  content: encode(
    `<p>〓Event Duration〓</p><p><t class="t_lc">${start}</t> – <t class="t_lc">${end}</t></p>`,
  ),
})

const raw = (over: Partial<RawSources> = {}): RawSources => ({
  calendar: { events: [], banners: [], challenges: [] },
  announcements: [],
  amber: {},
  ...over,
})

const empty = { rows: [] }

describe('merge', () => {
  it('backfills a zeroed calendar row from a matching announcement', () => {
    const result = merge(raw({
      calendar: {
        events: [{
          id: 1, name: 'Dance Dance Easy-Breezy Disco', description: '',
          image_url: '', start_time: '0', end_time: '0',
        }],
        banners: [], challenges: [],
      },
      announcements: [annWith('Dance Dance Easy-Breezy Disco', '2026/07/24 10:00', '2026/08/03 03:59')],
    }), empty)

    const ev = result.events.find((e) => e.name.startsWith('Dance Dance'))!
    expect(ev.start).toBe('2026-07-24 10:00:00')
    expect(ev.end).toBe('2026-08-03 03:59:59')
    expect(ev.source).toBe('announcement')
  })

  it('does not overwrite a dated calendar row with announcement dates', () => {
    const result = merge(raw({
      calendar: {
        events: [{
          id: 1, name: 'Stygian Onslaught', description: '',
          image_url: '', start_time: '1783562400', end_time: '1786497540',
        }],
        banners: [], challenges: [],
      },
      announcements: [annWith('Stygian Onslaught', '2020/01/01 00:00', '2020/01/02 00:00')],
    }), empty)

    expect(result.events[0]!.start).not.toBe('2020-01-01 00:00:00')
    expect(result.events[0]!.source).toBe('calendar')
  })

  it('takes banner art from the announcement when the calendar has none', () => {
    const result = merge(raw({
      calendar: {
        events: [{
          id: 1, name: 'Stygian Onslaught', description: '',
          image_url: '', start_time: '1783562400', end_time: '1786497540',
        }],
        banners: [], challenges: [],
      },
      announcements: [annWith('Stygian Onslaught', '2026/07/08 10:00', '2026/08/11 03:59')],
    }), empty)

    expect(result.events[0]!.image).toBe('https://cdn/art.jpg')
  })

  it('lets an override win over every fetched source', () => {
    const result = merge(raw({
      calendar: {
        events: [{
          id: 1, name: 'Ley Line Overflow', description: '',
          image_url: '', start_time: '0', end_time: '0',
        }],
        banners: [], challenges: [],
      },
    }), {
      rows: [{
        name: 'Ley Line Overflow', lane: 'leyline',
        start: '2026-07-27 04:00:00', end: '2026-08-03 03:59:59',
        clock: 'server', color: '#a5c83b',
      }],
    })

    const ev = result.events.find((e) => e.lane === 'leyline')!
    expect(ev.start).toBe('2026-07-27 04:00:00')
    expect(ev.source).toBe('override')
    expect(result.events.filter((e) => e.lane === 'leyline')).toHaveLength(1)
  })

  it('warns about rows that stay undated and drops them', () => {
    const result = merge(raw({
      calendar: {
        events: [{
          id: 1, name: 'Mystery Event', description: '',
          image_url: '', start_time: '0', end_time: '0',
        }],
        banners: [], challenges: [],
      },
    }), empty)

    expect(result.events).toHaveLength(0)
    expect(result.warnings.join(' ')).toMatch(/Mystery Event/)
  })

  it('renames a banner to the wish name carried by its announcement', () => {
    const result = merge(raw({
      calendar: {
        events: [], challenges: [],
        banners: [{
          name: 'Columbina', version: '6.7',
          start_time: '1782784800', end_time: '1784599140',
          characters: [{ name: 'Columbina', rarity: '5', element: 'Electro', icon: '' }],
          weapons: [],
        }],
      },
      announcements: [{
        ann_id: 42,
        title: 'Event Wish "Somnias a Luna" - Boost for Columbina',
        banner: 'https://cdn/wish.jpg',
        content: '',
      }],
    }), empty)

    expect(result.events[0]!.name).toBe('Somnias a Luna')
    expect(result.events[0]!.url).toBe('https://www.hoyolab.com/article/42')
  })

  it('sorts output by start instant', () => {
    const result = merge(raw({
      calendar: {
        events: [
          { id: 1, name: 'Later', description: '', image_url: '', start_time: '1786497540', end_time: '1786597540' },
          { id: 2, name: 'Earlier', description: '', image_url: '', start_time: '1782784800', end_time: '1782884800' },
        ],
        banners: [], challenges: [],
      },
    }), empty)

    expect(result.events.map((e) => e.name)).toEqual(['Earlier', 'Later'])
  })
})
