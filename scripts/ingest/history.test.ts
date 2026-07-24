import { describe, expect, it } from 'vitest'
import {
  archiveLane,
  buildHistory,
  fromArchive,
  fromBanners,
  isWishStrip,
  normalizeWallClock,
  parseG8Tsv,
  resolveBannerArt,
  titleCaseSlug,
} from './history'
import type { ArchiveRow, BannerEntry, BannersFile, G8Row } from './history'

const banner = (over: Partial<BannerEntry> = {}): BannerEntry => ({
  name: 'Conjuring Chiaroscuro',
  shortName: 'Lyney',
  start: '2023-08-16 06:00:00',
  end: '2023-09-05 17:59:59',
  color: '#fcc6c8',
  featured: ['lyney', 'yelan'],
  featuredRare: ['bennett', 'barbara', 'lynette'],
  version: '4.0',
  timezoneDependent: true,
  ...over,
})

const row = (over: Partial<ArchiveRow> = {}): ArchiveRow => ({
  name: 'Energy Amplifier Initiation',
  start: '2021-05-08 10:00:00',
  end: '2021-05-17 03:59:59',
  color: '#F9E7CC',
  image: 'energy_amplifier.jpg',
  ...over,
})

describe('titleCaseSlug', () => {
  it('title-cases underscore-separated slugs', () => {
    expect(titleCaseSlug('polar_star')).toBe('Polar Star')
    expect(titleCaseSlug('lyney')).toBe('Lyney')
  })
})

describe('normalizeWallClock', () => {
  it('passes through canonical strings', () => {
    expect(normalizeWallClock('2021-10-21 10:00:00')).toBe('2021-10-21 10:00:00')
  })

  it('repairs the archive typos', () => {
    expect(normalizeWallClock('2021-04-8 23:59:59')).toBe('2021-04-08 23:59:59')
    expect(normalizeWallClock('2022-10-7 23:59:59')).toBe('2022-10-07 23:59:59')
    expect(normalizeWallClock('2025-12-1 03:59:59')).toBe('2025-12-01 03:59:59')
    expect(normalizeWallClock('202110-21 10:00:00')).toBe('2021-10-21 10:00:00')
    expect(normalizeWallClock('2026-0116 10:00:00')).toBe('2026-01-16 10:00:00')
  })

  it('returns null for unrecoverable strings', () => {
    expect(normalizeWallClock('not a date')).toBeNull()
    expect(normalizeWallClock('2021-10-21')).toBeNull()
  })
})

describe('fromArchive date repair', () => {
  it('repairs a malformed start and keeps the row', () => {
    const [e] = fromArchive([row({ name: 'Labyrinth Warriors', start: '202110-21 10:00:00' })])
    expect(e!.start).toBe('2021-10-21 10:00:00')
  })

  it('drops a row whose start cannot be salvaged', () => {
    expect(fromArchive([row({ start: 'garbage' })])).toHaveLength(0)
  })
})

describe('fromBanners', () => {
  it('maps the three wish lanes and skips permanent banners', () => {
    const file: BannersFile = {
      beginners: [banner({ name: "Beginners' Wish" })],
      standard: [banner({ name: 'Wanderlust Invocation' })],
      characters: [banner()],
      weapons: [banner({ name: 'Epitome Invocation' })],
      chronicled: [banner({ name: 'Roving Chalice of Dewgrass' })],
    }
    const events = fromBanners(file)
    expect(events.map((e) => e.lane).sort()).toEqual(['character-wish', 'chronicled', 'weapon-wish'])
    expect(events.every((e) => e.source === 'archive')).toBe(true)
    // beginners/standard are permanent, never timeline events
    expect(events.some((e) => e.name === "Beginners' Wish")).toBe(false)
  })

  it('builds the featured roster from the two rarity slug arrays', () => {
    const [char] = fromBanners({ characters: [banner()] })
    expect(char!.featured).toEqual([
      { name: 'Lyney', rarity: 5 },
      { name: 'Yelan', rarity: 5 },
      { name: 'Bennett', rarity: 4 },
      { name: 'Barbara', rarity: 4 },
      { name: 'Lynette', rarity: 4 },
    ])
  })

  it('marks wishes as absolute-clock and carries the version', () => {
    const [char] = fromBanners({ characters: [banner()] })
    expect(char!.clock).toBe('absolute')
    expect(char!.version).toBe('4.0')
  })

  it('attaches game8 banner art when the name is in the art map', () => {
    const art = { conjuringchiaroscuro: { image: 'https://img.game8.co/1/abc.png/show' } }
    const [char] = fromBanners({ characters: [banner()] }, art)
    expect(char!.image).toBe('https://img.game8.co/1/abc.png/show')
  })

  it('carries no image when the banner name is not in the art map', () => {
    const [char] = fromBanners({ characters: [banner()] }, {})
    expect(char!.image).toBeUndefined()
  })

  it('carries no image when the art map is omitted entirely', () => {
    const [char] = fromBanners({ characters: [banner()] })
    expect(char!.image).toBeUndefined()
  })
})

const g8 = (over: Partial<G8Row> = {}): G8Row => ({
  name: 'Conjuring Chiaroscuro',
  start: '2023-08-16',
  end: '2023-09-05',
  image: 'https://img.game8.co/1/window.png/show',
  ...over,
})

describe('parseG8Tsv', () => {
  it('parses tab-separated rows', () => {
    const rows = parseG8Tsv(
      'Frostedge Nocturne\t2026-06-09\t2026-06-30\thttps://img.game8.co/1/a.png/show\n',
    )
    expect(rows).toEqual([
      {
        name: 'Frostedge Nocturne',
        start: '2026-06-09',
        end: '2026-06-30',
        image: 'https://img.game8.co/1/a.png/show',
      },
    ])
  })

  it('drops blank and malformed lines', () => {
    expect(parseG8Tsv('\nonly-a-name\n\t\t\t\n')).toEqual([])
  })

  it('repairs a start year that makes the run impossibly long', () => {
    const [r] = parseG8Tsv('Phase 2\t2025-03-17\t2026-04-07\thttps://img.game8.co/1/a.png/show')
    expect(r!.start).toBe('2026-03-17')
  })

  it('leaves plausible spans untouched, including cross-year runs', () => {
    const [r] = parseG8Tsv('Phase 2\t2025-12-23\t2026-01-13\thttps://img.game8.co/1/a.png/show')
    expect(r!.start).toBe('2025-12-23')
  })
})

describe('resolveBannerArt', () => {
  const key = 'conjuringchiaroscuro@2023-08-16'
  const entry = {
    name: 'Conjuring Chiaroscuro',
    start: '2023-08-16 06:00:00',
    lane: 'character-wish' as const,
  }
  const weapon = {
    name: 'Epitome Invocation',
    start: '2023-08-16 06:00:00',
    lane: 'weapon-wish' as const,
  }

  it('prefers a same-window name match over the global map, so reruns keep their own art', () => {
    const art = { conjuringchiaroscuro: { image: 'https://img.game8.co/1/first-run.png/show' } }
    const resolved = resolveBannerArt([entry], [g8()], art)
    expect(resolved.get(key)).toBe('https://img.game8.co/1/window.png/show')
  })

  it('falls back to the global name map when no row shares the window', () => {
    const art = { conjuringchiaroscuro: { image: 'https://img.game8.co/1/first-run.png/show' } }
    const resolved = resolveBannerArt([entry], [g8({ start: '2024-01-01' })], art)
    expect(resolved.get(key)).toBe('https://img.game8.co/1/first-run.png/show')
  })

  it('never pairs a named leftover row with the weapon lane (dual-banner windows)', () => {
    // paimon merges dual character banners into one entry, so game8's row for the
    // second banner is left over — it is character art, not Epitome Invocation art.
    const rows = [g8(), g8({ name: "Starry Night's Whispers", image: 'https://img.game8.co/1/second-char.png/show' })]
    const resolved = resolveBannerArt([entry, weapon], rows, {})
    expect(resolved.get(key)).toBe('https://img.game8.co/1/window.png/show')
    expect(resolved.has('epitomeinvocation@2023-08-16')).toBe(false)
  })

  it('pairs the single leftover named row with the single artless non-weapon banner', () => {
    const unmatchedChar = {
      name: 'To the Looking-Glass the Mademoiselle Said',
      start: '2023-08-16 06:00:00',
      lane: 'character-wish' as const,
    }
    const rows = [g8({ name: 'Some game8 Title', image: 'https://img.game8.co/1/char.png/show' })]
    const resolved = resolveBannerArt([unmatchedChar, weapon], rows, {})
    expect(resolved.get('tothelookingglassthemademoisellesaid@2023-08-16')).toBe(
      'https://img.game8.co/1/char.png/show',
    )
    expect(resolved.has('epitomeinvocation@2023-08-16')).toBe(false)
  })

  it('matches window rows whose scraped name carries a version prefix', () => {
    const chron = {
      name: 'Ode to the Dawn Breeze',
      start: '2026-02-25 06:00:00',
      lane: 'chronicled' as const,
    }
    const rows = [
      g8({ name: '6.4 Ode to the Dawn Breeze', start: '2026-02-25', image: 'https://img.game8.co/1/v64.png/show' }),
    ]
    const art = { odetothedawnbreeze: { image: 'https://img.game8.co/1/old-run.png/show' } }
    const resolved = resolveBannerArt([chron], rows, art)
    expect(resolved.get('odetothedawnbreeze@2026-02-25')).toBe('https://img.game8.co/1/v64.png/show')
  })

  it('gives a phase-labelled row to the weapon lane even when a character is also artless', () => {
    const unmatchedChar = {
      name: 'Born of Ocean Swell',
      start: '2023-08-16 06:00:00',
      lane: 'character-wish' as const,
    }
    const rows = [g8({ name: 'Phase 2', image: 'https://img.game8.co/1/phase.png/show' })]
    const resolved = resolveBannerArt([unmatchedChar, weapon], rows, {})
    expect(resolved.get('epitomeinvocation@2023-08-16')).toBe('https://img.game8.co/1/phase.png/show')
    expect(resolved.has('bornofoceanswell@2023-08-16')).toBe(false)
  })

  it('never gives a phase-labelled row to a non-weapon banner', () => {
    const rows = [g8({ name: 'Phase 1', image: 'https://img.game8.co/1/phase.png/show' })]
    const resolved = resolveBannerArt([entry], rows, {})
    expect(resolved.size).toBe(0)
  })

  it('leaves ambiguous windows alone (two artless banners, two leftover named rows)', () => {
    const other = { name: 'Some Unmatched Banner', start: '2023-08-16 06:00:00', lane: 'character-wish' as const }
    const rows = [
      g8({ name: 'Thematic Name A', image: 'https://img.game8.co/1/a.png/show' }),
      g8({ name: 'Thematic Name B', image: 'https://img.game8.co/1/b.png/show' }),
    ]
    const resolved = resolveBannerArt([weapon, other], rows, {})
    expect(resolved.size).toBe(0)
  })

  it('resolves nothing when there are no rows and no map entry', () => {
    expect(resolveBannerArt([entry], [], {}).size).toBe(0)
  })
})

describe('fromBanners with dated rows', () => {
  it('gives the weapon banner the phase-labelled window art', () => {
    const file: BannersFile = {
      characters: [banner()],
      weapons: [banner({ name: 'Epitome Invocation' })],
    }
    const rows = [g8(), g8({ name: 'Phase 2', image: 'https://img.game8.co/1/weapon.png/show' })]
    const events = fromBanners(file, {}, rows)
    const weapon = events.find((e) => e.lane === 'weapon-wish')
    expect(weapon!.image).toBe('https://img.game8.co/1/weapon.png/show')
  })
})

describe('archiveLane', () => {
  it('classifies recurring lanes by name', () => {
    expect(archiveLane('Spiral Abyss')).toBe('abyss')
    expect(archiveLane('Imaginarium Theater')).toBe('theater')
    expect(archiveLane('Stygian Onslaught')).toBe('stygian')
    expect(archiveLane('Ley Line Overflow')).toBe('leyline')
    expect(archiveLane('Battle Pass - Oceansong')).toBe('battlepass')
  })

  it('falls back to the event lane', () => {
    expect(archiveLane('Energy Amplifier Initiation')).toBe('event')
    expect(archiveLane('Wishes From Teyvat')).toBe('event')
  })
})

describe('isWishStrip', () => {
  it('flags banner strips but not genuine events', () => {
    expect(isWishStrip('Ballad in Goblets - Venti Banner')).toBe(true)
    expect(isWishStrip('Epitome Invocation - Weapon Banner')).toBe(true)
    expect(isWishStrip('Roving Chalice of Dewgrass - Chronicled Wish Banner')).toBe(true)
    expect(isWishStrip('Wishful Drops - Oceanid Event')).toBe(false)
  })
})

describe('fromArchive', () => {
  it('drops wish strips and keeps events', () => {
    const events = fromArchive([row(), row({ name: 'Ballad in Goblets - Venti Banner' })])
    expect(events).toHaveLength(1)
    expect(events[0]!.name).toBe('Energy Amplifier Initiation')
  })

  it('hotlinks the image to paimon.moe', () => {
    const [e] = fromArchive([row()])
    expect(e!.image).toBe('https://paimon.moe/images/events/energy_amplifier.jpg')
  })

  it('derives clock from timezoneDependent', () => {
    expect(fromArchive([row()])[0]!.clock).toBe('server')
    expect(fromArchive([row({ timezoneDependent: true })])[0]!.clock).toBe('absolute')
  })

  it('preserves url and description when present', () => {
    const [e] = fromArchive([row({ url: 'https://x.test', description: 'buff' })])
    expect(e!.url).toBe('https://x.test')
    expect(e!.description).toBe('buff')
  })

  it('skips rows without a name or start', () => {
    expect(fromArchive([row({ name: '' }), row({ start: '' })])).toHaveLength(0)
  })
})

describe('buildHistory', () => {
  it('merges both sources, dedupes on name+date, and sorts by start', () => {
    const banners: BannersFile = { characters: [banner({ start: '2023-08-16 06:00:00' })] }
    const archive: ArchiveRow[] = [
      row({ name: 'Spiral Abyss', start: '2021-05-16 04:00:00', image: undefined, color: '#295a93' }),
      row({ name: 'Spiral Abyss', start: '2021-05-16 04:00:00', image: undefined, color: '#295a93' }),
    ]
    const events = buildHistory(banners, archive)
    expect(events).toHaveLength(2) // one abyss (deduped) + one wish
    expect(events[0]!.start < events[1]!.start).toBe(true)
  })
})
