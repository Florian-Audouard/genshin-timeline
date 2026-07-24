import { describe, expect, it } from 'vitest'
import { LANE_STYLE, isConstantLane, stripLaneStyle, withLaneStyle } from './lanes'
import type { TimelineEvent } from '../types'

const ev = (over: Partial<TimelineEvent> = {}): TimelineEvent => ({
  id: 'e@2026-01-01',
  name: 'Event',
  lane: 'event',
  start: '2026-01-01 00:00:00',
  end: null,
  clock: 'server',
  color: '#4cc2f1',
  source: 'calendar',
  ...over,
})

describe('isConstantLane', () => {
  it('is true for the four recurring challenges, false otherwise', () => {
    for (const lane of ['abyss', 'leyline', 'theater', 'stygian'] as const) {
      expect(isConstantLane(lane)).toBe(true)
    }
    expect(isConstantLane('event')).toBe(false)
    expect(isConstantLane('character-wish')).toBe(false)
    expect(isConstantLane('battlepass')).toBe(false)
  })
})

describe('withLaneStyle', () => {
  it('stamps the baked color and banner onto a constant lane, overriding any stored values', () => {
    const out = withLaneStyle(ev({ lane: 'stygian', color: '#ff6640', image: 'http://cdn/old.jpg' }))
    expect(out.color).toBe(LANE_STYLE.stygian.color)
    expect(out.image).toBe(LANE_STYLE.stygian.image)
  })

  it('supplies color+image even when the stored row carries neither', () => {
    const { color: _c, image: _i, ...bare } = ev({ lane: 'abyss' })
    const out = withLaneStyle(bare as TimelineEvent)
    expect(out.color).toBe(LANE_STYLE.abyss.color)
    expect(out.image).toBe(LANE_STYLE.abyss.image)
  })

  it('leaves a data-driven lane untouched', () => {
    const input = ev({ lane: 'event', color: '#123456', image: 'http://cdn/real.jpg' })
    expect(withLaneStyle(input)).toEqual(input)
  })
})

describe('stripLaneStyle', () => {
  it('drops color and image from constant-lane rows', () => {
    const [out] = stripLaneStyle([ev({ lane: 'leyline', color: '#162847', image: 'http://cdn/x.jpg' })])
    expect(out).not.toHaveProperty('color')
    expect(out).not.toHaveProperty('image')
    expect(out!.lane).toBe('leyline')
    expect(out!.name).toBe('Event')
  })

  it('keeps color and image on data-driven rows', () => {
    const input = ev({ lane: 'event', color: '#123456', image: 'http://cdn/real.jpg' })
    expect(stripLaneStyle([input])).toEqual([input])
  })

  it('round-trips: strip then restore yields the baked constant', () => {
    const stripped = stripLaneStyle([ev({ lane: 'theater', color: '#ffffff', image: 'http://cdn/x.jpg' })])
    const restored = withLaneStyle(stripped[0]!)
    expect(restored.color).toBe(LANE_STYLE.theater.color)
    expect(restored.image).toBe(LANE_STYLE.theater.image)
  })
})
