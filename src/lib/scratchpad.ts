/**
 * Geometry and storage shape for the floating scratchpads.
 *
 * Everything here is pure so the drag, resize and discard rules can be tested
 * without a browser. The script owns the DOM and only feeds this module
 * numbers.
 *
 * What is written is split in two. What a sheet says travels between tabs, so
 * the same note follows you from one page to the next. Where it sits and whether
 * it is folded belong to the window looking at it, so those are keyed by tab and
 * a second tab opens the same notes folded in the corner.
 */

import { storageKeys } from './storage-schema.ts'

export const scratchpadStorageKey = storageKeys.scratchpad

/** Distance kept between the note and the viewport edges that must stay usable. */
export const scratchpadViewportMargin = 12

export const scratchpadMinWidth = 240
export const scratchpadMinHeight = 180

/**
 * Ceiling for a stretched note. Nothing forces the body to stay on screen, so
 * this is the only thing between a careless drag and a note taller than the
 * whole site.
 */
export const scratchpadMaxHeight = 1200

export const scratchpadDefaultWidth = 360
export const scratchpadDefaultHeight = 300

/**
 * Distance from the bottom of the viewport up to the top of the pull tab, made
 * of its inset plus its height. Mirrors `.scratchpad-dock` in global.css; the
 * script measures the real tab instead whenever it can, so a mismatch here
 * only affects the very first open.
 */
export const scratchpadDockReserve = 126

/**
 * How much of a note the viewport has to keep visible at the top. The body is
 * free to hang below the fold, the title bar is not: it carries the drag
 * handle, so a note whose head left the screen could not be moved back.
 */
export const scratchpadHeadReserve = 40

/** How many sheets can be stacked in the corner before the button gives up. */
export const scratchpadMaxNotes = 12

/** Offset per already-open note, so a fresh sheet never lands on top of one. */
export const scratchpadCascadeStep = 18

/** Half-thickness of the invisible grab strip around each resize handle. */
export const scratchpadHandleHitSize = 10

export const resizeHandles = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const

export type ResizeHandle = (typeof resizeHandles)[number]

export type Point = { x: number; y: number }

export type ViewportBox = { width: number; height: number }

export type ScratchpadBox = { x: number; y: number; width: number; height: number }

export type ScratchpadNote = {
  id: string
  /** Blank means "use the wordless default", so a sheet can stay untitled. */
  title: string
  text: string
  /** Per tab: kept in session storage, so another window places its own copy. */
  box: ScratchpadBox
  /** Per tab, for the same reason as the box. */
  collapsed: boolean
  monospace: boolean
}

/** The part of a sheet every tab agrees on: what it says, not where it sits. */
export type ScratchpadContent = {
  id: string
  title: string
  text: string
  monospace: boolean
}

/** What one tab remembers about one sheet. */
export type ScratchpadView = {
  box: ScratchpadBox
  collapsed: boolean
}

export type ScratchpadState = {
  notes: ScratchpadContent[]
}

export type ScratchpadViewState = {
  views: Record<string, ScratchpadView>
}

/** Storage ids end up in DOM ids, so only plain word characters are accepted. */
const noteIdPattern = /^[A-Za-z0-9_-]{1,40}$/

function clamp(value: number, min: number, max: number) {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Lowest the top of a note may sit, so its title bar is always grabbable. */
function headLimit(viewport: ViewportBox, margin = scratchpadViewportMargin) {
  return Math.max(margin, viewport.height - margin - scratchpadHeadReserve)
}

/**
 * Keeps a box usable on the current viewport: no smaller than the minimum, no
 * wider than the screen, and anchored so the title bar stays on screen. The
 * bottom is deliberately free, which is what lets a long note run off the
 * bottom of the window while its head stays put. A box saved on a wide monitor
 * therefore lands somewhere sensible on a phone.
 */
export function clampBox(
  box: ScratchpadBox,
  viewport: ViewportBox,
  margin = scratchpadViewportMargin
): ScratchpadBox {
  const width = clamp(
    box.width,
    scratchpadMinWidth,
    Math.max(scratchpadMinWidth, viewport.width - margin * 2)
  )
  const height = clamp(box.height, scratchpadMinHeight, scratchpadMaxHeight)
  return {
    width,
    height,
    x: clamp(box.x, margin, viewport.width - margin - width),
    y: clamp(box.y, margin, headLimit(viewport, margin))
  }
}

/** Bottom-right resting place, tucked above the pull tab. */
export function defaultScratchpadBox(
  viewport: ViewportBox,
  dockTop = viewport.height - scratchpadDockReserve,
  cascade = 0
): ScratchpadBox {
  const step = Math.max(0, cascade) * scratchpadCascadeStep
  return clampBox(
    {
      width: scratchpadDefaultWidth,
      height: scratchpadDefaultHeight,
      x: viewport.width - scratchpadViewportMargin - scratchpadDefaultWidth - step,
      y: dockTop - scratchpadViewportMargin - scratchpadDefaultHeight - step
    },
    viewport
  )
}

/** A fresh sheet: untitled, empty, monospaced and open. */
export function createNote(
  id: string,
  viewport: ViewportBox,
  dockTop?: number,
  cascade = 0
): ScratchpadNote {
  return {
    id,
    title: '',
    text: '',
    box: defaultScratchpadBox(viewport, dockTop, cascade),
    collapsed: false,
    monospace: true
  }
}

/** What the note is called in the stack and to a screen reader. */
export function noteLabel(note: ScratchpadNote, fallback: string): string {
  const title = note.title.trim()
  return title || fallback
}

export function moveBox(box: ScratchpadBox, dx: number, dy: number): ScratchpadBox {
  return { ...box, x: box.x + dx, y: box.y + dy }
}

/**
 * Bound for a box in mid-drag. The top edge stops with the title bar still on
 * screen, the left and right edges hold so the sheet cannot be lost sideways,
 * and the bottom is left free: a long sheet hangs off it, which is the whole
 * point of letting a note grow downwards.
 */
export function clampDragBox(
  box: ScratchpadBox,
  viewport: ViewportBox,
  margin = scratchpadViewportMargin
): ScratchpadBox {
  return {
    ...box,
    x: clamp(box.x, margin, Math.max(margin, viewport.width - margin - box.width)),
    y: clamp(box.y, margin, headLimit(viewport, margin))
  }
}

/**
 * Applies a drag delta to one handle. The opposite edge stays put, so a corner
 * resize grows the box the way a user expects, and the moving edge stops at the
 * viewport margin instead of pushing the note off screen.
 */
export function resizeBox(
  box: ScratchpadBox,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  viewport: ViewportBox,
  margin = scratchpadViewportMargin
): ScratchpadBox {
  const right = box.x + box.width
  const bottom = box.y + box.height
  let { x, y, width, height } = box

  if (handle.includes('e')) {
    width = clamp(width + dx, scratchpadMinWidth, Math.max(scratchpadMinWidth, viewport.width - margin - x))
  }
  if (handle.includes('w')) {
    width = clamp(width - dx, scratchpadMinWidth, Math.max(scratchpadMinWidth, right - margin))
    x = right - width
  }
  if (handle.includes('s')) {
    height = clamp(height + dy, scratchpadMinHeight, scratchpadMaxHeight)
  }
  if (handle.includes('n')) {
    height = clamp(height - dy, scratchpadMinHeight, Math.max(scratchpadMinHeight, Math.min(scratchpadMaxHeight, bottom - margin)))
    y = bottom - height
  }

  return { x, y, width, height }
}

/**
 * Which grab strip a point sits in, or null when it is over the note body.
 * Corners win over edges so a diagonal drag never turns into a straight one.
 */
export function hitResizeHandle(
  box: ScratchpadBox,
  point: Point,
  hit = scratchpadHandleHitSize
): ResizeHandle | null {
  const right = box.x + box.width
  const bottom = box.y + box.height
  const west = point.y >= box.y - hit && point.y <= bottom + hit && point.x >= box.x - hit && point.x <= box.x + hit
  const east = point.y >= box.y - hit && point.y <= bottom + hit && point.x >= right - hit && point.x <= right + hit
  const north = point.x >= box.x - hit && point.x <= right + hit && point.y >= box.y - hit && point.y <= box.y + hit
  const south = point.x >= box.x - hit && point.x <= right + hit && point.y >= bottom - hit && point.y <= bottom + hit
  const inX = point.x >= box.x + hit && point.x <= right - hit
  const inY = point.y >= box.y + hit && point.y <= bottom - hit

  if (north && west) return 'nw'
  if (north && east) return 'ne'
  if (south && west) return 'sw'
  if (south && east) return 'se'
  if (north && inX) return 'n'
  if (south && inX) return 's'
  if (west && inY) return 'w'
  if (east && inY) return 'e'
  return null
}

/** Replaces a sheet with the same id, or appends it when it is new. */
export function withNote(notes: ScratchpadNote[], note: ScratchpadNote): ScratchpadNote[] {
  const index = notes.findIndex((item) => item.id === note.id)
  if (index === -1) return [...notes, note]
  const next = notes.slice()
  next[index] = note
  return next
}

export function withoutNote(notes: ScratchpadNote[], id: string): ScratchpadNote[] {
  return notes.filter((note) => note.id !== id)
}

/* ------------------------------------------------------- the two halves of a sheet */

/** Strips the per-tab fields, leaving what is worth writing for everyone. */
export function contentOf(notes: ScratchpadNote[]): ScratchpadContent[] {
  return notes.map(({ id, title, text, monospace }) => ({ id, title, text, monospace }))
}

/** The per-tab half, keyed by note id, ready to be written or compared. */
export function viewOf(notes: ScratchpadNote[]): Record<string, ScratchpadView> {
  const views: Record<string, ScratchpadView> = {}
  for (const note of notes) {
    views[note.id] = { box: { ...note.box }, collapsed: note.collapsed }
  }
  return views
}

/**
 * Puts the shared words back on this tab's own placement of each sheet. A note
 * this tab has never seen gets the corner in the cascade and stays folded, which
 * is what a freshly opened tab is meant to show: the same writing, none of the
 * other window's furniture.
 */
export function joinStores(
  content: ScratchpadContent[],
  views: Record<string, ScratchpadView>,
  viewport: ViewportBox,
  dockTop?: number
): ScratchpadNote[] {
  return content.map((entry, index) => {
    const view = views[entry.id]
    return {
      ...entry,
      box: view ? { ...view.box } : defaultScratchpadBox(viewport, dockTop, index),
      collapsed: view ? view.collapsed : true
    }
  })
}

function readBox(value: unknown): ScratchpadBox | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const box = value as Partial<ScratchpadBox>
  if (!finite(box.x) || !finite(box.y) || !finite(box.width) || !finite(box.height)) return null
  return { x: box.x, y: box.y, width: box.width, height: box.height }
}

function readContent(value: unknown): ScratchpadContent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const note = value as Partial<ScratchpadNote>
  if (typeof note.id !== 'string' || !noteIdPattern.test(note.id)) return null
  if (typeof note.text !== 'string') return null
  return {
    id: note.id,
    title: typeof note.title === 'string' ? note.title : '',
    text: note.text,
    monospace: note.monospace !== false
  }
}

function readView(value: unknown): ScratchpadView | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const view = value as { box?: unknown; collapsed?: unknown }
  const box = readBox(view.box)
  if (!box) return null
  return { box, collapsed: view.collapsed === true }
}

/**
 * Reads the shared store. A single sheet written before the stack existed is
 * migrated into a one-sheet state, and a sheet with a damaged field is dropped
 * rather than taking the whole state down with it. A box or a collapsed flag
 * left over from an older build is ignored: those live in the other store now.
 *
 * The stack is capped here as well as when a note is added. A backup is a file
 * someone can edit, and every sheet past the cap would be turned into a floating
 * panel on every page of the site — a tab that cannot be used and that clearing
 * the store is the only way out of.
 */
export function parseScratchpadState(raw: string | null | undefined): ScratchpadState | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  const record = parsed as { notes?: unknown; text?: unknown }
  if (Array.isArray(record.notes)) {
    const seen = new Set<string>()
    const notes: ScratchpadContent[] = []
    for (const entry of record.notes) {
      if (notes.length >= scratchpadMaxNotes) break
      const note = readContent(entry)
      if (!note || seen.has(note.id)) continue
      seen.add(note.id)
      notes.push(note)
    }
    return { notes }
  }

  // The single-sheet shape: { open, text, box }.
  if (typeof record.text !== 'string') return null
  return { notes: [{ id: 'note-1', title: '', text: record.text, monospace: true }] }
}

/** Reads the per-tab store, skipping entries a later build no longer understands. */
export function parseScratchpadView(raw: string | null | undefined): Record<string, ScratchpadView> {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const record = parsed as { views?: unknown }
  if (!record.views || typeof record.views !== 'object' || Array.isArray(record.views)) return {}
  const views: Record<string, ScratchpadView> = {}
  for (const [id, value] of Object.entries(record.views as Record<string, unknown>)) {
    if (!noteIdPattern.test(id)) continue
    const view = readView(value)
    if (view) views[id] = view
  }
  return views
}

export function serializeScratchpadState(state: ScratchpadState): string {
  return JSON.stringify({
    notes: state.notes.map(({ id, title, text, monospace }) => ({ id, title, text, monospace }))
  })
}

export function serializeScratchpadView(state: ScratchpadViewState): string {
  const views: Record<string, { box: ScratchpadBox; collapsed: boolean }> = {}
  for (const [id, view] of Object.entries(state.views)) {
    const box = view.box
    views[id] = { box: { x: box.x, y: box.y, width: box.width, height: box.height }, collapsed: view.collapsed }
  }
  return JSON.stringify({ views })
}
