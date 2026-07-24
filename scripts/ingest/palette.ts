import sharp from 'sharp'

/**
 * The dominant color of a banner image, as `#rrggbb`.
 *
 * Genshin banners are busy: a plain average muddies to grey and a plain
 * most-frequent-bucket usually returns the dark background or a white blowout.
 * So we bucket colors coarsely and weight each pixel toward the saturated,
 * mid-luminance range — the part of the art a person actually reads as "its
 * colour" — before picking the heaviest bucket. Tuned against real banners in
 * the throwaway comparison that led to this feature.
 */
export async function dominantColor(buf: Buffer): Promise<string> {
  const N = 64
  const data = await sharp(buf)
    .resize(N, N, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer()

  const buckets = new Map<number, { r: number; g: number; b: number; w: number }>()
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i]!
    const g = data[i + 1]!
    const b = data[i + 2]!
    const mx = Math.max(r, g, b)
    const mn = Math.min(r, g, b)
    const sat = mx ? (mx - mn) / mx : 0
    const lum = mx / 255
    // Favor saturated, mid-luminance pixels; floor the weight so no pixel is free.
    const w = Math.max((0.15 + sat) * (1 - Math.abs(lum - 0.55) * 1.1), 0.01)

    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const e = buckets.get(key) ?? { r: 0, g: 0, b: 0, w: 0 }
    e.r += r * w
    e.g += g * w
    e.b += b * w
    e.w += w
    buckets.set(key, e)
  }

  let best: { r: number; g: number; b: number; w: number } | null = null
  for (const e of buckets.values()) if (!best || e.w > best.w) best = e
  if (!best) return '#000000'

  return hex(best.r / best.w, best.g / best.w, best.b / best.w)
}

function hex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(v).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}
