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
  onSelect: (e: TimelineEvent) => void
  ref?: React.Ref<TimelineHandle>
}

/** How many days fill the viewport, edge to edge (minus the sticky lane-label column). */
const DAYS_PER_SCREEN = 40
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

export function TimelineGantt({ events, window: win, server, now, onSelect, ref }: Props) {
  const span = win.to - win.from
  const spanDays = span / 86_400_000
  const nowPct = ((now - win.from) / span) * 100
  const days = dayAxis(win, server, now)

  const scrollRef = useRef<HTMLElement>(null)
  const { w: paneW, h: paneH } = usePaneSize(scrollRef)

  // Let the mouse wheel scroll the track sideways while hovering it. React's
  // onWheel is passive, so we attach a native non-passive listener to call
  // preventDefault and stop the page from scrolling instead. When the lanes are
  // taller than the pane, vertical wheel keeps its natural meaning.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      if (el.scrollHeight > el.clientHeight) return
      if (el.scrollWidth <= el.clientWidth) return
      el.scrollLeft += e.deltaY
      e.preventDefault()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const dayW = paneW ? (paneW - LABEL_W) / DAYS_PER_SCREEN : 0
  const trackWidth = dayW * spanDays

  // Put "now" a third of the way into the track, so recent history stays visible
  // alongside what's coming. Used for the first paint and by the "Today" button.
  const scrollToNow = useCallback(
    (behavior: ScrollBehavior) => {
      const el = scrollRef.current
      if (!el || !trackWidth) return
      const left = (nowPct / 100) * trackWidth - (el.clientWidth - LABEL_W) / 3
      el.scrollTo({ left: Math.max(0, left), behavior })
    },
    [nowPct, trackWidth],
  )
  useImperativeHandle(ref, () => ({ scrollToNow: () => scrollToNow('smooth') }), [scrollToNow])

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
      className="timeline-scroll relative h-full overflow-x-auto overflow-y-auto"
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
                        className="group @container absolute inset-y-0 overflow-hidden rounded-lg text-left ring-1 ring-white/10 transition hover:brightness-110 hover:ring-white/25"
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
