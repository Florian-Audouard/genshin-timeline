import { describe, expect, it } from 'vitest'
import { amberIndex, clockFor, fromCalendar, laneFor, normKey, slugId } from './sources'

describe('slugId', () => {
  it('builds a stable id from name and start', () => {
    expect(slugId('Somnias a Luna', '2026-07-21 18:00:00')).toBe('somnias-a-luna@2026-07-21T18:00:00')
  })

  it('collapses punctuation and case', () => {
    expect(slugId("Paimon's Bargain!", '2026-01-01 00:00:00')).toBe("paimon-s-bargain@2026-01-01T00:00:00")
  })
})

describe('normKey', () => {
  it('removes every non-alphanumeric character rather than replacing it', () => {
    expect(normKey('Ley Line Overflow')).toBe('leylineoverflow')
  })

  it('matches the reference implementation on punctuation', () => {
    expect(normKey('Event Wish "Somnias a Luna"')).toBe('eventwishsomniasaluna')
  })
})

describe('amberIndex', () => {
  it('keys entries by their normalized English name', () => {
    const idx = amberIndex({
      '1234': { name: { EN: 'Sunny Summer Fontinalia', JP: 'x' }, banner: { EN: 'https://a/b.png' } },
    })
    expect(idx.get('sunnysummerfontinalia')?.banner?.EN).toBe('https://a/b.png')
  })
})

describe('laneFor', () => {
  it('routes a banner with characters to the character wish lane', () => {
    expect(laneFor('banner', 'Somnias a Luna', true)).toBe('character-wish')
  })

  it('routes a banner without characters to the weapon wish lane', () => {
    expect(laneFor('banner', 'Epitome Invocation', false)).toBe('weapon-wish')
  })

  it('routes a chronicled wish by name regardless of roster', () => {
    expect(laneFor('banner', 'Chronicled Wish - Fontaine', true)).toBe('chronicled')
  })

  it('routes the abyss challenge', () => {
    expect(laneFor('challenge', 'Abyssal Moon Spire', false)).toBe('abyss')
  })

  it('routes the theater challenge', () => {
    expect(laneFor('challenge', 'Imaginarium Theater', false)).toBe('theater')
  })

  it('routes stygian onslaught out of the general event lane', () => {
    expect(laneFor('event', 'Stygian Onslaught', false)).toBe('stygian')
  })

  it('routes ley line overflow out of the general event lane', () => {
    expect(laneFor('event', 'Ley Line Overflow', false)).toBe('leyline')
  })

  it('routes battle pass', () => {
    expect(laneFor('event', 'Battle Pass: Sojourner', false)).toBe('battlepass')
  })

  it('falls back to the general event lane', () => {
    expect(laneFor('event', 'Sunny Summer Fontinalia', false)).toBe('event')
  })
})

describe('clockFor', () => {
  it('marks wish lanes as absolute', () => {
    expect(clockFor('character-wish')).toBe('absolute')
    expect(clockFor('weapon-wish')).toBe('absolute')
    expect(clockFor('chronicled')).toBe('absolute')
  })

  it('marks battle pass as absolute', () => {
    expect(clockFor('battlepass')).toBe('absolute')
  })

  it('marks in-game events and challenges as server clock', () => {
    expect(clockFor('event')).toBe('server')
    expect(clockFor('abyss')).toBe('server')
    expect(clockFor('theater')).toBe('server')
    expect(clockFor('stygian')).toBe('server')
  })
})

describe('fromCalendar', () => {
  it('converts unix seconds to asia wall clock strings', () => {
    const rows = fromCalendar({
      events: [{
        id: 1, name: 'Sunny Summer Fontinalia', description: 'd',
        image_url: 'https://img/x.png',
        start_time: '1782784800', end_time: '1786497540',
      }],
      banners: [], challenges: [],
    })
    expect(rows[0]!.lane).toBe('event')
    expect(rows[0]!.start).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(rows[0]!.source).toBe('calendar')
  })

  it('drops zeroed timestamps so the merge can backfill them', () => {
    const rows = fromCalendar({
      events: [{
        id: 2, name: 'Ley Line Overflow', description: '',
        image_url: '', start_time: '0', end_time: '0',
      }],
      banners: [], challenges: [],
    })
    expect(rows[0]!.start).toBe('')
    expect(rows[0]!.end).toBeNull()
  })

  it('carries the featured roster off a character banner', () => {
    const rows = fromCalendar({
      events: [], challenges: [],
      banners: [{
        name: 'Somnias a Luna', version: '6.7',
        start_time: '1782784800', end_time: '1784599140',
        characters: [{ name: 'Columbina', rarity: '5', element: 'Electro', icon: '' }],
        weapons: [],
      }],
    })
    expect(rows[0]!.lane).toBe('character-wish')
    expect(rows[0]!.clock).toBe('absolute')
    expect(rows[0]!.featured).toEqual([{ name: 'Columbina', rarity: 5, element: 'electro' }])
    expect(rows[0]!.version).toBe('6.7')
  })
})
