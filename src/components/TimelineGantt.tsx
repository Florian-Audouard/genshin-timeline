import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { rgba, readableOn } from '../lib/color'
import { cssUrl } from '../lib/css'
import { dayAxis, laneRows } from '../lib/timeline'
import type { Window } from '../lib/timeline'
import { LANES } from '../types'
import type { ServerRegion, TimelineEvent, TimelineHandle } from '../types'

type Props = {
  events: TimelineEvent[]
  window: Window
  server: ServerRegion
  now: number
  /** How many days fill the viewport, edge to edge (minus the sticky lane-label column). */
  daysPerScreen: number
  /** Multiply the current day count by `factor`; the caller clamps and stores it. */
  onZoom: (factor: number) => void
  onSelect: (e: TimelineEvent) => void
  ref?: React.Ref<TimelineHandle>
}

/**
 * Zoom limits, in days across the viewport. Below `min` a single banner fills the
 * screen; above `max` bars collapse onto their 6px floor and stop being readable.
 */
export const DAYS = { min: 10, max: 365, default: 40, step: 1.5 }

/** Days per wheel notch, as a multiplier: deltaY ≈ ±100 on a mouse → ≈ 1.16×. */
const WHEEL_ZOOM = 0.0015
/** Past this much pointer travel, a press is a pan rather than a click on a bar. */
const DRAG_SLOP = 4
/** Coasting: velocity retained per millisecond, and the speed we give up at. */
const FRICTION = 0.996
const MIN_SPEED = 0.02
/** Longest frame we'll integrate over, so a stalled tab doesn't lurch on resume. */
const MAX_FRAME_MS = 50

const LABEL_W = 144
const AXIS_H = 40
/** Row heights the lanes are allowed to shrink/grow to when fitting the viewport. */
const MIN_ROW_H = 22
const MAX_ROW_H = 48

type Metrics = { rowH: number; gap: number; pad: number }
const ROOMY: Omit<Metrics, 'rowH'> = { gap: 6, pad: 8 }
const TIGHT: Omit<Metrics, 'rowH'> = { gap: 3, pad: 4 }

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

export function clampDays(days: number): number {
  return clamp(days, DAYS.min, DAYS.max)
}

/**
 * Pick row height and lane padding so every lane fits the pane we were given.
 * Tries roomy spacing first, falls back to tight spacing on short viewports, and
 * only lets the pane scroll vertically once even MIN_ROW_H no longer fits.
 */
function fitMetrics(availH: number, laneCount: number, rowCount: number): Metrics {
  if (!availH || !rowCount) return { rowH: MAX_ROW_H, ...ROOMY }
  // The trailing -1 keeps a rounding remainder from tipping the pane into a
  // vertical scrollbar it doesn't need.
  const solve = ({ gap, pad }: Omit<Metrics, 'rowH'>): number =>
    (availH - AXIS_H - laneCount * (1 + 2 * pad) - (rowCount - laneCount) * gap - 1) / rowCount

  const roomy = solve(ROOMY)
  if (roomy >= MIN_ROW_H) return { rowH: clamp(roomy, MIN_ROW_H, MAX_ROW_H), ...ROOMY }
  return { rowH: clamp(solve(TIGHT), MIN_ROW_H, MAX_ROW_H), ...TIGHT }
}

/** Observe the pane's own box so day width and row height follow the real viewport. */
function usePaneSize(ref: React.RefObject<HTMLElement | null>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const box = entry!.contentRect
      setSize({ w: box.width, h: box.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

export function TimelineGantt({
  events,
  window: win,
  server,
  now,
  daysPerScreen,
  onZoom,
  onSelect,
  ref,
}: Props) {
  const span = win.to - win.from
  const spanDays = span / 86_400_000
  const nowPct = ((now - win.from) / span) * 100
  const days = dayAxis(win, server, now)

  const scrollRef = useRef<HTMLElement>(null)
  const { w: paneW, h: paneH } = usePaneSize(scrollRef)

  const dayW = paneW ? (paneW - LABEL_W) / daysPerScreen : 0
  const trackWidth = dayW * spanDays

  // Momentum left over from a flick. Anything that deliberately repositions the
  // pane — zoom, Today — cancels it first, or it would fight for the scroll.
  const coast = useRef(0)
  const stopCoast = useCallback(() => {
    if (coast.current) cancelAnimationFrame(coast.current)
    coast.current = 0
  }, [])
  useEffect(() => stopCoast, [stopCoast])

  // Zooming rewrites the track width underneath a scroll position that meant
  // something, so we record which instant sat under a given screen x and put it
  // back once the new width has been laid out. `lastTrackWidth` is what the
  // fraction was measured against — by the time the effect runs, `trackWidth`
  // is already the new one.
  const anchor = useRef<{ fraction: number; offsetPx: number } | null>(null)
  const lastTrackWidth = useRef(0)

  const zoomAround = useCallback(
    (factor: number, clientX?: number) => {
      const el = scrollRef.current
      if (!el || !lastTrackWidth.current) return
      // A coast still in flight would drag the anchored instant back off the cursor.
      stopCoast()
      const viewW = el.clientWidth - LABEL_W
      // Where in the track's visible strip to pin. The −/+ buttons pass no
      // pointer and so zoom around the middle of what you're already looking at.
      const offsetPx =
        clientX == null
          ? viewW / 2
          : clamp(clientX - el.getBoundingClientRect().left - LABEL_W, 0, viewW)
      anchor.current = { fraction: (el.scrollLeft + offsetPx) / lastTrackWidth.current, offsetPx }
      onZoom(factor)
    },
    [onZoom, stopCoast],
  )

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !trackWidth) return
    const a = anchor.current
    if (a) {
      el.scrollLeft = Math.max(0, a.fraction * trackWidth - a.offsetPx)
      anchor.current = null
    }
    lastTrackWidth.current = trackWidth
  }, [trackWidth])

  // Wheel zooms. React's onWheel is passive, so we attach a native listener to
  // call preventDefault and stop the page from scrolling instead. Sideways
  // intent — trackpad two-finger swipe, shift+wheel — falls through to the
  // pane's own horizontal scrolling.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      e.preventDefault()
      zoomAround(Math.exp(e.deltaY * WHEEL_ZOOM), e.clientX)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAround])

  // Drag pans both axes. Nothing happens until the pointer clears DRAG_SLOP, so
  // a plain press still reaches the bar underneath and opens its detail panel.
  type Drag = {
    x: number; y: number; left: number; top: number; moved: boolean
    // Previous sample plus a smoothed velocity, in px/ms, for the throw.
    px: number; py: number; pt: number; vx: number; vy: number
  }
  const drag = useRef<Drag | null>(null)
  const swallowClick = useRef(false)
  const [grabbing, setGrabbing] = useState(false)

  /** Let go of a flick and keep travelling, shedding speed until it's not worth it. */
  const startCoast = useCallback(
    (vx0: number, vy0: number) => {
      let vx = vx0
      let vy = vy0
      // Seeded from the first frame, not from now: a rAF timestamp is the frame's
      // start, which can predate a clock read taken while handling pointerup.
      let prev = 0
      const step = (t: number) => {
        const el = scrollRef.current
        if (!el) return
        if (!prev) {
          prev = t
          coast.current = requestAnimationFrame(step)
          return
        }
        const dt = Math.min(t - prev, MAX_FRAME_MS)
        prev = t
        const wasLeft = el.scrollLeft
        const wasTop = el.scrollTop
        el.scrollLeft += vx * dt
        el.scrollTop += vy * dt
        const decay = FRICTION ** dt
        vx *= decay
        vy *= decay
        // Give up once we've slowed to a crawl, or when an edge ate the whole
        // delta and we'd otherwise burn frames pushing against it.
        const budged = el.scrollLeft !== wasLeft || el.scrollTop !== wasTop
        coast.current = budged && Math.hypot(vx, vy) >= MIN_SPEED ? requestAnimationFrame(step) : 0
      }
      coast.current = requestAnimationFrame(step)
    },
    [],
  )

  const onPointerDown = (e: React.PointerEvent) => {
    const el = scrollRef.current
    if (e.button !== 0 || !el) return
    stopCoast()
    swallowClick.current = false
    drag.current = {
      x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false,
      px: e.clientX, py: e.clientY, pt: e.timeStamp, vx: 0, vy: 0,
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    const el = scrollRef.current
    if (!d || !el) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved) {
      if (Math.hypot(dx, dy) < DRAG_SLOP) return
      d.moved = true
      setGrabbing(true)
      // Capture so a fast drag that leaves the pane keeps panning it. Throws if
      // the pointer went away between press and move; the pan works regardless.
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        // ignore
      }
    }
    el.scrollLeft = d.left - dx
    el.scrollTop = d.top - dy

    // Smooth the per-sample velocity so one jittery move can't define the throw,
    // while a pause before release still decays it to a stop.
    const dt = e.timeStamp - d.pt
    if (dt > 0) {
      const weight = Math.min(1, dt / 25)
      d.vx += ((e.clientX - d.px) / dt - d.vx) * weight
      d.vy += ((e.clientY - d.py) / dt - d.vy) * weight
      d.px = e.clientX
      d.py = e.clientY
      d.pt = e.timeStamp
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d?.moved) return
    if (scrollRef.current?.hasPointerCapture(e.pointerId)) {
      scrollRef.current.releasePointerCapture(e.pointerId)
    }
    setGrabbing(false)
    // The click that follows this pointerup would open whichever bar the drag
    // happened to finish on. Swallow exactly that one.
    swallowClick.current = true
    // Content travels opposite the pointer, so the throw does too.
    if (Math.hypot(d.vx, d.vy) >= MIN_SPEED) startCoast(-d.vx, -d.vy)
  }

  const onClickCapture = (e: React.MouseEvent) => {
    if (!swallowClick.current) return
    swallowClick.current = false
    e.preventDefault()
    e.stopPropagation()
  }

  // Put "now" a third of the way into the track, so recent history stays visible
  // alongside what's coming. Used for the first paint and by the "Today" button.
  const scrollToNow = useCallback(
    (behavior: ScrollBehavior) => {
      const el = scrollRef.current
      if (!el || !trackWidth) return
      stopCoast()
      const left = (nowPct / 100) * trackWidth - (el.clientWidth - LABEL_W) / 3
      el.scrollTo({ left: Math.max(0, left), behavior })
    },
    [nowPct, trackWidth, stopCoast],
  )
  useImperativeHandle(
    ref,
    () => ({ scrollToNow: () => scrollToNow('smooth'), zoomBy: (f: number) => zoomAround(f) }),
    [scrollToNow, zoomAround],
  )

  // On first render, jump to now rather than starting at the earliest (long-past) event.
  const didInitialScroll = useRef(false)
  useEffect(() => {
    if (didInitialScroll.current || !trackWidth) return
    didInitialScroll.current = true
    scrollToNow('instant')
  }, [trackWidth, scrollToNow])

  const visible = LANES.map((lane) => ({
    lane,
    rows: laneRows(events, lane.id, win, server),
  })).filter((l) => l.rows.length > 0)

  const rowCount = visible.reduce((n, l) => n + l.rows.length, 0)
  const { rowH, gap, pad } = fitMetrics(paneH, visible.length, rowCount)
  const laneHeight = (rows: number): number => 1 + 2 * pad + rows * rowH + (rows - 1) * gap

  return (
    <section
      ref={scrollRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={onClickCapture}
      className={`timeline-scroll relative h-full touch-none overflow-x-auto overflow-y-auto select-none ${
        grabbing ? 'cursor-grabbing' : 'cursor-grab'
      }`}
    >
      {/* w-max: without it the row is only as wide as the viewport and the sticky
          label column runs out of parent to stick to after one screen. */}
      <div className="flex w-max" style={{ visibility: dayW ? undefined : 'hidden' }}>
        {/* Lane labels — sticky so they stay pinned while the track scrolls sideways. */}
        <div className="bg-bg sticky left-0 z-30 shrink-0" style={{ width: LABEL_W }}>
          <div style={{ height: AXIS_H }} />
          {visible.map(({ lane, rows }) => (
            <div
              key={lane.id}
              style={{ height: laneHeight(rows.length), paddingTop: pad }}
              className="border-border text-dim overflow-hidden border-t px-3 text-xs"
            >
              {lane.label}
            </div>
          ))}
        </div>

        {/* Scrolling track. Its width sets the positioning context for the % bars. */}
        <div className="relative shrink-0" style={{ width: trackWidth }}>
          {/* Day axis and grid in one pass: a full-height column per day, carrying a
              hairline on its midnight (brighter on month starts) and its date label
              in the axis strip. Left edges snap to whole pixels — a percentage
              position blurs every line into two half-lit ones. */}
          <div className="pointer-events-none absolute inset-0">
            {days.map((d) => (
              <div
                key={d.instant}
                className={`absolute top-0 bottom-0 border-l ${
                  d.isMonthStart ? 'border-dim/40' : 'border-border'
                }`}
                style={{ left: Math.round((d.leftPct / 100) * trackWidth), width: dayW }}
              >
                <div className="relative" style={{ height: AXIS_H }}>
                  {d.monthLabel && (
                    <span className="text-gold absolute top-1 left-1 text-[10px] font-semibold tracking-wide whitespace-nowrap uppercase">
                      {d.monthLabel}
                    </span>
                  )}
                  <span
                    className={`absolute bottom-1 left-0 w-full text-center text-[10px] tabular-nums ${
                      d.isToday ? 'text-urgent font-semibold' : 'text-dim'
                    }`}
                  >
                    {d.day}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {nowPct >= 0 && nowPct <= 100 && (
            <div
              className="bg-urgent pointer-events-none absolute top-0 bottom-0 z-20 w-px"
              style={{ left: `${nowPct}%` }}
              aria-hidden="true"
            />
          )}

          {/* Reserves the height the (absolutely placed) day labels sit in. */}
          <div style={{ height: AXIS_H }} />

          {visible.map(({ lane, rows }) => (
            <div
              key={lane.id}
              className="border-border relative flex flex-col border-t"
              style={{ height: laneHeight(rows.length), paddingBlock: pad, gap }}
            >
              {rows.map((row, i) => (
                <div key={i} className="relative" style={{ height: rowH }}>
                  {row.map(({ event, leftPct, widthPct }) => {
                    // Constant lanes get their banner from LANE_STYLE (stamped in
                    // useTimeline); every other row carries its own ingest art.
                    const img = event.image
                    return (
                      <button
                        key={event.id}
                        onClick={() => onSelect(event)}
                        className="group @container absolute inset-y-0 cursor-pointer overflow-hidden rounded-lg text-left ring-1 ring-white/10 transition hover:brightness-110 hover:ring-white/25"
                        style={{
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          // Keep zero-length/tiny events clickable without lying about
                          // duration — a % floor would scale with the multi-year span.
                          minWidth: 6,
                          background: event.color,
                          // Six years of bars: skip painting offscreen ones and defer
                          // their banner-image fetches until they scroll near.
                          contentVisibility: 'auto',
                        }}
                        title={event.name}
                      >
                        {/* Banner reveals on the right and dissolves into the lane colour;
                            it hides itself on bars too narrow to fit the name (@container). */}
                        {img && (
                          <>
                            <div
                              className="absolute inset-y-0 right-0 hidden w-[180px] bg-cover @min-[250px]:block"
                              style={{ backgroundImage: cssUrl(img), backgroundPosition: '50% 28%' }}
                              aria-hidden="true"
                            />
                            <div
                              className="absolute inset-y-0 right-0 hidden w-[180px] @min-[250px]:block"
                              style={{ background: `linear-gradient(to right, ${rgba(event.color, 1)} 0%, ${rgba(event.color, 0)} 60%)` }}
                              aria-hidden="true"
                            />
                          </>
                        )}
                        <span className="absolute inset-y-0 right-0 left-0 flex items-center px-3 @min-[250px]:right-[108px]">
                          <span
                            className="truncate text-xs font-medium"
                            style={{ color: readableOn(event.color) }}
                          >
                            {event.name}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
