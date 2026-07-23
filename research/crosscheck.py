# -*- coding: utf-8 -*-
"""Cross-validate api.ennead.cc/calendar (structured) against the official
HoYoverse announcement API (authoritative) to see if the timestamps agree."""
import json, io, re, html, datetime, urllib.request

SP = "."
CN8 = datetime.timezone(datetime.timedelta(hours=8))   # Asia server clock


def ts(unix):
    """Unix -> Asia-server wall clock (UTC+8), matching announcement t_lc."""
    return datetime.datetime.fromtimestamp(unix, CN8).strftime("%Y-%m-%d %H:%M:%S")


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


T_TAG = re.compile(r'<t[^>]*class="(t_lc|t_gl)"[^>]*>(.*?)</t>', re.S)
DATE_RE = re.compile(r"(\d{4})[/-](\d{2})[/-](\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?")


def strip(h):
    h = re.sub(r"<[^>]+>", "", h)
    return html.unescape(h)


def times_in(content):
    out = []
    for _, inner in T_TAG.findall(html.unescape(content)):
        m = DATE_RE.search(strip(inner))
        if m:
            y, mo, d, hh, mm, ss = m.groups()
            out.append(f"{y}-{mo}-{d} {hh}:{mm}:{ss or '00'}")
    return out


cal = get("https://api.ennead.cc/mihoyo/genshin/calendar")
ann = get("https://sg-hk4e-api.hoyoverse.com/common/hk4e_global/announcement/api/"
          "getAnnContent?game=hk4e&game_biz=hk4e_global&lang=en&bundle_id=hk4e_global"
          "&platform=pc&region=os_asia&level=60&uid=100000000")
anns = ann["data"]["list"]

print("=" * 78)
print("CALENDAR (api.ennead.cc) — converted to Asia server time (UTC+8)")
print("=" * 78)
for sec in ("events", "banners", "challenges"):
    print(f"\n--- {sec} ({len(cal[sec])}) ---")
    for e in cal[sec]:
        extra = ""
        if sec == "banners":
            who = [c["name"] for c in e.get("characters", []) if c.get("rarity") == 5]
            who += [w["name"] for w in e.get("weapons", []) if w.get("rarity") == 5]
            extra = f"  v{e.get('version')}  5*: {', '.join(who) or '-'}"
        print(f"  {ts(e['start_time'])} -> {ts(e['end_time'])} | {e['name'][:44]:44}{extra}")

print()
print("=" * 78)
print("CROSS-CHECK: calendar times vs times parsed from the official announcement")
print("=" * 78)


def find_ann(name):
    """Locate the announcement whose title contains the calendar event name."""
    key = name.lower()
    for a in anns:
        if key in strip(a["title"]).lower():
            return a
    return None


agree = disagree = nomatch = 0
for sec in ("events", "banners"):
    for e in cal[sec]:
        a = find_ann(e["name"])
        if not a:
            print(f"  ?    no announcement matched: {e['name'][:50]}")
            nomatch += 1
            continue
        tt = times_in(a["content"])
        cs, ce = ts(e["start_time"]), ts(e["end_time"])
        # announcements print minutes only, so compare to the minute
        hit_s = any(t[:16] == cs[:16] for t in tt)
        hit_e = any(t[:16] == ce[:16] for t in tt)
        mark = "OK  " if (hit_s and hit_e) else "DIFF"
        if hit_s and hit_e:
            agree += 1
        else:
            disagree += 1
        print(f"  {mark} {e['name'][:40]:40} cal={cs[:16]}->{ce[:16]}  "
              f"ann_start_match={hit_s} ann_end_match={hit_e}")
        if not (hit_s and hit_e):
            print(f"       announcement <t> tags: {tt[:6]}")

print(f"\nagree={agree}  disagree={disagree}  unmatched={nomatch}")
