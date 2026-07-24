# Reliable data sources for a paimon.moe/timeline clone

Investigation date: **2026-07-23** (checks run against Asia server clock, then 2026-07-24 04:59 UTC+8).
Every claim below was verified by an actual request, not from memory. Scripts that reproduce each
check are in this folder.

---

## 1. What actually broke

paimon.moe/timeline is **not down** — it returns HTTP 200 and the page renders correctly.
Its *data* stopped being updated.

| Evidence | Result |
|---|---|
| `github.com/MadeBaruna/paimon-moe` last push | 2026-07-21 — repo is alive |
| Last commit touching `src/data/timeline.js` | **2026-06-09** ("Update timeline") |
| Last commit touching `src/data/banners.js` | 2026-07-21 ("Update banners") — still current |
| Latest date literal in the **deployed** bundle `/_app/immutable/chunks/timeline-138f001d.js` | **2026-07-01 04:00:00** |
| Visual check in Chrome | timeline ends around June 2026; the "now" marker is off the end |

So the Banners page still works while the Timeline page is stale — the timeline is hand-curated in a
separate file that the maintainer stopped updating ~6 weeks ago. **The clone's whole job is to
replace that manual step with an automated feed.**

---

## 2. What can be inside a timeline entry

Full schema, recovered from `src/data/timeline.js` + `routes/timeline/{index,_item,_detail}.svelte`,
and confirmed against all 863 historical entries:

```js
{
  name:              'Kaleidoscopic Color Chase',   // required — strip label
  start:             '2026-06-18 10:00:00',         // required — 'YYYY-MM-DD HH:mm:ss'
  end:               '2026-06-29 03:59:00',         // required
  color:             '#f4d6e7',                     // required — strip colour
  image:             'Kaleidoscopic Color Chase tmp.webp',  // /images/events/<image>
  pos:               '0% 20%',                      // CSS background-position on the strip
  zoom:              '200%',                        // CSS background-size
  url:               'https://www.hoyolab.com/article/45318238',  // optional detail link
  description:       '...',                         // optional — used for Abyss/Theater buffs
  showOnHome:        true,                          // optional — also render on the homepage
  timezoneDependent: true,                          // optional — see §5
  startOnly:         true,                          // optional — open-ended, renders as "live"
}
```

Field frequency across the whole archive (5 982 field occurrences, 863 unique events):

```
name 5982 · start 5982 · end 5982 · color 5982 · pos 5680 · image 5657
url 4415 · zoom 3984 · showOnHome 3554 · description 1451
timezoneDependent 1343 · startOnly 490
```

The top-level structure is an array of **lanes** (rows), each lane an array of events.
The live site currently uses 11 lanes:

1. Ley Line Overflow (double drops)
2. Events — row A
3. Events — row B
4. Character Event Wish 1
5. Character Event Wish 2
6. Epitome Invocation (weapon)
7. Chronicled Wish (e.g. "Dewlit Tranquility - Fontaine Banner")
8. Stygian Onslaught
9. Spiral Abyss (monthly, `description` = Abyssal Moon blessing)
10. Imaginarium Theater (monthly, `description` = required elements + opening characters)
11. Battle Pass

---

## 3. The sources — verified

### A. Official HoYoverse announcement API — *authoritative, no auth, no key*

```
https://sg-hk4e-api.hoyoverse.com/common/hk4e_global/announcement/api/getAnnList
https://sg-hk4e-api.hoyoverse.com/common/hk4e_global/announcement/api/getAnnContent
  ?game=hk4e&game_biz=hk4e_global&lang=en&bundle_id=hk4e_global
  &platform=pc&region=os_asia&level=60&uid=100000000
```

- `retcode: 0`, 31 announcements live, **30 of 31 carry banner art**.
- `getAnnList` → id, title, subtitle, type (1=Event, 2=Game, 26=Miliastra), announcement window.
- `getAnnContent` → `banner` (full-res art URL) + `content` (the announcement HTML).
- **The gotcha:** the real event window is not in the JSON fields — it is inside the HTML, wrapped in
  time tags that are *entity-encoded one extra level*:

  ```
  &lt;t class="t_lc" contenteditable="false"&gt;2026/07/24 10:00&lt;/t&gt; – &lt;t ...&gt;2026/08/03 03:59&lt;/t&gt;
  ```

  `html.unescape()` **once**, then match `<t class="t_lc|t_gl">…</t>`. Anchor on the
  `〓Event Duration〓` / `〓Duration〓` heading and take the first adjacent pair. Without the unescape
  step you get 0 matches — that was the first thing I got wrong.
- Verified `lang=` works for `en, fr, ja, zh-cn, ko, de` — identical dates, translated titles.
- Verified `region=` `os_asia / os_usa / os_euro / os_cht` all return the **same** `t_lc` wall-clock
  (10:00 is 10:00 on your own server). Region only changes the reported `timezone` field.

**Limitation: it is a live snapshot.** Only currently-displayed announcements. No history.

### B. HoYoLAB `act_calendar` mirror — *structured, unix timestamps*

```
https://api.ennead.cc/mihoyo/genshin/calendar
```

Returns `{events[], banners[], challenges[]}` — this is the in-game event calendar, already parsed:

- **events**: `id, name` (clean short name!), `description`, `image_url`, `start_time`, `end_time` (unix), `rewards[]`
- **banners**: `name, version` ("6.7"), `characters[]` and `weapons[]` with `rarity`/`element`/`icon`, `start_time`, `end_time`
- **challenges**: Abyssal Moon Spire + Imaginarium Theater with their cycle windows

Verified right now it returns v6.7: Columbina / Raiden Shogun / Epitome Invocation, Abyss
2026-07-16→08-16, Theater 2026-07-01→08-01.

**Two limitations, both real:**
1. Events that **have not started yet return `start_time: 0` / `end_time: 0`** (unix epoch). Both
   "Dance Dance Easy-Breezy Disco" and "Ley Line Overflow" were zeroed at the time of testing.
2. Banner names are generic (`"Character Event Wish"`), not the wish name (`"Somnias a Luna"`).
3. It is a third-party mirror. The upstream HoYoLAB endpoint
   `sg-public-api.hoyolab.com/event/game_record/genshin/api/act_calendar` returns
   **"Method Not Allowed"** without account cookies — so there is no unauthenticated official
   substitute. Treat ennead.cc as a convenience, not a dependency.

### C. Project Amber event mirror — *clean names + i18n*

```
https://gi.yatta.moe/assets/data/event.json
```

Keyed by announcement id. Gives `name` / `nameFull` / `description` / `banner` in **EN, RU, CHS, CHT,
KR, JP**, plus `startAt` / `endAt`. Note `startAt` is the *announcement* window, not the event window —
use it for names and art, not for dates. Also a live snapshot (18 entries).

### D. paimon.moe's own git history — *the historical archive*

`src/data/timeline.js` has **174 revisions** from 2021-03-12 to 2026-06-09. Walking every revision
and unioning the events reconstructs the complete archive.

**Verified: 174/174 revisions evaluated cleanly, 863 unique events, 2021-02-03 → 2026-06-18.**

```
2021: 170   2022: 187   2023: 148   2024: 144   2025: 147   2026: 67
recurring: Spiral Abyss ×104 · Epitome Invocation ×100 · Imaginarium Theater ×26 · Ley Line Overflow ×20
```

Saved at `data/timeline_archive.json`. This is a one-time extraction — it never needs rerunning
except to pick up anything the maintainer adds later.

`src/data/banners.js` is a separate, **still-maintained** file: 291 banner entries, 2020-09-28 →
2026-07-21, with `featured` (5★), `featuredRare` (4★), `version`, `timezoneDependent`. Saved at
`data/paimon_banners.js`.

---

## 4. The combination that works

A and B have exactly complementary failure modes, which is why the merge is sound:

| | future events | clean names | banner rosters | Abyss/Theater | art | history |
|---|---|---|---|---|---|---|
| A announcements | ✅ | ⚠️ full titles | ⚠️ in prose | ❌ | ✅ | ❌ |
| B calendar | ❌ zeroed | ✅ | ✅ | ✅ | ⚠️ wiki | ❌ |
| C Amber | ❌ | ✅ +i18n | ❌ | ❌ | ✅ | ❌ |
| D git archive | — | ✅ | ✅ | ✅ | ✅ | ✅ 2021→2026-06 |

`fetch_timeline.py` implements the merge. Result from the live run:

```
rows=12  fully-dated=11  with-image=9  with-url=3

banner     2026-07-21 18:00 → 2026-08-11 14:59  Somnias a Luna       v6.7 5*: Columbina
banner     2026-07-21 18:00 → 2026-08-11 14:59  Reign of Serenity    v6.7 5*: Raiden Shogun
banner     2026-07-21 18:00 → 2026-08-11 14:59  Epitome Invocation   v6.7 5*: Nocturne's Curtain Call, Engulfing Lightning
challenge  2026-07-01 04:00 → 2026-08-01 03:59  Imaginarium Theater
challenge  2026-07-16 04:00 → 2026-08-16 03:59  Abyssal Moon Spire
event      2026-06-30 10:00 → 2026-08-11 03:59  Sunny Summer Fontinalia
event      2026-07-01 07:00 → 2026-08-12 07:00  The Forge Realm's Temper: Endless Swarm
event      2026-07-08 10:00 → 2026-08-11 03:59  Stygian Onslaught
event      2026-07-17 10:00 → 2026-07-27 03:59  Final Long-Range Sightlines
event      2026-07-18 10:00 → 2026-08-03 03:59  Heated Battle Mode: Automatic Artistry
event      2026-07-24 10:00 → 2026-08-03 03:59  Dance Dance Easy-Breezy Disco   ← calendar said 0; announcement filled it
event      —                                    Ley Line Overflow               ← the one gap
```

`crosscheck.py` independently validates B against A: where both have data, timestamps agree to the
minute (Final Long-Range Sightlines, Stygian Onslaught, Heated Battle Mode all matched exactly).

### The one gap: Ley Line Overflow

No standalone announcement while it is scheduled; the dates live inside the version overview post.
It is a fixed recurring pattern (a one-week double-drop window each patch), so it is derivable — but
it is the single item that needs either prose parsing or a small manual override table.

---

## 5. Timezone semantics — do not get this wrong

paimon.moe stores two different kinds of time and the distinction is load-bearing:

- **`timezoneDependent: true`** (wish banners, Battle Pass) — stored in **Asia UTC+8**, converted by
  the Asia offset. These start at the *same absolute instant* worldwide.
- **default** (in-game events) — stored in **server-local wall clock**, shifted by the player's own
  server offset. "10:00" means 10:00 on *your* server, i.e. staggered in absolute time.

This matches the sources exactly: the announcement `t_lc` tags are region-invariant wall-clock
(verified identical across all four regions), while the calendar API's unix timestamps are absolute
Asia-server time. Having both lets you derive either representation — but you must tag each row with
which semantic it uses.

---

## 6. Images

All hotlinkable, verified 200 with correct content types:

| Source | Example | Result |
|---|---|---|
| HoYo announcement CDN | `sdk.hoyoverse.com/upload/ann/…_transformed.jpg` | 200, 371 KB, `image/jpeg`, `Cache-Control: max-age=300` |
| paimon.moe static (for the archive) | `paimon.moe/images/events/…webp` | 200, 27 KB, `image/webp` |
| Fandom (used by the calendar API) | `static.wikia.nocookie.net/gensin-impact/…` | 200, 108 KB, `image/webp` |

No `Access-Control-Allow-Origin` on the HoYo CDN — fine for `<img src>`, but you must proxy/mirror if
you ever need canvas or `fetch()`. Given `max-age=300` and that these are someone else's servers,
mirroring the art into your own storage at ingest time is the right call.

### Historical wish-banner promo art — game8

The archive's wish banners (`paimon_banners.js`) carry no announcement art, unlike the live
calendar. paimon.moe only has character portraits, not banner promo art — the wide key-visual with
the roster and the banner name is what actually reads as "a banner" on the timeline. game8's
[banner-history page](https://game8.co/games/Genshin-Impact/archives/603811) hosts exactly that:
one wide promo image per banner at `img.game8.co/{id}/{hash}.png/show`. Verified hotlinkable
(200, `image/png`, served from Amazon S3, no referer check).

Scraped into `research/data/g8_banners.tsv` (raw dated rows) → reduced to `research/data/g8_banner_art.json`,
a `{normalisedName → {name, image}}` map keyed by `normKey(name)`, both consumed by `build-history.ts`
and joined in `history.ts` (`resolveBannerArt`). Names alone cannot join the weapon lane — paimon
names every weapon banner "Epitome Invocation" while game8 uses thematic names or literal
"Phase 1"/"Phase 2" labels — so the join works per *launch window* (same start date): name-match
what it can, then pair the single leftover row with the single artless banner. Phase-labelled rows
were visually verified to be Epitome Invocation promo art and may only ever pair with the weapon
lane. A few scraped start dates carried the wrong year (spans like "2025-03-17 → 2026-04-07" for a
three-week run); `parseG8Tsv` repairs them. All 71 resulting joins agree with the paimon end dates
to within 2 days, and spot-checked images match the banner's featured roster.

Coverage after the window join: character-wish 91/103, chronicled 6/7, weapon-wish **71**/102 —
the remaining weapon runs predate game8's table (first row 2021-05-18) or sit in windows game8
never listed. The 8 missing character banners (Sparkling Steps, Secretum Secretorum, Dance of
Lanterns, Born of Ocean Swell, Viridescent Vigil, Auric Blaze, Somnias a Luna [current, has live
art], To the Looking-Glass the Mademoiselle Said) still render as plain colour bars.

---

## 7. Recommended architecture

```
one-time   : rebuild_history.mjs      → data/timeline_archive.json   (863 events, 2021→2026-06)
             paimon banners.js        → data/paimon_banners.js       (291 banners, 2020→now)

scheduled  : fetch_timeline.py  (daily; hourly around version drops)
             ├─ B calendar    → structured rows, banner rosters, Abyss/Theater
             ├─ A announcements → fills zeroed future dates, banner art, official URLs, wish names
             ├─ C Amber       → clean short names + i18n
             └─ append-only upsert keyed on (name, start) into your own store
```

The append-only store is the point: **every live source is a snapshot with no history**, so the clone
only stays better than paimon.moe if it starts accumulating its own archive from day one. The git
reconstruction gives you 2021→June 2026 for free; the scheduled job carries it forward.

Fallback if ennead.cc disappears: A alone still yields events + wishes with dates and art (~11 of 12
rows), and Abyss/Theater are deterministic monthly cycles (16th and 1st, 04:00 server time).

---

## Files

| File | What it does | Verified |
|---|---|---|
| `fetch_timeline.py` | Merges A + B + C into timeline rows | 11/12 rows fully dated |
| `rebuild_history.mjs` | Walks 174 git revisions, unions events | 174/174, 863 events |
| `crosscheck.py` | Validates B against A | 3/3 agree where both have data |
| `data/timeline_archive.json` | Historical archive 2021→2026-06 | 863 events |
| `data/timeline_live.json` | Current live snapshot | 12 rows |
| `data/paimon_banners.js` | Banner history 2020→2026-07 | 291 banners |

`rebuild_history.mjs` expects a `repo/` clone alongside it:
```bash
git clone --filter=blob:none --no-checkout https://github.com/MadeBaruna/paimon-moe.git repo
```
