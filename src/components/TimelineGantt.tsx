import { useEffect, useRef } from 'react'
import { rgba, readableOn } from '../lib/color'
import { cssUrl } from '../lib/css'
import { dayAxis, laneRows } from '../lib/timeline'
import type { Window } from '../lib/timeline'
import { LANES } from '../types'
import type { ServerRegion, TimelineEvent } from '../types'

type Props = {
  events: TimelineEvent[]
  window: Window
  server: ServerRegion
  now: number
  onSelect: (e: TimelineEvent) => void
}

/** How many days fill the viewport, edge to edge (minus the sticky lane-label column). */
const DAYS_PER_SCREEN = 40
const LABEL_W = '9rem'
const AXIS_H = 44
const ROW_H = 48
const ROW_GAP = 6
const LANE_PAD_Y = 12

/** Fixed pixel height of a lane block so the label and track columns stay aligned. */
function laneHeight(rowCount: number): number {
  return 1 + LANE_PAD_Y * 2 + rowCount * ROW_H + (rowCount - 1) * ROW_GAP
}

export function TimelineGantt({ events, window: win, server, now, onSelect }: Props) {
  const span = win.to - win.from
  const spanDays = span / 86_400_000
  const nowPct = ((now - win.from) / span) * 100
  const { days, gridShift } = dayAxis(win, server, now)

  const scrollRef = useRef<HTMLElement>(null)
  const nowRef = useRef<HTMLDivElement>(null)

  // Let the mouse wheel scroll the track sideways while hovering it. React's
  // onWheel is passive, so we attach a native non-passive listener to call
  // preventDefault and stop the page from scrolling instead.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      if (el.scrollWidth <= el.clientWidth) return
      el.scrollLeft += e.deltaY
      e.preventDefault()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // On first render, scroll so "now" sits near the left of the viewport rather
  // than starting at the earliest (long-past) event.
  const didInitialScroll = useRef(false)
  useEffect(() => {
    if (didInitialScroll.current || !nowRef.current) return
    didInitialScroll.current = true
    nowRef.current.scrollIntoView({ inline: 'start', block: 'nearest' })
    scrollRef.current?.scrollBy({ left: -120 })
  }, [])

  const visible = LANES.map((lane) => ({
    lane,
    rows: laneRows(events, lane.id, win, server),
  })).filter((l) => l.rows.length > 0)

  const trackWidth = `calc(var(--day-w) * ${spanDays})`
  // A 1px vertical line at the start of every day cell, phase-aligned to real midnights.
  const dayGrid = {
    backgroundImage:
      'repeating-linear-gradient(to right, var(--color-border) 0 1px, transparent 1px var(--day-w))',
    backgroundPositionX: `calc(var(--day-w) * ${gridShift})`,
  }

  return (
    <section
      ref={scrollRef}
      className="timeline-scroll relative left-1/2 w-screen -translate-x-1/2 overflow-x-auto"
      style={{ ['--day-w' as string]: `calc((100vw - ${LABEL_W}) / ${DAYS_PER_SCREEN})` }}
    >
      <div className="flex">
        {/* Lane labels — sticky so they stay pinned while the track scrolls sideways. */}
        <div className="bg-bg sticky left-0 z-30 w-36 shrink-0">
          <div style={{ height: AXIS_H }} />
          {visible.map(({ lane, rows }) => (
            <div
              key={lane.id}
              style={{ height: laneHeight(rows.length) }}
              className="border-border text-dim border-t px-3 pt-3 text-xs"
            >
              {lane.label}
            </div>
          ))}
        </div>

        {/* Scrolling track. Its width sets the positioning context for the % bars. */}
        <div className="relative shrink-0" style={{ width: trackWidth }}>
          <div className="pointer-events-none absolute inset-0" style={dayGrid} aria-hidden="true" />
          {days
            .filter((d) => d.isMonthStart && d.leftPct >= 0)
            .map((d) => (
              <div
                key={d.instant}
                className="bg-dim/40 pointer-events-none absolute top-0 bottom-0 w-px"
                style={{ left: `${d.leftPct}%` }}
                aria-hidden="true"
              />
            ))}
          {nowPct >= 0 && nowPct <= 100 && (
            <div
              ref={nowRef}
              className="bg-urgent pointer-events-none absolute top-0 bottom-0 z-20 w-px"
              style={{ left: `${nowPct}%` }}
              aria-hidden="true"
            />
          )}

          {/* Day axis: a number under every gridline, the month named once per month. */}
          <div className="relative" style={{ height: AXIS_H }}>
            {days.map((d) => (
              <div
                key={d.instant}
                className="absolute top-0 bottom-0"
                style={{ left: `${d.leftPct}%`, width: 'var(--day-w)' }}
              >
                {d.monthLabel && (
                  <span className="text-gold absolute top-1.5 left-1 text-[10px] font-semibold tracking-wide whitespace-nowrap uppercase">
                    {d.monthLabel}
                  </span>
                )}
                <span
                  className={`absolute bottom-1.5 left-0 w-full text-center text-[10px] tabular-nums ${
                    d.isToday ? 'text-urgent font-semibold' : 'text-dim'
                  }`}
                >
                  {d.day}
                </span>
              </div>
            ))}
          </div>

          {visible.map(({ lane, rows }) => (
            <div
              key={lane.id}
              className="border-border relative flex flex-col gap-1.5 border-t py-3"
              style={{ height: laneHeight(rows.length) }}
            >
              {rows.map((row, i) => (
                <div key={i} className="relative h-12">
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
