/**
 * Clicks counted in a row.
 *
 * A click stream is a list of timestamps and the only question worth asking of one
 * is where it stops being a run: three fast taps are one gesture, and the same
 * three taps spread over a minute are three gestures. The clock comes in as an
 * argument so the rule can be tested without a clock, and a run that is already
 * long enough resets itself so a fourth click starts over rather than opening
 * something on every click after that.
 */

export type ClickSequence = { count: number; last: number }

/** How many clicks in a row open something, and the longest gap that still counts. */
export const doubleClicks = 2
export const doubleClickWindowMs = 500

/** An empty run, at a time before any run could have started. */
export function newSequence(): ClickSequence {
  return { count: 0, last: -1 }
}

/**
 * One click, either extending the run or starting a new one. `windowMs` is the
 * longest gap that still counts as "in a row".
 */
export function advanceClicks(sequence: ClickSequence, now: number, windowMs: number): ClickSequence {
  if (sequence.last >= 0 && now - sequence.last <= windowMs) {
    return { count: sequence.count + 1, last: now }
  }
  return { count: 1, last: now }
}

/** True once the run is long enough, and the run is handed back empty. */
export function takeRun(sequence: ClickSequence, required: number): { reached: boolean; sequence: ClickSequence } {
  if (sequence.count < required) return { reached: false, sequence }
  return { reached: true, sequence: newSequence() }
}
