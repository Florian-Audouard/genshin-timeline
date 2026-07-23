# Core Timeline App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static Genshin event timeline that keeps itself current — automated ingest committed by CI, a command deck answering "what's urgent", and a timeline that renders as a gantt on desktop and an agenda river on mobile.

**Architecture:** A TypeScript ingest script fetches three upstream sources outside the browser (the authoritative one is CORS-blocked), merges them into one normalized `TimelineEvent[]`, and writes static JSON. The React app fetches that JSON from its own origin. All time and layout logic lives in two pure, React-free, unit-tested modules; every component is presentational.

**Tech Stack:** Bun, Vite, React 19, TypeScript, Tailwind v4 (CSS-first), Vitest, GitHub Actions.

Implements slices 1–3 of [the design spec](../specs/2026-07-23-genshin-timeline-design.md). Slices 4–6 (time travel, banner search, URL state) are a separate plan.

## Global Constraints

- **Frontend only.** No backend, no database, nothing executing at request time. The only build-time process is the ingest script run by CI.
- **Runtime:** Bun. No Python in the app or in CI.
- **Every event carries `clock: 'server' | 'absolute'`.** Never inferred at render time. `'absolute'` = fixed instant stored as Asia UTC+8 (wish banners, Battle Pass). `'server'` = wall-clock on the player's own server (in-game events).
- **Server offsets, exact:** Asia `+8`, Europe `+1`, America `-5`, TW/HK/MO `+8`.
- **Never use `new Date(string)` on a wall-clock string.** `new Date('2026-07-23 10:00:00')` parses as *local* time and silently differs per machine. Always parse manually into UTC parts.
- **Directory meanings are fixed:** `data/` = hand-maintained ingest input. `public/data/` = generated output, never hand-edited. `src/state/` = runtime app state.
- **`src/lib/time.ts` and `src/lib/timeline.ts` are pure and React-free**, with Vitest coverage. They hold the two kinds of logic whose bugs are invisible: timezone arithmetic that renders plausibly while being wrong, and lane packing that looks fine until two events overlap. Everything else is presentational and is verified by looking at it.
- **The ingest is TypeScript on Bun, and the workflow file holds no logic** — checkout, install, `bun run ingest`, commit if changed. The command CI runs is the command you run locally.
- **Single dark theme.** No light mode, no theme toggle.
- **Copy is sentence case.** No emoji anywhere in the UI.

## File Structure

| File | Responsibility |
|---|---|
| `src/types.ts` | `TimelineEvent`, `LaneId`, `Clock`, `ServerRegion`. Shared by app and ingest — one source of truth |
| `src/lib/time.ts` | Wall-clock parsing, clock-semantic resolution, countdown formatting, status |
| `src/lib/timeline.ts` | Window filtering, lane packing, percent positioning |
| `src/state/store.ts` | Server choice, localStorage-backed |
| `src/state/useIsDesktop.ts` | Viewport breakpoint hook driving the renderer swap |
| `src/data/useTimeline.ts` | Fetches `public/data/current.json`, exposes loading/error/data |
| `src/components/CommandDeck.tsx` | Ending soon, current banners, next up |
| `src/components/TimelineGantt.tsx` | Desktop horizontal renderer |
| `src/components/TimelineRiver.tsx` | Mobile vertical renderer |
| `src/components/EventDetail.tsx` | Shared detail sheet |
| `scripts/ingest/announcements.ts` | Source A: entity-decode, extract event windows |
| `scripts/ingest/sources.ts` | Sources B and C: fetch and adapt to partial rows |
| `scripts/ingest/merge.ts` | Precedence, backfill, override application |
| `scripts/ingest/main.ts` | CLI: `--dry`, `--offline`, emit |
| `scripts/ingest/parity.test.ts` | Asserts the port matches `research/fetch_timeline.py` on frozen fixtures |
| `data/overrides.json` | Hand-maintained rows for the Ley Line Overflow gap |

---

### Task 1: Scaffold and theme tokens

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`
- Create: `src/main.tsx`, `src/App.tsx`, `src/index.css`

**Interfaces:**
- Consumes: nothing
- Produces: a working `bun run dev` / `bun run build` / `bun run test`, and the Tailwind theme token names every later component uses (`bg-bg`, `text-gold`, `border-border`, `text-electro`, …)

- [ ] **Step 1: Install dependencies**

```bash
cd C:/Users/nairo/Documents/WorkSpace/genshin-timeline
bun add react react-dom
bun add -d vite @vitejs/plugin-react typescript @types/react @types/react-dom tailwindcss @tailwindcss/vite vitest
```

- [ ] **Step 2: Write the config files**

`package.json` — replace the `scripts` block with exactly this:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "ingest": "bun run scripts/ingest/main.ts"
  }
}
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src", "scripts"]
}
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Genshin timeline</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Write the theme tokens**

`src/index.css`:

```css
@import "tailwindcss";

@theme {
  --color-bg: #0d0f1a;
  --color-surface: #151827;
  --color-surface-hi: #1c2036;
  --color-border: #262b40;
  --color-text: #e8eaf5;
  --color-dim: #8b90ad;
  --color-gold: #d3bc8e;
  --color-gold-deep: #3a2f14;
  --color-urgent: #ff5470;

  --color-pyro: #ff6640;
  --color-hydro: #4cc2f1;
  --color-anemo: #5fd7a6;
  --color-electro: #b38df0;
  --color-dendro: #a5c83b;
  --color-cryo: #8fdfea;
  --color-geo: #f0b73a;
}

html, body, #root {
  height: 100%;
}

body {
  background: var(--color-bg);
  color: var(--color-text);
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 4: Write the entry point**

`src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/App.tsx`:

```tsx
export function App() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-gold text-sm tracking-[0.12em] uppercase">Genshin timeline</h1>
    </main>
  )
}
```

- [ ] **Step 5: Verify the build passes**

Run: `bun run build`
Expected: exits 0, writes `dist/`. No TypeScript errors.

- [ ] **Step 6: Verify it renders**

Run: `bun run dev`, open the printed URL.
Expected: near-black page, gold uppercase "GENSHIN TIMELINE" in the top left. Stop the server.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold vite + react + tailwind with dark gold tokens"
```

---

### Task 2: Shared types

**Files:**
- Create: `src/types.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `TimelineEvent`, `LaneId`, `Clock`, `ServerRegion`, `Element`, `SERVER_OFFSET`, `LANES` — imported by every subsequent task, app and ingest alike

- [ ] **Step 1: Write the types**

`src/types.ts`:

```ts
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
```

- [ ] **Step 2: Verify it typechecks**

Run: `bun run build`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared TimelineEvent types"
```

---

### Task 3: Time module — the two-clock model

This is the highest-risk module in the system. A timezone error renders perfectly and is silently wrong by up to 15 hours.

**Files:**
- Create: `src/lib/time.ts`
- Test: `src/lib/time.test.ts`

**Interfaces:**
- Consumes: `Clock`, `ServerRegion`, `SERVER_OFFSET`, `ASIA_OFFSET`, `TimelineEvent` from `src/types.ts`
- Produces:
  - `parseWallClock(s: string): number`
  - `toInstant(wall: string, clock: Clock, server: ServerRegion): number`
  - `startInstant(ev: TimelineEvent, server: ServerRegion): number`
  - `endInstant(ev: TimelineEvent, server: ServerRegion): number | null`
  - `statusAt(ev: TimelineEvent, now: number, server: ServerRegion): EventStatus`
  - `formatCountdown(ms: number): string`

- [ ] **Step 1: Write the failing tests**

`src/lib/time.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  parseWallClock, toInstant, startInstant, endInstant, statusAt, formatCountdown,
} from './time'
import type { TimelineEvent } from '../types'

const ev = (over: Partial<TimelineEvent>): TimelineEvent => ({
  id: 'x', name: 'x', lane: 'event',
  start: '2026-07-21 18:00:00', end: '2026-08-11 14:59:00',
  clock: 'server', color: '#fff', source: 'calendar',
  ...over,
})

describe('parseWallClock', () => {
  it('reads the string as UTC parts, not local time', () => {
    expect(parseWallClock('2026-07-21 18:00:00')).toBe(Date.UTC(2026, 6, 21, 18, 0, 0))
  })

  it('handles a midnight boundary', () => {
    expect(parseWallClock('2026-01-01 00:00:00')).toBe(Date.UTC(2026, 0, 1, 0, 0, 0))
  })

  it('throws on a malformed string rather than returning NaN', () => {
    expect(() => parseWallClock('2026-07-21T18:00:00Z')).toThrow(/wall clock/i)
    expect(() => parseWallClock('')).toThrow(/wall clock/i)
  })
})

describe('toInstant', () => {
  it('resolves an absolute clock to the same instant on every server', () => {
    const asia = toInstant('2026-07-21 18:00:00', 'absolute', 'asia')
    const eu = toInstant('2026-07-21 18:00:00', 'absolute', 'europe')
    const us = toInstant('2026-07-21 18:00:00', 'absolute', 'america')
    expect(eu).toBe(asia)
    expect(us).toBe(asia)
  })

  it('stores an absolute clock as Asia +8', () => {
    expect(toInstant('2026-07-21 18:00:00', 'absolute', 'europe'))
      .toBe(Date.UTC(2026, 6, 21, 10, 0, 0))
  })

  it('staggers a server clock by the viewer server offset', () => {
    const asia = toInstant('2026-07-24 10:00:00', 'server', 'asia')
    const eu = toInstant('2026-07-24 10:00:00', 'server', 'europe')
    expect(eu - asia).toBe(7 * 3_600_000)
  })

  it('treats cht as +8, same as asia', () => {
    expect(toInstant('2026-07-24 10:00:00', 'server', 'cht'))
      .toBe(toInstant('2026-07-24 10:00:00', 'server', 'asia'))
  })

  it('shifts an america server clock 13 hours later than asia', () => {
    const asia = toInstant('2026-07-24 10:00:00', 'server', 'asia')
    const us = toInstant('2026-07-24 10:00:00', 'server', 'america')
    expect(us - asia).toBe(13 * 3_600_000)
  })
})

describe('endInstant', () => {
  it('returns null for an open-ended event', () => {
    expect(endInstant(ev({ end: null }), 'asia')).toBeNull()
  })
})

describe('statusAt', () => {
  const now = Date.UTC(2026, 6, 24, 0, 0, 0)

  it('reports upcoming before the start', () => {
    const e = ev({ start: '2026-08-01 10:00:00', end: '2026-08-10 10:00:00' })
    expect(statusAt(e, now, 'asia')).toBe('upcoming')
  })

  it('reports live inside the window', () => {
    const e = ev({ start: '2026-07-01 10:00:00', end: '2026-08-10 10:00:00' })
    expect(statusAt(e, now, 'asia')).toBe('live')
  })

  it('reports ended after the end', () => {
    const e = ev({ start: '2026-06-01 10:00:00', end: '2026-06-10 10:00:00' })
    expect(statusAt(e, now, 'asia')).toBe('ended')
  })

  it('reports an open-ended started event as live, never ended', () => {
    const e = ev({ start: '2026-06-01 10:00:00', end: null })
    expect(statusAt(e, now, 'asia')).toBe('live')
  })
})

describe('formatCountdown', () => {
  it('shows days and hours past a day', () => {
    expect(formatCountdown(2 * 86_400_000 + 14 * 3_600_000)).toBe('2d 14h')
  })

  it('shows hours and minutes under a day', () => {
    expect(formatCountdown(14 * 3_600_000 + 3 * 60_000)).toBe('14h 3m')
  })

  it('shows minutes only under an hour', () => {
    expect(formatCountdown(3 * 60_000)).toBe('3m')
  })

  it('rounds down rather than up', () => {
    expect(formatCountdown(2 * 86_400_000 + 14 * 3_600_000 + 59 * 60_000)).toBe('2d 14h')
  })

  it('clamps negatives to zero', () => {
    expect(formatCountdown(-5000)).toBe('0m')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test`
Expected: FAIL — `Failed to resolve import "./time"`.

- [ ] **Step 3: Write the implementation**

`src/lib/time.ts`:

```ts
import { ASIA_OFFSET, SERVER_OFFSET } from '../types'
import type { Clock, ServerRegion, TimelineEvent } from '../types'

export type EventStatus = 'upcoming' | 'live' | 'ended'

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/
const HOUR = 3_600_000

export function parseWallClock(s: string): number {
  const m = WALL_CLOCK.exec(s)
  if (!m) throw new Error(`not a wall clock string: ${JSON.stringify(s)}`)
  return Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!)
}

export function toInstant(wall: string, clock: Clock, server: ServerRegion): number {
  const offset = clock === 'absolute' ? ASIA_OFFSET : SERVER_OFFSET[server]
  return parseWallClock(wall) - offset * HOUR
}

export function startInstant(ev: TimelineEvent, server: ServerRegion): number {
  return toInstant(ev.start, ev.clock, server)
}

export function endInstant(ev: TimelineEvent, server: ServerRegion): number | null {
  return ev.end === null ? null : toInstant(ev.end, ev.clock, server)
}

export function statusAt(ev: TimelineEvent, now: number, server: ServerRegion): EventStatus {
  if (now < startInstant(ev, server)) return 'upcoming'
  const end = endInstant(ev, server)
  if (end !== null && now >= end) return 'ended'
  return 'live'
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, ms)
  const days = Math.floor(total / 86_400_000)
  const hours = Math.floor((total % 86_400_000) / HOUR)
  const minutes = Math.floor((total % HOUR) / 60_000)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test`
Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/time.ts src/lib/time.test.ts
git commit -m "feat: add time module resolving server and absolute clock semantics"
```

---

### Task 4: Timeline module — windowing, packing, positioning

**Files:**
- Create: `src/lib/timeline.ts`
- Test: `src/lib/timeline.test.ts`

**Interfaces:**
- Consumes: `startInstant`, `endInstant` from `src/lib/time.ts`; `TimelineEvent`, `ServerRegion`, `LaneId` from `src/types.ts`
- Produces:
  - `type Window = { from: number; to: number }`
  - `type PositionedEvent = { event: TimelineEvent; leftPct: number; widthPct: number }`
  - `inWindow(ev, win, server): boolean`
  - `packRows(events, server): TimelineEvent[][]`
  - `position(ev, win, server): PositionedEvent`
  - `laneRows(events, lane, win, server): PositionedEvent[][]`

- [ ] **Step 1: Write the failing tests**

`src/lib/timeline.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { inWindow, packRows, position, laneRows } from './timeline'
import type { TimelineEvent } from '../types'
import { parseWallClock } from './time'

const ev = (start: string, end: string | null, over: Partial<TimelineEvent> = {}): TimelineEvent => ({
  id: `${start}`, name: start, lane: 'event',
  start, end, clock: 'absolute', color: '#fff', source: 'calendar',
  ...over,
})

const win = {
  from: parseWallClock('2026-07-01 00:00:00') - 8 * 3_600_000,
  to: parseWallClock('2026-07-31 00:00:00') - 8 * 3_600_000,
}

describe('inWindow', () => {
  it('includes an event fully inside', () => {
    expect(inWindow(ev('2026-07-10 00:00:00', '2026-07-12 00:00:00'), win, 'asia')).toBe(true)
  })

  it('includes an event straddling the start edge', () => {
    expect(inWindow(ev('2026-06-20 00:00:00', '2026-07-05 00:00:00'), win, 'asia')).toBe(true)
  })

  it('includes an event straddling the end edge', () => {
    expect(inWindow(ev('2026-07-28 00:00:00', '2026-08-15 00:00:00'), win, 'asia')).toBe(true)
  })

  it('excludes an event entirely before', () => {
    expect(inWindow(ev('2026-05-01 00:00:00', '2026-05-10 00:00:00'), win, 'asia')).toBe(false)
  })

  it('excludes an event entirely after', () => {
    expect(inWindow(ev('2026-09-01 00:00:00', '2026-09-10 00:00:00'), win, 'asia')).toBe(false)
  })

  it('includes an open-ended event that has started', () => {
    expect(inWindow(ev('2026-07-05 00:00:00', null), win, 'asia')).toBe(true)
  })
})

describe('packRows', () => {
  it('keeps non-overlapping events on one row', () => {
    const rows = packRows([
      ev('2026-07-01 00:00:00', '2026-07-05 00:00:00'),
      ev('2026-07-06 00:00:00', '2026-07-10 00:00:00'),
    ], 'asia')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveLength(2)
  })

  it('splits overlapping events onto separate rows', () => {
    const rows = packRows([
      ev('2026-07-01 00:00:00', '2026-07-10 00:00:00'),
      ev('2026-07-05 00:00:00', '2026-07-15 00:00:00'),
    ], 'asia')
    expect(rows).toHaveLength(2)
  })

  it('reuses the first free row for a third event', () => {
    const rows = packRows([
      ev('2026-07-01 00:00:00', '2026-07-10 00:00:00'),
      ev('2026-07-05 00:00:00', '2026-07-15 00:00:00'),
      ev('2026-07-11 00:00:00', '2026-07-14 00:00:00'),
    ], 'asia')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveLength(2)
  })

  it('treats an open-ended event as occupying its row indefinitely', () => {
    const rows = packRows([
      ev('2026-07-01 00:00:00', null),
      ev('2026-07-05 00:00:00', '2026-07-10 00:00:00'),
    ], 'asia')
    expect(rows).toHaveLength(2)
  })

  it('returns an empty array for no events', () => {
    expect(packRows([], 'asia')).toEqual([])
  })
})

describe('position', () => {
  it('places a mid-window event proportionally', () => {
    const p = position(ev('2026-07-16 00:00:00', '2026-07-31 00:00:00'), win, 'asia')
    expect(p.leftPct).toBeCloseTo(50, 1)
    expect(p.widthPct).toBeCloseTo(50, 1)
  })

  it('clamps an event that starts before the window', () => {
    const p = position(ev('2026-06-01 00:00:00', '2026-07-16 00:00:00'), win, 'asia')
    expect(p.leftPct).toBe(0)
    expect(p.widthPct).toBeCloseTo(50, 1)
  })

  it('clamps an open-ended event to the window end', () => {
    const p = position(ev('2026-07-16 00:00:00', null), win, 'asia')
    expect(p.leftPct + p.widthPct).toBeCloseTo(100, 1)
  })
})

describe('laneRows', () => {
  it('selects only the requested lane and positions it', () => {
    const rows = laneRows([
      ev('2026-07-02 00:00:00', '2026-07-08 00:00:00', { lane: 'event' }),
      ev('2026-07-02 00:00:00', '2026-07-08 00:00:00', { lane: 'abyss' }),
    ], 'event', win, 'asia')
    expect(rows).toHaveLength(1)
    expect(rows[0]![0]!.event.lane).toBe('event')
    expect(rows[0]![0]!.leftPct).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test`
Expected: FAIL — `Failed to resolve import "./timeline"`.

- [ ] **Step 3: Write the implementation**

`src/lib/timeline.ts`:

```ts
import { endInstant, startInstant } from './time'
import type { LaneId, ServerRegion, TimelineEvent } from '../types'

export type Window = { from: number; to: number }

export type PositionedEvent = {
  event: TimelineEvent
  leftPct: number
  widthPct: number
}

export function inWindow(ev: TimelineEvent, win: Window, server: ServerRegion): boolean {
  const start = startInstant(ev, server)
  const end = endInstant(ev, server) ?? Number.POSITIVE_INFINITY
  return start < win.to && end > win.from
}

export function packRows(events: TimelineEvent[], server: ServerRegion): TimelineEvent[][] {
  const sorted = [...events].sort((a, b) => startInstant(a, server) - startInstant(b, server))
  const rows: TimelineEvent[][] = []
  const rowEnds: number[] = []

  for (const ev of sorted) {
    const start = startInstant(ev, server)
    const end = endInstant(ev, server) ?? Number.POSITIVE_INFINITY
    const idx = rowEnds.findIndex((rowEnd) => rowEnd <= start)
    if (idx === -1) {
      rows.push([ev])
      rowEnds.push(end)
    } else {
      rows[idx]!.push(ev)
      rowEnds[idx] = end
    }
  }
  return rows
}

export function position(ev: TimelineEvent, win: Window, server: ServerRegion): PositionedEvent {
  const span = win.to - win.from
  const start = startInstant(ev, server)
  const end = endInstant(ev, server) ?? win.to
  const left = ((Math.max(start, win.from) - win.from) / span) * 100
  const right = ((Math.min(end, win.to) - win.from) / span) * 100
  return {
    event: ev,
    leftPct: Math.max(0, Math.min(100, left)),
    widthPct: Math.max(0, Math.min(100, right - left)),
  }
}

export function laneRows(
  events: TimelineEvent[],
  lane: LaneId,
  win: Window,
  server: ServerRegion,
): PositionedEvent[][] {
  const selected = events.filter((ev) => ev.lane === lane && inWindow(ev, win, server))
  return packRows(selected, server).map((row) => row.map((ev) => position(ev, win, server)))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test`
Expected: PASS, 33 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline.ts src/lib/timeline.test.ts
git commit -m "feat: add timeline windowing, lane packing and positioning"
```

---

### Task 5: Announcement parsing — the double-encoded time tags

FINDINGS §3A documents the one bug that already bit during research: the announcement HTML is entity-encoded **one extra level**, and you must decode exactly once before matching. Decoding twice corrupts content; decoding zero times yields no matches.

**Files:**
- Create: `scripts/ingest/announcements.ts`
- Test: `scripts/ingest/announcements.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type DateRange = { start: string; end: string }` — named to stay distinct from `Window` in `src/lib/timeline.ts`, which is a viewport range, not a date pair
  - `unescapeOnce(s: string): string`
  - `stripTags(s: string): string`
  - `normalizeAnnDate(raw: string, endOfMinute: boolean): string`
  - `extractWindow(contentHtml: string): DateRange | null`

- [ ] **Step 1: Write the failing tests**

`scripts/ingest/announcements.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { unescapeOnce, extractWindow, normalizeAnnDate } from './announcements'

describe('unescapeOnce', () => {
  it('decodes one level of entity encoding', () => {
    expect(unescapeOnce('&lt;t class="t_lc"&gt;2026/07/24 10:00&lt;/t&gt;'))
      .toBe('<t class="t_lc">2026/07/24 10:00</t>')
  })

  it('decodes ampersand last so double-encoded input drops exactly one level', () => {
    expect(unescapeOnce('&amp;lt;b&amp;gt;')).toBe('&lt;b&gt;')
  })

  it('leaves already-decoded markup untouched', () => {
    expect(unescapeOnce('<p>plain</p>')).toBe('<p>plain</p>')
  })

  it('decodes quotes and apostrophes', () => {
    expect(unescapeOnce('&quot;a&#39;b&quot;')).toBe('"a\'b"')
  })
})

describe('normalizeAnnDate', () => {
  it('converts slash format to wall clock seconds', () => {
    expect(normalizeAnnDate('2026/07/24 10:00', false)).toBe('2026-07-24 10:00:00')
  })

  it('fills seconds to 59 for an end bound', () => {
    expect(normalizeAnnDate('2026/08/03 03:59', true)).toBe('2026-08-03 03:59:59')
  })

  it('keeps seconds when the announcement states them', () => {
    expect(normalizeAnnDate('2026/08/03 03:59:30', true)).toBe('2026-08-03 03:59:30')
  })

  it('accepts a dash separator', () => {
    expect(normalizeAnnDate('2026-07-24 10:00', false)).toBe('2026-07-24 10:00:00')
  })

  it('strips markup around the date before parsing', () => {
    expect(normalizeAnnDate('<span>2026/07/24 10:00</span>', false)).toBe('2026-07-24 10:00:00')
  })

  it('throws on an unrecognized format', () => {
    expect(() => normalizeAnnDate('24 July 2026', false)).toThrow(/announcement date/i)
  })
})

describe('extractWindow', () => {
  const wrap = (inner: string) => inner.replace(/</g, '&lt;').replace(/>/g, '&gt;')

  it('extracts the pair following an Event Duration heading', () => {
    const html = wrap(
      '<p>〓Event Duration〓</p>' +
      '<p><t class="t_lc" contenteditable="false">2026/07/24 10:00</t>' +
      ' – <t class="t_lc" contenteditable="false">2026/08/03 03:59</t></p>',
    )
    expect(extractWindow(html)).toEqual({
      start: '2026-07-24 10:00:00',
      end: '2026-08-03 03:59:59',
    })
  })

  it('accepts the Event Wish Duration heading', () => {
    const html = wrap(
      '<p>〓Event Wish Duration〓</p>' +
      '<p><t class="t_gl">2026/07/01 04:00</t> – <t class="t_gl">2026/08/01 03:59</t></p>',
    )
    expect(extractWindow(html)?.start).toBe('2026-07-01 04:00:00')
  })

  it('accepts a bare Duration heading with no decoration', () => {
    const html = wrap(
      '<p>Duration</p>' +
      '<p><t class="t_gl">2026/07/01 04:00</t> – <t class="t_gl">2026/08/01 03:59</t></p>',
    )
    expect(extractWindow(html)?.end).toBe('2026-08-01 03:59:59')
  })

  it('ignores time tags that appear before the duration heading', () => {
    const html = wrap(
      '<p><t class="t_lc">2020/01/01 00:00</t> – <t class="t_lc">2020/01/02 00:00</t></p>' +
      '<p>〓Event Duration〓</p>' +
      '<p><t class="t_lc">2026/07/24 10:00</t> – <t class="t_lc">2026/08/03 03:59</t></p>',
    )
    expect(extractWindow(html)?.start).toBe('2026-07-24 10:00:00')
  })

  it('falls back to the first valid pair when no heading matches', () => {
    const html = wrap(
      '<p>Something else entirely</p>' +
      '<p><t class="t_lc">2026/07/24 10:00</t> – <t class="t_lc">2026/08/03 03:59</t></p>',
    )
    expect(extractWindow(html)?.start).toBe('2026-07-24 10:00:00')
  })

  it('rejects a pair whose end precedes its start', () => {
    const html = wrap(
      '<p>〓Event Duration〓</p>' +
      '<p><t class="t_lc">2026/08/03 03:59</t> – <t class="t_lc">2026/07/24 10:00</t></p>',
    )
    expect(extractWindow(html)).toBeNull()
  })

  it('returns null when no dates are present at all', () => {
    expect(extractWindow(wrap('<p>no dates here</p>'))).toBeNull()
  })

  it('returns null when only one time tag exists', () => {
    const html = wrap('<p>〓Event Duration〓</p><p><t class="t_lc">2026/07/24 10:00</t></p>')
    expect(extractWindow(html)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test`
Expected: FAIL — `Failed to resolve import "./announcements"`.

- [ ] **Step 3: Write the implementation**

`scripts/ingest/announcements.ts`:

```ts
const ANN_DATE = /(\d{4})[/-](\d{2})[/-](\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/

const T_TAG = '<t[^>]*class="t_(?:lc|gl)"[^>]*>([\\s\\S]*?)<\\/t>'
const PAIR = new RegExp(`${T_TAG}(?:(?!<t[^>]*class="t_)[\\s\\S]){0,80}?${T_TAG}`, 'g')

const HEADINGS = [
  'Event Duration',
  'Event Wish Duration',
  'Duration',
  'Event Period',
  'Time Limit',
]

export type DateRange = { start: string; end: string }

export function unescapeOnce(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

export function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').trim()
}

export function normalizeAnnDate(raw: string, endOfMinute: boolean): string {
  const m = ANN_DATE.exec(stripTags(raw))
  if (!m) throw new Error(`unrecognized announcement date: ${JSON.stringify(raw)}`)
  const seconds = m[6] ?? (endOfMinute ? '59' : '00')
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${seconds}`
}

function durationPairs(text: string): DateRange[] {
  const out: DateRange[] = []
  for (const m of text.matchAll(PAIR)) {
    try {
      const start = normalizeAnnDate(m[1]!, false)
      const end = normalizeAnnDate(m[2]!, true)
      if (end > start) out.push({ start, end })
    } catch {
      // a tag that is not a date — skip it
    }
  }
  return out
}

export function extractWindow(contentHtml: string): DateRange | null {
  const decoded = unescapeOnce(contentHtml)

  for (const heading of HEADINGS) {
    const i = decoded.indexOf(heading)
    if (i === -1) continue
    const pairs = durationPairs(decoded.slice(i))
    if (pairs.length > 0) return pairs[0]!
  }

  return durationPairs(decoded)[0] ?? null
}
```

Three details are load-bearing and each has a test above:

- `&amp;` is replaced **last**. Replacing it first would turn `&amp;lt;` into `&lt;` and then into `<` — two levels of decoding in one pass, corrupting any literal ampersand in event copy. FINDINGS §3A: decode exactly once.
- The heading list and its order come from the reference implementation at `research/fetch_timeline.py:75`. `'Duration'` must stay after the two longer headings, since it is a substring of both.
- A pair is only accepted when `end > start`, which is what rejects two unrelated adjacent `<t>` tags that happen to sit within 80 characters of each other.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test`
Expected: PASS, 51 tests total.

- [ ] **Step 5: Verify against the real API**

```bash
curl -s "https://sg-hk4e-api.hoyoverse.com/common/hk4e_global/announcement/api/getAnnList?game=hk4e&game_biz=hk4e_global&lang=en&bundle_id=hk4e_global&platform=pc&region=os_asia&level=60&uid=100000000" | head -c 300
```
Expected: JSON starting with `{"retcode":0`. This confirms the endpoint shape hasn't drifted since the research date.

- [ ] **Step 6: Commit**

```bash
git add scripts/ingest/announcements.ts scripts/ingest/announcements.test.ts
git commit -m "feat: parse event windows from double-encoded announcement html"
```

---

### Task 6: Source adapters and fetch cache

**Files:**
- Create: `scripts/ingest/sources.ts`
- Test: `scripts/ingest/sources.test.ts`
- Create: `data/overrides.json`

**Interfaces:**
- Consumes: `TimelineEvent`, `LaneId`, `Clock`, `Element` from `src/types.ts`; `extractWindow` from `./announcements`
- Produces:
  - `type AmberEvent = { name: Record<string, string>; banner?: Record<string, string> }`
  - `type RawSources = { calendar: CalendarPayload; announcements: AnnItem[]; amber: AmberPayload }`
  - `fetchAll(offline: boolean, dir?: string): Promise<RawSources>` — `dir` defaults to `.cache`; the parity test in Task 8 points it at committed fixtures
  - `laneFor(kind: 'event' | 'banner' | 'challenge', name: string, hasCharacters: boolean): LaneId`
  - `clockFor(lane: LaneId): Clock`
  - `fromCalendar(payload: CalendarPayload): TimelineEvent[]`
  - `slugId(name: string, start: string): string`
  - `normKey(s: string): string`
  - `amberIndex(payload: AmberPayload): Map<string, AmberEvent>`

- [ ] **Step 1: Write the failing tests**

`scripts/ingest/sources.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test`
Expected: FAIL — `Failed to resolve import "./sources"`.

- [ ] **Step 3: Write the implementation**

`scripts/ingest/sources.ts`:

```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Clock, Element, LaneId, TimelineEvent } from '../../src/types'

const CACHE_DIR = '.cache'
const ASIA_OFFSET_MS = 8 * 3_600_000

const CALENDAR_URL = 'https://api.ennead.cc/mihoyo/genshin/calendar'
const AMBER_URL = 'https://gi.yatta.moe/assets/data/event.json'
const ANN_BASE = 'https://sg-hk4e-api.hoyoverse.com/common/hk4e_global/announcement/api'
const ANN_QUERY =
  '?game=hk4e&game_biz=hk4e_global&lang=en&bundle_id=hk4e_global' +
  '&platform=pc&region=os_asia&level=60&uid=100000000'

export type CalendarCharacter = { name: string; rarity: string; element: string; icon: string }
export type CalendarEvent = {
  id: number; name: string; description: string; image_url: string
  start_time: string; end_time: string
}
export type CalendarBanner = {
  name: string; version: string; start_time: string; end_time: string
  characters: CalendarCharacter[]; weapons: CalendarCharacter[]
}
export type CalendarPayload = {
  events: CalendarEvent[]
  banners: CalendarBanner[]
  challenges: CalendarEvent[]
}
export type AnnItem = { ann_id: number; title: string; banner: string; content?: string }
export type AmberEvent = { name: Record<string, string>; banner?: Record<string, string> }
export type AmberPayload = Record<string, AmberEvent>
export type RawSources = {
  calendar: CalendarPayload
  announcements: AnnItem[]
  amber: AmberPayload
}

const DEFAULT_COLOR: Record<LaneId, string> = {
  'character-wish': '#b38df0',
  'weapon-wish': '#d3bc8e',
  chronicled: '#8fdfea',
  event: '#4cc2f1',
  stygian: '#ff6640',
  leyline: '#a5c83b',
  abyss: '#2a2f47',
  theater: '#f0b73a',
  battlepass: '#5fd7a6',
}

export function slugId(name: string, start: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug}@${start.replace(' ', 'T')}`
}

/**
 * Join key for matching a name across sources. Removes every non-alphanumeric
 * character rather than collapsing it to a separator — this must stay identical
 * to `norm_name` in research/fetch_timeline.py:108 or the parity test drifts.
 */
export function normKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function amberIndex(payload: AmberPayload): Map<string, AmberEvent> {
  const map = new Map<string, AmberEvent>()
  for (const entry of Object.values(payload)) {
    const en = entry.name?.EN
    if (en) map.set(normKey(en), entry)
  }
  return map
}

export function laneFor(
  kind: 'event' | 'banner' | 'challenge',
  name: string,
  hasCharacters: boolean,
): LaneId {
  const n = name.toLowerCase()
  if (n.includes('chronicled')) return 'chronicled'
  if (kind === 'banner') return hasCharacters ? 'character-wish' : 'weapon-wish'
  if (n.includes('abyss')) return 'abyss'
  if (n.includes('imaginarium theater')) return 'theater'
  if (n.includes('stygian')) return 'stygian'
  if (n.includes('ley line overflow')) return 'leyline'
  if (n.includes('battle pass')) return 'battlepass'
  return 'event'
}

export function clockFor(lane: LaneId): Clock {
  return lane === 'character-wish' || lane === 'weapon-wish' ||
    lane === 'chronicled' || lane === 'battlepass'
    ? 'absolute'
    : 'server'
}

function toAsiaWallClock(unixSeconds: string): string {
  const n = Number(unixSeconds)
  if (!Number.isFinite(n) || n <= 0) return ''
  return new Date(n * 1000 + ASIA_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ')
}

function toElement(raw: string): Element | undefined {
  const e = raw.toLowerCase()
  const known: Element[] = ['pyro', 'hydro', 'anemo', 'electro', 'dendro', 'cryo', 'geo']
  return known.find((k) => k === e)
}

function roster(chars: CalendarCharacter[]): TimelineEvent['featured'] {
  return chars.map((c) => {
    const element = toElement(c.element)
    return {
      name: c.name,
      rarity: c.rarity === '5' ? (5 as const) : (4 as const),
      ...(element ? { element } : {}),
    }
  })
}

export function fromCalendar(payload: CalendarPayload): TimelineEvent[] {
  const rows: TimelineEvent[] = []

  const plain = (items: CalendarEvent[], kind: 'event' | 'challenge') => {
    for (const it of items) {
      const lane = laneFor(kind, it.name, false)
      const start = toAsiaWallClock(it.start_time)
      const end = toAsiaWallClock(it.end_time)
      rows.push({
        id: slugId(it.name, start || String(it.id)),
        name: it.name,
        lane,
        start,
        end: end || null,
        clock: clockFor(lane),
        color: DEFAULT_COLOR[lane],
        ...(it.image_url ? { image: it.image_url } : {}),
        ...(it.description ? { description: it.description } : {}),
        source: 'calendar',
      })
    }
  }

  plain(payload.events, 'event')
  plain(payload.challenges, 'challenge')

  for (const b of payload.banners) {
    const lane = laneFor('banner', b.name, b.characters.length > 0)
    const start = toAsiaWallClock(b.start_time)
    const end = toAsiaWallClock(b.end_time)
    rows.push({
      id: slugId(b.name, start || b.name),
      name: b.name,
      lane,
      start,
      end: end || null,
      clock: clockFor(lane),
      color: DEFAULT_COLOR[lane],
      featured: roster([...b.characters, ...b.weapons]),
      ...(b.version ? { version: b.version } : {}),
      source: 'calendar',
    })
  }

  return rows
}

async function cached(key: string, url: string, offline: boolean, dir: string): Promise<string> {
  const path = join(dir, `${key}.json`)
  if (offline) return readFile(path, 'utf8')

  const res = await fetch(url)
  if (!res.ok) throw new Error(`${key}: HTTP ${res.status} from ${url}`)
  const body = await res.text()
  await mkdir(dir, { recursive: true })
  await writeFile(path, body, 'utf8')
  return body
}

export async function fetchAll(offline: boolean, dir: string = CACHE_DIR): Promise<RawSources> {
  const [calendarRaw, amberRaw, annListRaw] = await Promise.all([
    cached('calendar', CALENDAR_URL, offline, dir),
    cached('amber', AMBER_URL, offline, dir),
    cached('ann-list', `${ANN_BASE}/getAnnList${ANN_QUERY}`, offline, dir),
  ])

  const annContentRaw = await cached('ann-content', `${ANN_BASE}/getAnnContent${ANN_QUERY}`, offline, dir)
  const contentList = JSON.parse(annContentRaw).data?.list ?? []

  const listData = JSON.parse(annListRaw).data?.list ?? []
  const listItems: AnnItem[] = listData.flatMap((group: { list?: AnnItem[] }) => group.list ?? [])
  const contentById = new Map<number, string>(
    contentList.map((c: { ann_id: number; content: string }) => [c.ann_id, c.content]),
  )

  return {
    calendar: JSON.parse(calendarRaw) as CalendarPayload,
    amber: JSON.parse(amberRaw) as AmberPayload,
    announcements: listItems.map((it) => ({ ...it, content: contentById.get(it.ann_id) ?? '' })),
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test`
Expected: PASS, 71 tests total.

- [ ] **Step 5: Seed the override file**

`data/overrides.json` — FINDINGS §4 documents Ley Line Overflow as the one row no source dates. Seed it with the current window and a comment field explaining the file's purpose:

```json
{
  "_readme": "Hand-maintained rows layered on top of fetched sources. Only for events no source dates — see research/FINDINGS.md section 4. Ley Line Overflow has no standalone announcement while scheduled.",
  "rows": [
    {
      "name": "Ley Line Overflow",
      "lane": "leyline",
      "start": "2026-07-27 04:00:00",
      "end": "2026-08-03 03:59:59",
      "clock": "server",
      "color": "#a5c83b"
    }
  ]
}
```

- [ ] **Step 6: Commit**

```bash
git add scripts/ingest/sources.ts scripts/ingest/sources.test.ts data/overrides.json
git commit -m "feat: add source adapters, fetch cache and override seed"
```

---

### Task 7: Merge with backfill and precedence

**Files:**
- Create: `scripts/ingest/merge.ts`
- Test: `scripts/ingest/merge.test.ts`

**Interfaces:**
- Consumes: `fromCalendar`, `slugId`, `normKey`, `amberIndex`, `clockFor` and types from `./sources`; `extractWindow`, `stripTags` from `./announcements`; `TimelineEvent`, `LaneId` from `src/types.ts`
- Produces: `merge(raw: RawSources, overrides: OverrideFile): { events: TimelineEvent[]; warnings: string[] }`

- [ ] **Step 1: Write the failing tests**

`scripts/ingest/merge.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test`
Expected: FAIL — `Failed to resolve import "./merge"`.

- [ ] **Step 3: Write the implementation**

`scripts/ingest/merge.ts`:

```ts
import { extractWindow, stripTags } from './announcements'
import { amberIndex, clockFor, fromCalendar, normKey, slugId } from './sources'
import type { AnnItem, RawSources } from './sources'
import type { LaneId, TimelineEvent } from '../../src/types'

export type OverrideRow = {
  name: string
  lane: LaneId
  start: string
  end: string | null
  clock: 'server' | 'absolute'
  color: string
  image?: string
  url?: string
  description?: string
}

export type OverrideFile = { rows: OverrideRow[] }

export type MergeResult = { events: TimelineEvent[]; warnings: string[] }

const WISH_TITLE = /Event Wish\s*[“"]([^”"]+)[”"]/i
const WISH_LANES: LaneId[] = ['character-wish', 'weapon-wish', 'chronicled']

/**
 * One-directional, exactly as research/fetch_timeline.py:121 does it: the
 * calendar name must be a substring of the announcement title, never the
 * reverse. Matching both ways makes short titles swallow unrelated events.
 */
function matchAnnouncement(name: string, anns: AnnItem[]): AnnItem | undefined {
  const n = normKey(name)
  if (!n) return undefined
  return anns.find((a) => normKey(stripTags(a.title)).includes(n))
}

/**
 * The calendar names a banner after its featured character; the official
 * announcement carries the wish's actual name. Recover it by finding the wish
 * announcement that mentions one of this banner's 5-stars.
 */
function wishAnnouncement(featured: TimelineEvent['featured'], anns: AnnItem[]) {
  const fives = (featured ?? []).filter((f) => f.rarity === 5).map((f) => f.name)
  if (fives.length === 0) return undefined
  return anns.find((a) => {
    const title = stripTags(a.title)
    if (!/Event Wish|Epitome/i.test(title)) return false
    return fives.some((n) => title.includes(n))
  })
}

export function merge(raw: RawSources, overrides: OverrideFile): MergeResult {
  const warnings: string[] = []
  const rows = fromCalendar(raw.calendar)
  const amber = amberIndex(raw.amber)
  const resolved: TimelineEvent[] = []

  for (const row of rows) {
    const isWish = WISH_LANES.includes(row.lane)
    const ann = isWish
      ? wishAnnouncement(row.featured, raw.announcements) ??
        matchAnnouncement(row.name, raw.announcements)
      : matchAnnouncement(row.name, raw.announcements)

    let next = { ...row }

    if (isWish && ann) {
      const titled = WISH_TITLE.exec(stripTags(ann.title))
      if (titled) next = { ...next, name: titled[1]! }
    }

    if (!next.start && ann?.content) {
      const win = extractWindow(ann.content)
      if (win) next = { ...next, start: win.start, end: win.end, source: 'announcement' }
    }

    const amberBanner = amber.get(normKey(next.name))?.banner?.EN
    if (amberBanner) next = { ...next, image: amberBanner }
    if (!next.image && ann?.banner) next = { ...next, image: ann.banner }
    if (!next.url && ann) {
      next = { ...next, url: `https://www.hoyolab.com/article/${ann.ann_id}` }
    }

    if (!next.start) {
      warnings.push(`no date resolved for "${next.name}" — dropped`)
      continue
    }

    next.id = slugId(next.name, next.start)
    resolved.push(next)
  }

  for (const row of overrides.rows) {
    const lane = row.lane
    const id = slugId(row.name, row.start)
    const idx = resolved.findIndex(
      (e) => e.lane === lane && normKey(e.name) === normKey(row.name),
    )
    const built: TimelineEvent = {
      id,
      name: row.name,
      lane,
      start: row.start,
      end: row.end,
      clock: row.clock ?? clockFor(lane),
      color: row.color,
      ...(row.image ? { image: row.image } : {}),
      ...(row.url ? { url: row.url } : {}),
      ...(row.description ? { description: row.description } : {}),
      source: 'override',
    }
    if (idx === -1) resolved.push(built)
    else resolved[idx] = built
  }

  resolved.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
  return { events: resolved, warnings }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test`
Expected: PASS, 78 tests total.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/merge.ts scripts/ingest/merge.test.ts
git commit -m "feat: merge sources with announcement backfill and override precedence"
```

---

### Task 8: Ingest CLI

**Files:**
- Create: `scripts/ingest/main.ts`
- Create: `scripts/ingest/__fixtures__/` (four frozen upstream responses + the Python reference output)
- Test: `scripts/ingest/parity.test.ts`
- Modify: `.gitignore` (already contains `.cache/` from the initial commit — verify only)

**Interfaces:**
- Consumes: `fetchAll` from `./sources`, `merge` from `./merge`, `TimelinePayload` from `src/types.ts`
- Produces: the `bun run ingest` command and `public/data/current.json`

- [ ] **Step 1: Write the CLI**

`scripts/ingest/main.ts`:

```ts
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
```

Exiting non-zero on zero events is deliberate. The spec's staleness tripwire requires that the ingest never commits a silently-degraded dataset.

- [ ] **Step 2: Run it against the live sources**

Run: `bun run ingest --dry`
Expected: a printed table of roughly 12 rows resembling FINDINGS §4, ending with `would write: content changed`. Any `warn:` lines name events no source dated — those are candidates for `data/overrides.json`.

- [ ] **Step 3: Verify offline replay works**

The previous run populated `.cache/`. Now:

Run: `bun run ingest --offline --dry`
Expected: identical row output, no network access.

- [ ] **Step 4: Write the real file**

Run: `bun run ingest`
Expected: `wrote public/data/current.json — N events, M warnings`.

- [ ] **Step 5: Freeze the fixtures and the Python reference output**

The spec requires a parity test against `research/fetch_timeline.py`, which is what prevents the port silently re-introducing the double-unescape bug. Both sides must see the *same* upstream state, so capture them back to back — the Python fetches live every run.

`.cache/` is gitignored and cannot be a test input, so the fixtures get their own committed directory:

```bash
mkdir -p scripts/ingest/__fixtures__
cp .cache/calendar.json .cache/amber.json .cache/ann-list.json .cache/ann-content.json scripts/ingest/__fixtures__/
python research/fetch_timeline.py
mv timeline_live.json scripts/ingest/__fixtures__/python-reference.json
```

Expected: the Python prints its row table and `wrote timeline_live.json`. If Python 3 is unavailable, `research/data/timeline_live.json` is a committed earlier run — but it will not match freshly captured fixtures, so re-capture is required for the test to be meaningful. Say so rather than weakening the assertion.

- [ ] **Step 6: Write the parity test**

`scripts/ingest/parity.test.ts`:

```ts
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
```

- [ ] **Step 7: Run the parity test**

Run: `bun run test`
Expected: PASS, 80 tests total.

If `missing` is non-empty, the port has diverged from the reference. Read the failing keys before changing anything: a name mismatch points at `matchAnnouncement` or `WISH_TITLE` in `merge.ts`, a date mismatch points at `extractWindow` in `announcements.ts`, and a wholly absent row points at `laneFor`. Do not adjust the test to accommodate the port — the reference is the authority here.

- [ ] **Step 8: Verify .cache is not tracked**

Run: `git status --short`
Expected: `public/data/current.json`, `scripts/ingest/`, and `scripts/ingest/__fixtures__/` appear. `.cache/` does not.

- [ ] **Step 9: Commit**

```bash
git add scripts/ingest/main.ts scripts/ingest/parity.test.ts scripts/ingest/__fixtures__ public/data/current.json
git commit -m "feat: add ingest cli with dry-run, offline replay and python parity test"
```

---

### Task 9: Scheduled ingest workflow

**Files:**
- Create: `.github/workflows/ingest.yml`
- Create: `vercel.json`

**Interfaces:**
- Consumes: the `bun run ingest` command from Task 8
- Produces: a scheduled commit of `public/data/current.json`, and a GitHub issue on failure

- [ ] **Step 1: Write the workflow**

`.github/workflows/ingest.yml`:

```yaml
name: ingest

on:
  schedule:
    - cron: '0 */6 * * *'
  workflow_dispatch:

permissions:
  contents: write
  issues: write

jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - run: bun install --frozen-lockfile

      - run: bun run ingest

      - name: Commit if changed
        run: |
          git config user.name 'github-actions[bot]'
          git config user.email 'github-actions[bot]@users.noreply.github.com'
          if git diff --quiet public/data; then
            echo 'no change'
          else
            git add public/data
            git commit -m 'chore: refresh timeline data'
            git push
          fi

      - name: Open an issue on failure
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            const title = 'Ingest failed'
            const existing = await github.rest.issues.listForRepo({
              owner: context.repo.owner, repo: context.repo.repo,
              state: 'open', labels: 'ingest-failure',
            })
            if (existing.data.length === 0) {
              await github.rest.issues.create({
                owner: context.repo.owner, repo: context.repo.repo,
                title,
                labels: ['ingest-failure'],
                body: `The scheduled ingest failed. Run: ${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`,
              })
            }
```

The workflow contains no logic beyond checkout, install, one command, and commit. That is what makes `bun run ingest` locally identical to what CI runs.

- [ ] **Step 2: Write the Vercel config**

`vercel.json`:

```json
{
  "buildCommand": "bun run build",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/((?!data/).*)", "destination": "/index.html" }]
}
```

The rewrite excludes `/data/` so JSON requests resolve to the real files rather than `index.html`.

- [ ] **Step 3: Verify the workflow parses**

Run: `bun x js-yaml .github/workflows/ingest.yml > /dev/null && echo ok`
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ingest.yml vercel.json
git commit -m "ci: schedule ingest every 6h and open an issue on failure"
```

---

### Task 10: Data loading and server state

**Files:**
- Create: `src/state/store.ts`
- Create: `src/data/useTimeline.ts`
- Test: `src/state/store.test.ts`

**Interfaces:**
- Consumes: `ServerRegion`, `TimelinePayload` from `src/types.ts`
- Produces:
  - `detectServer(offsetMinutes: number): ServerRegion`
  - `loadServer(): ServerRegion` / `saveServer(s: ServerRegion): void`
  - `useServer(): [ServerRegion, (s: ServerRegion) => void]`
  - `useTimeline(): { status: 'loading' | 'ready' | 'error'; payload?: TimelinePayload; error?: string }`

- [ ] **Step 1: Write the failing test**

`src/state/store.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { detectServer } from './store'

describe('detectServer', () => {
  it('maps a UTC+8 browser to asia', () => {
    expect(detectServer(-480)).toBe('asia')
  })

  it('maps a UTC+1 browser to europe', () => {
    expect(detectServer(-60)).toBe('europe')
  })

  it('maps a UTC-5 browser to america', () => {
    expect(detectServer(300)).toBe('america')
  })

  it('maps UTC-8 to america as the nearest server', () => {
    expect(detectServer(480)).toBe('america')
  })

  it('maps UTC+10 to asia as the nearest server', () => {
    expect(detectServer(-600)).toBe('asia')
  })
})
```

`getTimezoneOffset()` returns minutes *behind* UTC, so UTC+8 is `-480`. That inversion is exactly the kind of thing that produces a plausible-looking off-by-hours bug, which is why it gets a test.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test`
Expected: FAIL — `Failed to resolve import "./store"`.

- [ ] **Step 3: Write the store**

`src/state/store.ts`:

```ts
import { useCallback, useState } from 'react'
import { SERVER_OFFSET } from '../types'
import type { ServerRegion } from '../types'

const KEY = 'gt.server'
const REGIONS: ServerRegion[] = ['asia', 'europe', 'america', 'cht']

export function detectServer(offsetMinutes: number): ServerRegion {
  const hours = -offsetMinutes / 60
  let best: ServerRegion = 'asia'
  let bestDelta = Infinity
  for (const region of REGIONS) {
    if (region === 'cht') continue
    const delta = Math.abs(SERVER_OFFSET[region] - hours)
    if (delta < bestDelta) {
      bestDelta = delta
      best = region
    }
  }
  return best
}

export function loadServer(): ServerRegion {
  const stored = localStorage.getItem(KEY)
  if (stored && (REGIONS as string[]).includes(stored)) return stored as ServerRegion
  return detectServer(new Date().getTimezoneOffset())
}

export function saveServer(s: ServerRegion): void {
  localStorage.setItem(KEY, s)
}

export function useServer(): [ServerRegion, (s: ServerRegion) => void] {
  const [server, setServer] = useState<ServerRegion>(loadServer)
  const update = useCallback((s: ServerRegion) => {
    saveServer(s)
    setServer(s)
  }, [])
  return [server, update]
}
```

- [ ] **Step 4: Write the data hook**

`src/data/useTimeline.ts`:

```ts
import { useEffect, useState } from 'react'
import type { TimelinePayload } from '../types'

export type TimelineState =
  | { status: 'loading' }
  | { status: 'ready'; payload: TimelinePayload }
  | { status: 'error'; error: string }

export function useTimeline(): TimelineState {
  const [state, setState] = useState<TimelineState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetch('/data/current.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<TimelinePayload>
      })
      .then((payload) => { if (!cancelled) setState({ status: 'ready', payload }) })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', error: err instanceof Error ? err.message : String(err) })
        }
      })
    return () => { cancelled = true }
  }, [])

  return state
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test`
Expected: PASS, 85 tests total.

- [ ] **Step 6: Commit**

```bash
git add src/state src/data
git commit -m "feat: add server detection, persistence and timeline data loading"
```

---

### Task 11: Command deck

**Files:**
- Create: `src/components/CommandDeck.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `statusAt`, `endInstant`, `startInstant`, `formatCountdown` from `src/lib/time.ts`; `useServer` from `src/state/store.ts`; `useTimeline` from `src/data/useTimeline.ts`
- Produces: `<CommandDeck events={TimelineEvent[]} server={ServerRegion} now={number} />`

- [ ] **Step 1: Write the component**

`src/components/CommandDeck.tsx`:

```tsx
import { endInstant, formatCountdown, startInstant, statusAt } from '../lib/time'
import type { ServerRegion, TimelineEvent } from '../types'

const URGENT_MS = 72 * 3_600_000

type Props = { events: TimelineEvent[]; server: ServerRegion; now: number }

function urgencyColor(msLeft: number): string {
  if (msLeft < 24 * 3_600_000) return 'text-urgent'
  if (msLeft < URGENT_MS) return 'text-geo'
  return 'text-dim'
}

export function CommandDeck({ events, server, now }: Props) {
  const live = events.filter((e) => statusAt(e, now, server) === 'live')

  const endingSoon = live
    .map((e) => ({ e, left: (endInstant(e, server) ?? Infinity) - now }))
    .filter((x) => x.left < URGENT_MS)
    .sort((a, b) => a.left - b.left)
    .slice(0, 3)

  const banners = live.filter((e) => e.lane === 'character-wish' || e.lane === 'weapon-wish')

  const next = events
    .filter((e) => statusAt(e, now, server) === 'upcoming')
    .map((e) => ({ e, until: startInstant(e, server) - now }))
    .sort((a, b) => a.until - b.until)[0]

  return (
    <section className="space-y-3">
      {endingSoon.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-3">
          {endingSoon.map(({ e, left }) => (
            <div key={e.id} className="bg-surface border-l-2 border-urgent p-3">
              <div className={`text-[11px] tracking-[0.08em] uppercase ${urgencyColor(left)}`}>
                Ends in {formatCountdown(left)}
              </div>
              <div className="mt-1 text-sm leading-snug">{e.name}</div>
            </div>
          ))}
        </div>
      )}

      {banners.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {banners.map((e) => (
            <div key={e.id} className="bg-surface flex items-center gap-3 rounded-xl p-3">
              <span
                className="size-9 shrink-0 rounded-full"
                style={{ background: e.color }}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="truncate text-sm">
                  {e.featured?.filter((f) => f.rarity === 5).map((f) => f.name).join(', ') || e.name}
                </div>
                <div className="text-dim truncate text-[11px]">
                  {e.name}
                  {e.end && ` · ${formatCountdown((endInstant(e, server) ?? now) - now)} left`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {next && (
        <div className="text-dim text-[11px]">
          Next up: <span className="text-text">{next.e.name}</span> in {formatCountdown(next.until)}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Wire it into the app**

`src/App.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { CommandDeck } from './components/CommandDeck'
import { useTimeline } from './data/useTimeline'
import { useServer } from './state/store'
import { SERVER_OFFSET } from './types'
import type { ServerRegion } from './types'

const SERVER_LABEL: Record<ServerRegion, string> = {
  asia: 'Asia',
  europe: 'Europe',
  america: 'America',
  cht: 'TW, HK, MO',
}

export function App() {
  const state = useTimeline()
  const [server, setServer] = useServer()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-gold text-sm tracking-[0.12em] uppercase">Genshin timeline</h1>
        <select
          value={server}
          onChange={(e) => setServer(e.target.value as ServerRegion)}
          className="bg-surface border-border text-dim rounded-md border px-2 py-1 text-xs"
          aria-label="Server region"
        >
          {(Object.keys(SERVER_OFFSET) as ServerRegion[]).map((r) => (
            <option key={r} value={r}>{SERVER_LABEL[r]}</option>
          ))}
        </select>
      </header>

      {state.status === 'loading' && <p className="text-dim text-sm">Loading…</p>}
      {state.status === 'error' && (
        <p className="text-urgent text-sm">Couldn't load timeline data. {state.error}</p>
      )}
      {state.status === 'ready' && (
        <CommandDeck events={state.payload.events} server={server} now={now} />
      )}
    </main>
  )
}
```

- [ ] **Step 3: Verify it renders against real data**

Run: `bun run dev`
Expected: ending-soon cards with live countdowns, current banner cards showing 5★ names, and a "Next up" line. Changing the server dropdown shifts the countdowns for non-banner rows and leaves banner rows unchanged — that is the two-clock model working.

- [ ] **Step 4: Verify the build passes**

Run: `bun run build`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/CommandDeck.tsx src/App.tsx
git commit -m "feat: add command deck with countdowns and server switching"
```

---

### Task 12: Desktop gantt renderer

**Files:**
- Create: `src/components/TimelineGantt.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `laneRows`, `Window` from `src/lib/timeline.ts`; `LANES` from `src/types.ts`
- Produces: `<TimelineGantt events={TimelineEvent[]} window={Window} server={ServerRegion} now={number} onSelect={(e: TimelineEvent) => void} />`

- [ ] **Step 1: Write the component**

`src/components/TimelineGantt.tsx`:

```tsx
import { laneRows } from '../lib/timeline'
import type { Window } from '../lib/timeline'
import { LANES } from '../types'
import type { ServerRegion, TimelineEvent } from '../types'

type Props = {
  events: TimelineEvent[]
  window: Window
  server: ServerRegion
  now: number
  onSelect: (e: TimelineEvent) => void
}

export function TimelineGantt({ events, window: win, server, now, onSelect }: Props) {
  const nowPct = ((now - win.from) / (win.to - win.from)) * 100
  const visible = LANES.map((lane) => ({
    lane,
    rows: laneRows(events, lane.id, win, server),
  })).filter((l) => l.rows.length > 0)

  return (
    <section className="relative">
      {nowPct >= 0 && nowPct <= 100 && (
        <div
          className="bg-urgent pointer-events-none absolute top-0 bottom-0 z-10 w-px"
          style={{ left: `calc(9rem + (100% - 9rem) * ${nowPct / 100})` }}
          aria-hidden="true"
        />
      )}

      {visible.map(({ lane, rows }) => (
        <div key={lane.id} className="border-border flex items-start border-t py-2">
          <div className="text-dim w-36 shrink-0 pt-1 pr-3 text-[11px]">{lane.label}</div>
          <div className="min-w-0 flex-1 space-y-1">
            {rows.map((row, i) => (
              <div key={i} className="relative h-6">
                {row.map(({ event, leftPct, widthPct }) => (
                  <button
                    key={event.id}
                    onClick={() => onSelect(event)}
                    className="absolute inset-y-0 flex items-center overflow-hidden rounded-md px-2 text-left text-[11px] text-black/80 hover:brightness-110"
                    style={{
                      left: `${leftPct}%`,
                      width: `${Math.max(widthPct, 1.5)}%`,
                      background: event.color,
                    }}
                    title={event.name}
                  >
                    <span className="truncate">{event.name}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
```

The now-rail `left` calculation offsets by the 9rem lane-label gutter so the line aligns with the bars rather than the container. `nowPct` is divided into a unitless multiplier because `calc()` cannot divide a percentage by a length.

- [ ] **Step 2: Wire it in**

In `src/App.tsx`, add these imports:

```tsx
import { useMemo } from 'react'
import { TimelineGantt } from './components/TimelineGantt'
```

Add this inside `App`, after the `now` state. Name it `viewWindow`, not `window` — a local called `window` shadows the global that `matchMedia` is reached through in Task 13:

```tsx
const viewWindow = useMemo(
  () => ({ from: now - 7 * 86_400_000, to: now + 45 * 86_400_000 }),
  [now],
)
```

Replace the `state.status === 'ready'` block with:

```tsx
{state.status === 'ready' && (
  <>
    <CommandDeck events={state.payload.events} server={server} now={now} />
    <TimelineGantt
      events={state.payload.events}
      window={viewWindow}
      server={server}
      now={now}
      onSelect={() => {}}
    />
  </>
)}
```

- [ ] **Step 3: Verify it renders**

Run: `bun run dev`
Expected: labelled lanes with colored bars, a red vertical now-line crossing them, and overlapping events stacked on separate rows within a lane rather than drawn on top of each other.

- [ ] **Step 4: Verify the build passes**

Run: `bun run build`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/TimelineGantt.tsx src/App.tsx
git commit -m "feat: add desktop gantt renderer with lane packing and now rail"
```

---

### Task 13: Mobile river renderer and responsive swap

**Files:**
- Create: `src/components/TimelineRiver.tsx`
- Create: `src/state/useIsDesktop.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `inWindow`, `Window` from `src/lib/timeline.ts`; `startInstant`, `endInstant`, `statusAt`, `formatCountdown` from `src/lib/time.ts`
- Produces:
  - `useIsDesktop(): boolean` — true at ≥768px
  - `<TimelineRiver events={} window={} server={} now={} onSelect={} />`

- [ ] **Step 1: Write the breakpoint hook**

`src/state/useIsDesktop.ts`:

```ts
import { useEffect, useState } from 'react'

const QUERY = '(min-width: 768px)'

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(QUERY).matches)

  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return isDesktop
}
```

- [ ] **Step 2: Write the river renderer**

`src/components/TimelineRiver.tsx`:

```tsx
import { endInstant, formatCountdown, startInstant, statusAt } from '../lib/time'
import { inWindow } from '../lib/timeline'
import type { Window } from '../lib/timeline'
import type { ServerRegion, TimelineEvent } from '../types'

type Props = {
  events: TimelineEvent[]
  window: Window
  server: ServerRegion
  now: number
  onSelect: (e: TimelineEvent) => void
}

function dayKey(instant: number): string {
  return new Date(instant).toISOString().slice(0, 10)
}

function dayLabel(key: string, todayKey: string): string {
  if (key === todayKey) return 'Today'
  const d = new Date(`${key}T00:00:00Z`)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function TimelineRiver({ events, window: win, server, now, onSelect }: Props) {
  const todayKey = dayKey(now)
  const visible = events.filter((e) => inWindow(e, win, server))

  const groups = new Map<string, TimelineEvent[]>()
  for (const e of visible) {
    const anchor = statusAt(e, now, server) === 'live' ? now : startInstant(e, server)
    const key = dayKey(anchor)
    const bucket = groups.get(key)
    if (bucket) bucket.push(e)
    else groups.set(key, [e])
  }

  const days = [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1))

  return (
    <section className="space-y-4">
      {days.map(([key, dayEvents]) => (
        <div key={key} className="flex gap-3">
          <div className="w-14 shrink-0 pt-1 text-right">
            <div className={key === todayKey ? 'text-urgent text-[11px]' : 'text-dim text-[11px]'}>
              {key === todayKey ? 'today' : ''}
            </div>
            <div className="text-sm">{dayLabel(key, todayKey)}</div>
          </div>
          <div className="border-border min-w-0 flex-1 space-y-1.5 border-l pl-3">
            {dayEvents.map((e) => {
              const end = endInstant(e, server)
              const live = statusAt(e, now, server) === 'live'
              return (
                <button
                  key={e.id}
                  onClick={() => onSelect(e)}
                  className="bg-surface flex w-full items-center justify-between gap-2 rounded-lg p-2.5 text-left"
                  style={{ borderLeft: `2px solid ${e.color}` }}
                >
                  <span className="min-w-0 truncate text-xs">{e.name}</span>
                  <span className="text-dim shrink-0 text-[11px]">
                    {live && end !== null
                      ? `${formatCountdown(end - now)} left`
                      : live
                        ? 'live'
                        : 'starts'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}
```

- [ ] **Step 3: Swap on the breakpoint**

In `src/App.tsx`, add:

```tsx
import { TimelineRiver } from './components/TimelineRiver'
import { useIsDesktop } from './state/useIsDesktop'
```

Add inside `App`:

```tsx
const isDesktop = useIsDesktop()
```

Replace the `<TimelineGantt … />` element with:

```tsx
{isDesktop ? (
  <TimelineGantt
    events={state.payload.events}
    window={viewWindow}
    server={server}
    now={now}
    onSelect={() => {}}
  />
) : (
  <TimelineRiver
    events={state.payload.events}
    window={viewWindow}
    server={server}
    now={now}
    onSelect={() => {}}
  />
)}
```

- [ ] **Step 4: Verify both renderers**

Run: `bun run dev`, then narrow the browser below 768px.
Expected: the gantt is replaced by the day-grouped river, "Today" is marked in red, and widening restores the gantt. No layout jump or console error at the crossover.

- [ ] **Step 5: Verify the build passes**

Run: `bun run build`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/TimelineRiver.tsx src/state/useIsDesktop.ts src/App.tsx
git commit -m "feat: add mobile river renderer and responsive swap at 768px"
```

---

### Task 14: Event detail sheet and data-age warning

**Files:**
- Create: `src/components/EventDetail.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `startInstant`, `endInstant`, `formatCountdown`, `statusAt` from `src/lib/time.ts`
- Produces: `<EventDetail event={TimelineEvent | null} server={ServerRegion} now={number} onClose={() => void} />`

- [ ] **Step 1: Write the detail sheet**

`src/components/EventDetail.tsx`:

```tsx
import { endInstant, formatCountdown, startInstant, statusAt } from '../lib/time'
import type { ServerRegion, TimelineEvent } from '../types'

type Props = {
  event: TimelineEvent | null
  server: ServerRegion
  now: number
  onClose: () => void
}

function localString(instant: number): string {
  return new Date(instant).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function EventDetail({ event, server, now, onClose }: Props) {
  if (!event) return null

  const start = startInstant(event, server)
  const end = endInstant(event, server)
  const status = statusAt(event, now, server)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-surface border-border w-full max-w-md rounded-2xl border p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={event.name}
      >
        {event.image && (
          <img
            src={event.image}
            alt=""
            className="mb-4 h-32 w-full rounded-xl object-cover"
            loading="lazy"
          />
        )}
        <h2 className="text-base">{event.name}</h2>

        <dl className="text-dim mt-3 space-y-1 text-xs">
          <div className="flex justify-between gap-4">
            <dt>Starts</dt>
            <dd className="text-text">{localString(start)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Ends</dt>
            <dd className="text-text">{end === null ? 'Open-ended' : localString(end)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>{status === 'upcoming' ? 'Starts in' : 'Time left'}</dt>
            <dd className="text-text">
              {status === 'ended'
                ? 'Ended'
                : formatCountdown(status === 'upcoming' ? start - now : (end ?? now) - now)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Clock</dt>
            <dd className="text-text">
              {event.clock === 'absolute' ? 'Fixed worldwide' : 'Your server time'}
            </dd>
          </div>
        </dl>

        {event.featured && event.featured.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {event.featured.map((f) => (
              <li
                key={f.name}
                className={`rounded-full px-2 py-0.5 text-[11px] ${
                  f.rarity === 5 ? 'bg-gold-deep text-gold' : 'bg-surface-hi text-dim'
                }`}
              >
                {f.name}
              </li>
            ))}
          </ul>
        )}

        {event.description && (
          <p className="text-dim mt-3 text-xs leading-relaxed">{event.description}</p>
        )}

        <div className="mt-4 flex items-center justify-between">
          {event.url ? (
            <a
              href={event.url}
              target="_blank"
              rel="noreferrer"
              className="text-gold text-xs underline"
            >
              Official announcement
            </a>
          ) : <span />}
          <button onClick={onClose} className="text-dim text-xs">Close</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire selection and the data-age warning**

In `src/App.tsx`, add:

```tsx
import { EventDetail } from './components/EventDetail'
import type { TimelineEvent } from './types'
```

Add inside `App`:

```tsx
const [selected, setSelected] = useState<TimelineEvent | null>(null)
```

Replace both `onSelect={() => {}}` props with `onSelect={setSelected}`.

Add this immediately before the closing `</main>`:

```tsx
<EventDetail event={selected} server={server} now={now} onClose={() => setSelected(null)} />

{state.status === 'ready' && (() => {
  const ageHours = (now - Date.parse(state.payload.generatedAt)) / 3_600_000
  return (
    <p className={ageHours > 36 ? 'text-urgent text-[11px]' : 'text-dim text-[11px]'}>
      {ageHours > 36
        ? `Data is ${Math.floor(ageHours / 24)} days old — the ingest may have stopped.`
        : `Updated ${formatCountdown(now - Date.parse(state.payload.generatedAt))} ago`}
    </p>
  )
})()}
```

And add `formatCountdown` to the imports from `./lib/time`.

The 36-hour threshold sits just past two missed 6-hourly runs, so a single transient failure does not cry wolf. This is the spec's staleness tripwire on the client side: the site tells you it went stale rather than looking fine.

- [ ] **Step 3: Verify the whole app**

Run: `bun run dev`
Expected: clicking any bar or river card opens the sheet with both timestamps, the countdown, and the clock semantic; clicking the backdrop or Close dismisses it; the footer shows a recent "Updated … ago".

- [ ] **Step 4: Verify build and full test suite**

Run: `bun run build && bun run test`
Expected: build exits 0, all 85 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/EventDetail.tsx src/App.tsx
git commit -m "feat: add event detail sheet and data-age warning"
```

---

## Deferred to the next plan

Slices 4–6 from the spec, in order: time travel over the lazy-loaded archive, banner search over `banners.json`, and URL-as-source-of-truth with lane filtering. Task 12's `viewWindow` becomes URL-derived at that point, and `onSelect` writes `?e=<id>`; both are already isolated to `App.tsx`.

Three further items carry forward deliberately:

- **React Router.** The spec names it, but slices 1–3 are one route, so adding a router now would be scaffolding with no consumer. `vercel.json` already ships the catch-all rewrite it will need, so introducing it with the banner-search route is a pure addition.
- **`archive.json` and `banners.json`** are not emitted by this plan's ingest. The archive extraction already exists at `research/data/timeline_archive.json` and needs a `_sha`/`_rev` strip plus a lane remap — work that belongs with the view consuming it.
- **Amber's localized names.** `fetchAll` already retrieves and caches the Project Amber payload, and `amberIndex` keys it by English name, but only the banner art is consumed. The `name` map on each entry is what i18n will read, and the spec puts i18n out of scope for v1.
