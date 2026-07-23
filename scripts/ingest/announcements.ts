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
