# -*- coding: utf-8 -*-
"""
PROTOTYPE: produce a complete, paimon.moe-shaped timeline for *right now*
by merging three independent live sources.

  A. HoYoLAB act_calendar mirror  (api.ennead.cc)  -> structured, unix ts,
     banner rosters, Abyss / Theater cycles, rewards
  B. Official HoYoverse announcement API           -> authoritative dates for
     events that have not started yet, banner art, official URLs
  C. Project Amber event mirror (gi.yatta.moe)     -> clean short names, i18n,
     per-language banner art

Nothing here is scraped from HTML pages; every source is a JSON endpoint.
"""
import json, re, html, datetime, urllib.request, collections

CN8 = datetime.timezone(datetime.timedelta(hours=8))
UA = {"User-Agent": "Mozilla/5.0"}

ANN = ("https://sg-hk4e-api.hoyoverse.com/common/hk4e_global/announcement/api/"
       "{ep}?game=hk4e&game_biz=hk4e_global&lang=en&bundle_id=hk4e_global"
       "&platform=pc&region=os_asia&level=60&uid=100000000")
CAL = "https://api.ennead.cc/mihoyo/genshin/calendar"
AMBER = "https://gi.yatta.moe/assets/data/event.json"


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def ts(unix):
    return datetime.datetime.fromtimestamp(unix, CN8).strftime("%Y-%m-%d %H:%M:%S")


# ---- announcement <t> time tags -------------------------------------------
T_TAG = re.compile(r'<t[^>]*class="t_(?:lc|gl)"[^>]*>(.*?)</t>', re.S)
DATE_RE = re.compile(r"(\d{4})[/-](\d{2})[/-](\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?")
# A start/end pair is two <t> tags separated only by a dash and markup.
PAIR = re.compile(
    r'<t[^>]*class="t_(?:lc|gl)"[^>]*>(.*?)</t>'      # start
    r'(?:(?!<t[^>]*class="t_).){0,80}?'               # only dash/markup between
    r'<t[^>]*class="t_(?:lc|gl)"[^>]*>(.*?)</t>',     # end
    re.S,
)


def txt(h):
    return html.unescape(re.sub(r"<[^>]+>", "", h)).strip()


def norm(s):
    m = DATE_RE.search(txt(s))
    if not m:
        return None
    y, mo, d, hh, mm, ss = m.groups()
    return f"{y}-{mo}-{d} {hh}:{mm}:{ss or '00'}"


def duration_pairs(content):
    """All (start, end) pairs written as adjacent <t> tags, in document order."""
    c = html.unescape(content)
    out = []
    for a, b in PAIR.findall(c):
        s, e = norm(a), norm(b)
        if s and e and e > s:
            out.append((s, e))
    return out


def event_window(content):
    """Widest sensible window: prefer the pair under an 〓...Duration〓 heading,
    else the first valid pair."""
    c = html.unescape(content)
    for head in ("Event Duration", "Event Wish Duration", "Duration",
                 "Event Period", "Time Limit"):
        i = c.find(head)
        if i != -1:
            p = duration_pairs(c[i:])
            if p:
                return p[0]
    p = duration_pairs(c)
    return p[0] if p else (None, None)


# ---- fetch ----------------------------------------------------------------
cal = get(CAL)
ann_list = get(ANN.format(ep="getAnnList"))
ann_content = get(ANN.format(ep="getAnnContent"))
amber = get(AMBER)

meta = {}
for grp in ann_list["data"]["list"]:
    for a in grp["list"]:
        meta[a["ann_id"]] = {"type_id": grp["type_id"], "type_label": grp["type_label"],
                             "title": txt(a["title"]), "subtitle": txt(a.get("subtitle", "")),
                             "ann_start": a["start_time"], "ann_end": a["end_time"]}
for a in ann_content["data"]["list"]:
    if a["ann_id"] in meta:
        meta[a["ann_id"]].update(banner=a.get("banner", ""), content=a.get("content", ""))

# announcement-derived event windows
for aid, m in meta.items():
    s, e = event_window(m.get("content", ""))
    m["ev_start"], m["ev_end"] = s, e

# ---- helpers to join calendar names <-> announcement titles ---------------
def norm_name(s):
    return re.sub(r"[^a-z0-9]+", "", s.lower())


ann_by_norm = {}
for aid, m in meta.items():
    ann_by_norm[norm_name(m["title"])] = aid

amber_by_norm = {}
for k, v in amber.items():
    amber_by_norm[norm_name(v["name"]["EN"])] = v


def match_ann(name):
    n = norm_name(name)
    for k, aid in ann_by_norm.items():
        if n and n in k:
            return meta[aid]
    return None


WISH_TITLE = re.compile(r'Event Wish\s*[“"]([^”"]+)[”"]', re.I)
EPITOME = re.compile(r'Epitome Invocation', re.I)

rows = []

# --- 1. events -------------------------------------------------------------
for e in cal["events"]:
    a = match_ann(e["name"]) or {}
    am = amber_by_norm.get(norm_name(e["name"]), {})
    start = ts(e["start_time"]) if e["start_time"] else a.get("ev_start")
    end = ts(e["end_time"]) if e["end_time"] else a.get("ev_end")
    rows.append({
        "lane": "event", "name": e["name"],
        "start": start, "end": end,
        "start_src": "calendar" if e["start_time"] else "announcement",
        "image": (am.get("banner", {}) or {}).get("EN") or a.get("banner", ""),
        "url": f"https://www.hoyolab.com/article/{a['ann_id']}" if a.get("ann_id") else "",
        "description": (e.get("description") or "")[:160],
        "ann_id": a.get("ann_id"),
    })

# --- 2. wish banners -------------------------------------------------------
for b in cal["banners"]:
    five = [c["name"] for c in b.get("characters", []) if c.get("rarity") == 5]
    four = [c["name"] for c in b.get("characters", []) if c.get("rarity") == 4]
    w5 = [w["name"] for w in b.get("weapons", []) if w.get("rarity") == 5]
    w4 = [w["name"] for w in b.get("weapons", []) if w.get("rarity") == 4]
    # find the matching "Event Wish" announcement to recover the wish's own name
    wish_name, art, aid = None, "", None
    for i, m in meta.items():
        t = m["title"]
        if "Event Wish" not in t and "Epitome" not in t:
            continue
        mt = WISH_TITLE.search(t)
        cand = mt.group(1) if mt else ("Epitome Invocation" if EPITOME.search(t) else None)
        if not cand:
            continue
        hit = (any(n in t for n in five + w5))
        if hit:
            wish_name, art, aid = cand, m.get("banner", ""), i
            break
    rows.append({
        "lane": "banner", "name": wish_name or b["name"],
        "start": ts(b["start_time"]), "end": ts(b["end_time"]),
        "start_src": "calendar", "image": art,
        "url": f"https://www.hoyolab.com/article/{aid}" if aid else "",
        "description": f"v{b.get('version')} | 5*: {', '.join(five + w5) or '-'} | "
                       f"4*: {', '.join(four + w4) or '-'}",
        "ann_id": aid, "timezoneDependent": True,
    })

# --- 3. challenges (Abyss / Theater) --------------------------------------
for c in cal["challenges"]:
    rows.append({
        "lane": "challenge", "name": c["name"],
        "start": ts(c["start_time"]), "end": ts(c["end_time"]),
        "start_src": "calendar", "image": "", "url": "",
        "description": c.get("type_name", ""), "ann_id": None,
    })

# --- report ----------------------------------------------------------------
now = datetime.datetime.now(CN8).strftime("%Y-%m-%d %H:%M:%S")
print(f"now (Asia server) = {now}\n")
complete = [r for r in rows if r["start"] and r["end"]]
print(f"rows={len(rows)}  fully-dated={len(complete)}  "
      f"with-image={sum(1 for r in rows if r['image'])}  "
      f"with-url={sum(1 for r in rows if r['url'])}")
print()
hdr = f"{'lane':10} {'start':19} {'end':19} {'src':12} img url  name"
print(hdr); print("-" * len(hdr))
for r in sorted(rows, key=lambda r: (r["lane"], r["start"] or "")):
    print(f"{r['lane']:10} {str(r['start']):19} {str(r['end']):19} "
          f"{r['start_src']:12} {'Y' if r['image'] else '.'}   "
          f"{'Y' if r['url'] else '.'}    {r['name'][:44]}")
    if r["lane"] == "banner":
        print(f"{'':63}   {r['description'][:96]}")

json.dump(rows, open("timeline_live.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)
print("\nwrote timeline_live.json")
