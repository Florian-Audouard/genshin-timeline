import { describe, expect, it } from 'vitest'
import { readableOn } from './color'

describe('readableOn', () => {
  it('puts dark text on the light lane colors', () => {
    expect(readableOn('#d3bc8e')).toBe('#000')
    expect(readableOn('#a5c83b')).toBe('#000')
    expect(readableOn('#f0b73a')).toBe('#000')
  })

  it('puts light text on the abyss navy, which black text is unreadable on', () => {
    expect(readableOn('#2a2f47')).toBe('#fff')
  })

  it('accepts shorthand hex', () => {
    expect(readableOn('#000')).toBe('#fff')
    expect(readableOn('#fff')).toBe('#000')
  })

  it('falls back to dark text on an unparseable color', () => {
    expect(readableOn('rebeccapurple')).toBe('#000')
  })
})
