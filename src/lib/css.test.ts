import { describe, expect, it } from 'vitest'
import { cssUrl } from './css'

describe('cssUrl', () => {
  it('quotes plain URLs', () => {
    expect(cssUrl('https://x.test/a.png')).toBe('url("https://x.test/a.png")')
  })

  it('keeps URLs with spaces valid (the archive filenames)', () => {
    expect(cssUrl('https://paimon.moe/images/events/Invokers Secrets.png')).toBe(
      'url("https://paimon.moe/images/events/Invokers Secrets.png")',
    )
  })

  it('escapes embedded quotes and backslashes', () => {
    expect(cssUrl('https://x.test/a"b\\c.png')).toBe('url("https://x.test/a\\"b\\\\c.png")')
  })
})
