import type { LaneId, TimelineEvent } from '../types'

/**
 * The recurring-challenge lanes whose fill and banner are constant per lane, not
 * per occurrence. HoYoverse ships no stable per-cycle art for them — what exists
 * collapses to near-black or a muddy navy under dominantColor — so we bake one
 * color and one self-hosted banner per lane and apply them at render time. The
 * ingest never persists a `color` or `image` on these rows (see stripLaneStyle);
 * every occurrence draws from here instead.
 *
 * Each color is dominantColor() of the banner beside it, exactly how every other
 * lane's fill is derived — so these stay consistent with the rest of the palette.
 */
export const LANE_STYLE = {
  abyss: { color: '#295a93', image: '/images/spiral_abyss.jpg' },
  leyline: { color: '#162847', image: '/images/leyline_overflow.jpg' },
  theater: { color: '#252649', image: '/images/imaginarium_theater.webp' },
  stygian: { color: '#1c1724', image: '/images/stygian_onslaught.jpg' },
} as const satisfies Partial<Record<LaneId, { color: string; image: string }>>

const STYLE = LANE_STYLE as Partial<Record<LaneId, { color: string; image: string }>>

/** The constant color+banner for a lane, or undefined if the lane is data-driven. */
export function laneStyle(lane: LaneId): { color: string; image: string } | undefined {
  return STYLE[lane]
}

/** True for the constant lanes whose color/image live here rather than on the row. */
export function isConstantLane(lane: LaneId): boolean {
  return STYLE[lane] !== undefined
}

/**
 * Render side: stamp a constant lane's baked color and banner onto its row. The
 * stored row carries neither (they were stripped on write), so this is where the
 * lane's look actually comes from. Non-constant rows pass through untouched.
 */
export function withLaneStyle(e: TimelineEvent): TimelineEvent {
  const s = STYLE[e.lane]
  return s ? { ...e, color: s.color, image: s.image } : e
}

/**
 * Ingest side: drop the color/image from constant-lane rows so they are never
 * persisted per occurrence — the look is a lane constant, restored at render by
 * withLaneStyle. Non-constant rows pass through untouched.
 */
export function stripLaneStyle(events: TimelineEvent[]): TimelineEvent[] {
  return events.map((e) => {
    if (!isConstantLane(e.lane)) return e
    const { color: _color, image: _image, ...rest } = e
    // color/image intentionally omitted — supplied from LANE_STYLE at render.
    return rest as TimelineEvent
  })
}
