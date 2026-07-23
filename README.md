# genshin-timeline

A clone of [paimon.moe/timeline](https://paimon.moe/timeline), which stopped showing current data in
June 2026.

**Nothing is built yet.** The data-source research is done and verified — read
[`research/FINDINGS.md`](research/FINDINGS.md) first. It covers what broke on the original, the full
timeline entry schema, the four verified sources and how they cover each other's gaps, the timezone
semantics, and the recommended ingest architecture.

## Running the research scripts

Verified working on 2026-07-24 (Python 3.12, Node 23). No dependencies, no API keys.

```bash
python research/fetch_timeline.py
```
Merges the three live sources into current timeline rows. Writes `timeline_live.json` to the
**current working directory**, so `cd research/data` first if you want it to land beside the other
data.

```bash
python research/crosscheck.py
```
Validates the calendar API against the official announcement API.

```bash
node research/rebuild_history.mjs
```
Rebuilds the historical archive by walking every revision of paimon.moe's `timeline.js`.

> **This one needs a `repo/` clone in the current working directory.** It is not checked in — clone
> it first:
>
> ```bash
> git clone --filter=blob:none --no-checkout https://github.com/MadeBaruna/paimon-moe.git repo
> ```
>
> Takes a few minutes over 174 revisions. You only need to rerun it to pick up anything the paimon.moe
> maintainer adds later — its output is already saved as `research/data/timeline_archive.json`.

## What's already extracted

| File | Contents |
|---|---|
| `research/data/timeline_archive.json` | 863 events, 2021-02-03 → 2026-06-18 (from 174/174 git revisions) |
| `research/data/paimon_banners.js` | 291 banners, 2020-09-28 → 2026-07-21, with 5★/4★ rosters and version |
| `research/data/timeline_live.json` | Live snapshot at time of research, 12 rows |
