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
