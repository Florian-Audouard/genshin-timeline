# Genshin timeline — design

Date: 2026-07-23
Status: approved, ready for implementation planning

## Problem

[paimon.moe/timeline](https://paimon.moe/timeline) renders fine but its data is stale. The page is
driven by a hand-curated `src/data/timeline.js` whose last commit was 2026-06-09; the deployed
bundle's latest date literal is 2026-07-01. The neighbouring `banners.js` is still maintained, so
only the timeline lane data stopped.

The clone's core value is **replacing that manual curation step with an automated feed**. A visual
copy that also needs hand-feeding solves nothing.

Full data-source research, with runnable verification scripts, is in
[`research/FINDINGS.md`](../../../research/FINDINGS.md). This spec assumes it.

## Constraints

Set by the user, non-negotiable:

- Frontend only. No backend, no database, nothing executing at request time.
- React + Vite + Bun + Tailwind.
- Deployable to Vercel's free tier.
- It should look good. It does not have to look like the original.

## Decisions

### Data reaches the app as committed static JSON

The authoritative source — the HoYoverse announcement API — sends **no `Access-Control-Allow-Origin`
header** (verified 2026-07-23). A browser cannot read it. The two mirrors that do send `*`
(`api.ennead.cc`, `gi.yatta.moe`) both zero out events that have not started yet, so a
browser-only app would render future events as `1970-01-01`.

Therefore the data is fetched **outside the browser, ahead of time**:

```
GitHub Actions (cron)                  Vercel (static)
─────────────────────                  ───────────────
  bun run ingest
    ├─ A HoYo announcements   ← reachable: no browser, no CORS
    ├─ B ennead calendar
    ├─ C yatta Amber
    └─ data/overrides.json   ← repo input, hand-maintained
         ↓
  public/data/*.json         ← build output, served
         ↓
  commit iff changed        ──────────→ push triggers deploy
                                         bun install && bun run build
                                              ↓
                                         static files on CDN
```

This satisfies "no backend" literally: nothing runs while a user is on the site, there is no server
to deploy and no runtime cost. It also produces the one capability no live source has — **every cron
run is a commit, so git is the append-only archive.**

Rejected: Vercel Cron (Hobby tier is ~daily and requires a serverless function, i.e. a backend).
Rejected: browser-side fetching (loses source A, hard-depends on one third-party mirror, no history).

### Payloads

| File | Raw | When loaded |
|---|---|---|
| `public/data/current.json` | ~15 KB | On boot. Rolling window, −30d to +120d |
| `public/data/archive.json` | ~370 KB → ~80 KB gzip | Lazy, on time-travel past the window |
| `public/data/banners.json` | ~112 KB | Lazy, on the banner-search route |

`archive.json` is emitted with `_sha` and `_rev` stripped — research metadata that is a meaningful
share of those 370 KB.

### Event model

One normalized shape for live, archive and banner rows, so every view consumes one type:

```ts
type TimelineEvent = {
  id: string          // slug(name) + '@' + start — stable across ingest runs
  name: string
  lane: LaneId        // event | character-wish | weapon-wish | chronicled
                      // | abyss | theater | stygian | leyline | battlepass
  start: string       // 'YYYY-MM-DD HH:mm:ss'
  end: string | null  // null = startOnly, renders open-ended
  clock: 'server' | 'absolute'
  color: string
  image?: string
  url?: string
  description?: string
  featured?: { name: string; rarity: 4 | 5; element?: Element }[]
  version?: string    // '6.7'
  source: 'announcement' | 'calendar' | 'amber' | 'archive' | 'override'
}
```

`clock` is required and never inferred at render time. It encodes the distinction from FINDINGS §5:

- `'server'` — in-game events. Stored as wall-clock on the player's own server. "10:00" means 10:00
  wherever you play, so these are staggered in absolute time.
- `'absolute'` — wish banners, Battle Pass. A fixed instant, stored Asia UTC+8. Same moment worldwide.

Getting this wrong renders perfectly and is silently wrong by up to 15 hours. It is the single
highest-risk field in the system.

`source: 'override'` covers the one documented gap: Ley Line Overflow has no standalone announcement
while scheduled. A hand-maintained `data/overrides.json` is layered on top during the merge. One
version-controlled file, no special-casing anywhere in the app.

### Ingest is a TypeScript script; the workflow holds no logic

`research/fetch_timeline.py` is 208 lines of stdlib Python and works. It gets **ported to
TypeScript** and run with Bun:

```bash
bun run ingest           # fetch + normalize + write public/data/*.json
bun run ingest --dry     # fetch, print the diff, write nothing
bun run ingest --offline # replay .cache/ responses, zero network
```

Rationale:

1. One runtime. No Python in CI or on a contributor's machine.
2. The ingest emits `TimelineEvent` and the app consumes `TimelineEvent` — the same type. A schema
   change that would break the app is a typecheck failure at ingest time, not a blank screen.
3. `--offline` makes the merge logic unit-testable without hitting HoYo's servers, and is what the
   tests run against.

**The workflow file contains no logic** — checkout, install, `bun run ingest`, commit if changed.
That is what makes it locally runnable: the command you run on your machine is the command CI runs.

The port carries one specific risk. FINDINGS §3A documents that the announcement HTML is
entity-encoded one extra level, and that you must `html.unescape()` **exactly once** before matching
`<t class="t_lc|t_gl">` — without it you get zero matches. So:

- `research/fetch_timeline.py` stays as the reference implementation.
- A parity test asserts the TS port produces identical rows from the same cached fixtures.

### Staleness tripwire

This project exists because an automated-looking feed quietly stopped. Two failure modes get
explicit handling:

- Any source failing or returning zero rows **opens a GitHub issue**. The ingest never commits a
  silently-degraded dataset.
- GitHub disables scheduled workflows after 60 days of repository inactivity, and bot commits do not
  reliably reset that timer. The app surfaces its own data age: a visible "updated N hours ago" that
  turns into a warning past a threshold. The site tells you it went stale rather than looking fine.

## Scope

### In

- Timeline view (the core).
- Command deck — what is live, what ends within 72h with countdowns, what starts next.
- Time travel through the 863-event archive, 2021 → now.
- Banner / character search over the 291-banner history.
- Lane filtering and shareable URLs.

### Out

- Anything requiring a user account, sync, or persistence beyond `localStorage`.
- Notifications or push.
- Wish tracking / gacha analytics — that is paimon.moe's other feature set and a separate product.
- i18n. Sources C and A both support it (FINDINGS §3), so the data layer must not *preclude* it,
  but no translation work ships in v1.

## Design

### Layout

A command deck as the page shell, with the timeline below it in one of two renderings.

- **Command deck** (always visible) — ending within 72h with live countdowns, current banners with
  their featured characters, next event to start. This answers the daily question in the top 100px.
  It is the largest UX gain over the original, which forces you to scan eleven lanes against a
  vertical line to learn the same thing.
- **`<TimelineGantt>`** above 768px — horizontal lanes, sticky now-rail, art in the bars, hover
  detail. Best density, and the only shape that shows concurrency: you can see that one event starts
  before another ends.
- **`<TimelineRiver>`** below 768px — time flows top to bottom, days as rows, events as cards.
  Genuinely native on a phone, and makes "today" unmissable.

The two renderers are a component swap at the breakpoint, not a CSS reflow. A Gantt bar and an
agenda card are different components with different affordances; pretending otherwise produces a bad
version of both. They share one hook, one selection, one detail sheet.

### Visual identity

Single dark theme. Deep navy surfaces, Genshin gold as the one chrome accent, elemental colors as
the only varying accent.

The chrome stays deliberately quiet because **the app is full of official event art** — large,
high-saturation key art. Decorative chrome (gradient washes, glass, heavy borders) competes with it
and turns busy the moment real content loads. Saturation is the content's job.

No light theme in v1. This was an explicit user decision: one theme done properly over two done
adequately.

### State

**The URL is the source of truth** for date, lane filters, and selected event:

```
?d=2023-08-14&lanes=event,abyss&e=<id>
```

Every view is linkable, the back button is correct, and reload preserves position. Only server
choice and any future theme preference live in `localStorage`.

Server choice matters because of `clock: 'server'`: the same event renders at different local times
depending on whether you play on Asia, America, Europe or TW/HK/MO. Default is detected from the
browser's UTC offset, then overridable and persisted.

### Modules

```
src/lib/time.ts        parse wall-clock, apply server offset, countdown math
src/lib/timeline.ts    filter to window, pack lanes, resolve overlaps
src/state/store.ts     server choice + lane filters, localStorage-backed
scripts/ingest.ts      fetch, merge, normalize, emit

data/overrides.json    ingest input, hand-maintained, version-controlled
public/data/*.json     ingest output, served to the browser
```

Three directories share the word "data" and mean different things: `data/` is a source input,
`public/data/` is generated output that should never be edited by hand, and `src/state/` is
runtime app state. Nothing generated is committed to `data/`, nothing hand-written lives in
`public/data/`.

`lib/time.ts` and `lib/timeline.ts` are **pure, React-free, and unit-tested**. They hold the two
kinds of logic whose bugs are invisible: timezone arithmetic that renders plausibly while being
wrong, and lane packing that looks fine until two events overlap.

Everything else is presentational and is verified by looking at it.

Hand-rolled rather than `date-fns-tz`: the two-clock semantics are custom enough that a library ends
up wrapped in as much code as it replaces, with the wrapper holding all the actual risk.

### Stack

Vite + React + Tailwind v4 (CSS-first tokens) + Bun. React Router with a catch-all rewrite in
`vercel.json`. Theme tokens defined once as CSS variables.

## Testing

| Layer | How |
|---|---|
| `lib/time.ts` | Vitest. Both clock semantics × four servers, DST-free but offset-correct, countdown boundaries |
| `lib/timeline.ts` | Vitest. Window filtering, lane packing, overlapping and open-ended events |
| `scripts/ingest.ts` | Vitest against `--offline` fixtures. Merge precedence, zeroed-date backfill from source A |
| Ingest parity | One test diffing TS output against `research/fetch_timeline.py` output on shared fixtures |
| Views | Visual. No component test suite in v1 |

## Build order

Each slice ships something visible.

1. Scaffold, ingest port, GitHub Action, normalized JSON, `lib/time.ts` + tests
2. Gantt + command deck, desktop only
3. River + responsive swap
4. Time travel + lazy archive
5. Banner search
6. URL state, lane filters, polish

Slices 1–3 are the product. Slices 4–5 are additional routes over the same data layer and are the
natural cut point if the thing needs to ship sooner.

## Risks

| Risk | Mitigation |
|---|---|
| `clock` misapplied | Required field, pure tested module, both semantics covered in tests |
| TS port loses the double-unescape fix | Python kept as reference; parity test on shared fixtures |
| Scheduled workflow silently disabled at 60d | App surfaces its own data age and warns |
| `api.ennead.cc` disappears | Source A alone still yields ~11 of 12 rows; Abyss and Theater are deterministic monthly cycles (1st and 16th, 04:00 server) |
| Archive payload bloats first paint | Separate file, lazy-loaded, `_sha`/`_rev` stripped |
