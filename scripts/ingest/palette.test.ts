import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dominantColor } from './palette'

const img = (name: string) => readFileSync(`public/images/${name}`)
const channels = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]

describe('dominantColor', () => {
  it('returns a well-formed #rrggbb color', async () => {
    expect(await dominantColor(img('spiral_abyss.jpg'))).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('is deterministic for the same input', async () => {
    const buf = img('leyline_overflow.jpg')
    expect(await dominantColor(buf)).toBe(await dominantColor(buf))
  })

  it('decodes webp as well as jpg', async () => {
    expect(await dominantColor(img('imaginarium_theater.webp'))).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('picks the art color, not the dark background', async () => {
    // spiral abyss art reads blue; the weighting must avoid returning near-black.
    const [r, g, b] = channels(await dominantColor(img('spiral_abyss.jpg')))
    expect(b).toBeGreaterThan(r) // blue-dominant
    expect(Math.max(r, g, b)).toBeGreaterThan(0x30) // not swallowed by the background
  })

  it('rejects an undecodable buffer by throwing', async () => {
    await expect(dominantColor(Buffer.from('not an image'))).rejects.toThrow()
  })
})
