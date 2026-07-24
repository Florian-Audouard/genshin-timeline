export type Clock = 'server' | 'absolute'

export type ServerRegion = 'asia' | 'europe' | 'america' | 'cht'

export const SERVER_OFFSET: Record<ServerRegion, number> = {
  asia: 8,
  europe: 1,
  america: -5,
  cht: 8,
}

export const ASIA_OFFSET = 8

export type LaneId =
  | 'character-wish'
  | 'weapon-wish'
  | 'chronicled'
  | 'event'
  | 'stygian'
  | 'leyline'
  | 'abyss'
  | 'theater'
  | 'battlepass'

export const LANES: { id: LaneId; label: string }[] = [
  { id: 'character-wish', label: 'Character wish' },
  { id: 'weapon-wish', label: 'Weapon wish' },
  { id: 'chronicled', label: 'Chronicled wish' },
  { id: 'event', label: 'Events' },
  { id: 'stygian', label: 'Stygian onslaught' },
  { id: 'leyline', label: 'Ley line overflow' },
  { id: 'abyss', label: 'Abyss' },
  { id: 'theater', label: 'Theater' },
  { id: 'battlepass', label: 'Battle pass' },
]

export type Element =
  | 'pyro' | 'hydro' | 'anemo' | 'electro' | 'dendro' | 'cryo' | 'geo'

export type Featured = {
  name: string
  rarity: 4 | 5
  element?: Element
}

export type EventSource =
  | 'announcement' | 'calendar' | 'amber' | 'archive' | 'override'

export type TimelineEvent = {
  id: string
  name: string
  lane: LaneId
  start: string
  end: string | null
  clock: Clock
  color: string
  image?: string
  url?: string
  description?: string
  featured?: Featured[]
  version?: string
  source: EventSource
}

export type TimelinePayload = {
  generatedAt: string
  events: TimelineEvent[]
}

/** What the shell can ask of whichever timeline view is mounted. */
export type TimelineHandle = {
  scrollToNow: () => void
  /** Gantt only — the river view has no zoom, so the shell hides its controls. */
  zoomBy?: (factor: number) => void
}
