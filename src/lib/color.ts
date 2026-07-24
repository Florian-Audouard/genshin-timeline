/**
 * Pick a legible text color for a bar filled with `hex`.
 *
 * Lane colors are data, not design tokens — they arrive from the ingest and can
 * be overridden per row in data/overrides.json. Hardcoding black text on them
 * made the abyss navy (#2a2f47) unreadable, so the label follows the fill's
 * luminance instead of assuming every lane is light.
 */
export function readableOn(hex: string): '#000' | '#fff' {
  const rgb = parseHex(hex)
  if (!rgb) return '#000'

  // WCAG relative luminance; the 0.5 cut is where black and white swap places.
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]

  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.18 ? '#000' : '#fff'
}

/**
 * `hex` as an `rgba()` string at the given alpha. Used to fade a bar's fill into
 * its own hue — fading straight to the CSS `transparent` keyword interpolates
 * through transparent-black and leaves a muddy grey seam.
 */
export function rgba(hex: string, alpha: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return `rgba(0, 0, 0, ${alpha})`
  const [r, g, b] = rgb
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const body = m[1]!
  const full = body.length === 3 ? body.replace(/./g, (c) => c + c) : body
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}
