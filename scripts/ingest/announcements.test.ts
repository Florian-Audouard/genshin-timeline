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
