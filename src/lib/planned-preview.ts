import { advanceClicks, newSequence, takeRun, type ClickSequence } from './click-sequence.ts'

/**
 * A tool that is still being built shows a plain "开发中" label and does nothing
 * when it is clicked, because a half-finished tool has no business being one
 * stray click away. Three clicks in a row is a deliberate act, so that is what
 * opens the preview: the badge is never a link, and the sequence is short enough
 * that a reader has to mean it.
 */

/** How many clicks in a row open the tool. */
export const previewClicks = 3

/** The longest gap between two clicks that still counts as "in a row". */
export const previewWindowMs = 1200

/** A click either extends the run or starts a new one. */
export function advancePreviewClicks(sequence: ClickSequence, now: number, windowMs = previewWindowMs): ClickSequence {
  return advanceClicks(sequence, now, windowMs)
}

/** Whether the run is long enough to open, and the run to start over from. */
export function takePreviewRun(sequence: ClickSequence): { reached: boolean; sequence: ClickSequence } {
  return takeRun(sequence, previewClicks)
}

export { newSequence }
export type { ClickSequence }
