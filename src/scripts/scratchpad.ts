import { translateNow } from '../i18n/client'
import { readValue, storage, viewStorageKey, whenStorageReady, writeValue } from '../lib/storage'
import {
  clampBox,
  clampDragBox,
  contentOf,
  createNote,
  joinStores,
  moveBox,
  noteLabel,
  parseScratchpadState,
  parseScratchpadView,
  resizeBox,
  scratchpadDockReserve,
  scratchpadMaxNotes,
  scratchpadStorageKey,
  serializeScratchpadState,
  serializeScratchpadView,
  viewOf,
  withNote,
  withoutNote,
  type ResizeHandle,
  type ScratchpadBox,
  type ScratchpadNote,
  type ViewportBox
} from '../lib/scratchpad'
import { showToast } from './site'
import { formatNumber } from './tool-panel'

/** Debounce for the autosave while typing; a gesture or a swap saves at once. */
const saveDelay = 400

/** Fallback for the fold-away transition when no transitionend ever arrives. */
const closeTimeout = 420

/** Matches the discard animation, so the sheet is only dropped once it is away. */
const discardDelay = 280

/** How long the bin stays lit, waiting for the second click that does it. */
const primeTimeout = 1600

/**
 * How far the pointer has to travel before a press turns into a drag. The title
 * is an input, so a plain click has to reach it untouched and place a caret.
 */
const dragThreshold = 5

type Panel = {
  root: HTMLElement
  title: HTMLInputElement
  count: HTMLElement
  mono: HTMLButtonElement
  destroy: HTMLButtonElement
  fold: HTMLButtonElement
  text: HTMLTextAreaElement
  closeTimer: number | undefined
  primeTimer: number | undefined
}

type Gesture = {
  pointerId: number
  startX: number
  startY: number
  startBox: ScratchpadBox
  id: string
  /** Null while the sheet itself is being dragged. */
  handle: ResizeHandle | null
  surface: HTMLElement
  moved: boolean
}

let layer: HTMLElement | null = null
let notesHost: HTMLElement | null = null
let stackHost: HTMLElement | null = null
let dock: HTMLElement | null = null
let dockButton: HTMLButtonElement | null = null
let template: HTMLTemplateElement | null = null
let notes: ScratchpadNote[] = []
let panels = new Map<string, Panel>()
let gesture: Gesture | null = null
let saveTimer: number | undefined
let discardTimers = new Map<string, number>()
let stackSignature = ''
let stateLoaded = false
let wired = false
let noteSeq = 0
let boundButtons = new WeakSet<Element>()

function viewport(): ViewportBox {
  return { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }
}

/** Top edge of the pull tab and its stack, so a sheet can come to rest above them. */
function dockTop(): number {
  const rect = dock?.getBoundingClientRect()
  return rect && rect.height > 0 ? rect.top : viewport().height - scratchpadDockReserve
}

function noteById(id: string): ScratchpadNote | undefined {
  return notes.find((note) => note.id === id)
}

function patchNote(id: string, patch: Partial<ScratchpadNote>) {
  const note = noteById(id)
  if (!note) return
  notes = withNote(notes, { ...note, ...patch })
}

function nextId(): string {
  noteSeq += 1
  return `note-${Date.now().toString(36)}-${noteSeq.toString(36)}`
}

/** The words, which every tab shares. */
function readShared(): string | undefined {
  return readValue(scratchpadStorageKey)
}

/**
 * Where this tab left its sheets. The record is keyed by the tab, so a second
 * tab gets the words without inheriting the first one's arrangement.
 */
function readViews() {
  return parseScratchpadView(readValue(viewStorageKey()))
}

function writeState() {
  writeValue(scratchpadStorageKey, serializeScratchpadState({ notes: contentOf(notes) }))
  writeValue(viewStorageKey(), serializeScratchpadView({ views: viewOf(notes) }))
}

function scheduleSave() {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(writeState, saveDelay)
}

function saveNow() {
  window.clearTimeout(saveTimer)
  saveTimer = undefined
  writeState()
}

function applyBox(id: string, next: ScratchpadBox) {
  const note = noteById(id)
  if (!note) return
  const box = clampBox(next, viewport())
  patchNote(id, { box })
  const panel = panels.get(id)
  if (!panel) return
  panel.root.style.left = `${box.x}px`
  panel.root.style.top = `${box.y}px`
  panel.root.style.width = `${box.width}px`
  panel.root.style.height = `${box.height}px`
}

function clampAll() {
  const view = viewport()
  for (const note of notes) note.box = clampBox(note.box, view)
}

/** One frame without transitions, so a restore or a swap is not read as a new note. */
function withoutMotion(run: () => void) {
  if (!layer) {
    run()
    return
  }
  layer.classList.add('is-instant')
  run()
  void layer.offsetWidth
  layer.classList.remove('is-instant')
}

/**
 * astro-icon inlines one symbol per icon and points every repeat at the first
 * definition it rendered, wherever that happened to be. A cloned sheet would
 * then either drag a copy of a symbol along with it, or — when the page already
 * used the same icon somewhere else — point at a definition that the next
 * navigation throws away, leaving the sheet with a blank button. So the layer
 * takes ownership: one definition per icon, hoisted into a hidden sprite inside
 * the layer, renamed with an `sp-` prefix so it cannot collide with the page,
 * and every `<use>` in the layer and in the template is retargeted at it.
 */
function collectIcons() {
  if (!layer || !template) return
  let sprite = layer.querySelector<SVGSVGElement>('svg.svg-sprite')
  if (!sprite) {
    sprite = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    sprite.setAttribute('class', 'svg-sprite')
    sprite.setAttribute('aria-hidden', 'true')
    layer.prepend(sprite)
  }

  const inlined = [...layer.querySelectorAll('svg:not(.svg-sprite) symbol'), ...template.content.querySelectorAll('symbol')]
  const uses = [...layer.querySelectorAll('use'), ...template.content.querySelectorAll('use')]

  // The layer's own definition wins; a page-level one is only borrowed, because
  // a page is free to swap it out from under a sheet that outlives it.
  const source = new Map<string, Element>()
  for (const symbol of inlined) {
    if (symbol.id) source.set(symbol.id, source.get(symbol.id) ?? symbol)
  }
  for (const use of uses) {
    const id = (use.getAttribute('href') ?? '').replace(/^#/, '')
    if (!id || source.has(id)) continue
    const borrowed = document.querySelector(`symbol#${CSS.escape(id)}`)
    if (borrowed) source.set(id, borrowed)
  }
  if (source.size === 0) return

  for (const [id, symbol] of source) {
    const own = `sp-${id.replace(/[^A-Za-z0-9]+/g, '-')}`
    if (!sprite.querySelector(`symbol#${CSS.escape(own)}`)) {
      const copy = symbol.cloneNode(true) as SVGElement
      copy.id = own
      sprite.append(copy)
    }
    for (const use of uses) {
      if ((use.getAttribute('href') ?? '').replace(/^#/, '') !== id) continue
      use.setAttribute('href', `#${own}`)
    }
  }
  // From here on the sprite is the only definition: an inlined copy would just
  // be a second element answering to the same id.
  for (const symbol of inlined) symbol.remove()
}

/** Later sheets paint above earlier ones, so the note under the cursor wins. */
function bringToFront(id: string) {
  const panel = panels.get(id)
  if (!panel || !notesHost) return
  if (notesHost.lastElementChild === panel.root) return
  notesHost.append(panel.root)
}

function createPanel(note: ScratchpadNote): Panel | null {
  if (!template || !notesHost) return null
  const root = template.content.querySelector<HTMLElement>('[data-scratchpad="panel"]')?.cloneNode(true) as HTMLElement | null
  if (!root) return null
  const pick = (role: string) => root.querySelector<HTMLElement>(`[data-scratchpad="${role}"]`)

  const panel: Panel = {
    root,
    title: pick('title') as HTMLInputElement,
    count: pick('count') as HTMLElement,
    mono: pick('mono') as HTMLButtonElement,
    destroy: pick('destroy') as HTMLButtonElement,
    fold: pick('fold') as HTMLButtonElement,
    text: pick('text') as HTMLTextAreaElement,
    closeTimer: undefined,
    primeTimer: undefined
  }
  root.dataset.noteId = note.id
  root.id = `scratchpad-${note.id}`
  notesHost.append(root)

  const head = root.querySelector<HTMLElement>('[data-scratchpad="head"]')
  head?.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || (event.target as HTMLElement | null)?.closest('button')) return
    bringToFront(note.id)
    startGesture(event, note.id, null, root, dragThreshold)
  })
  root.querySelectorAll<HTMLElement>('.scratchpad-resize').forEach((handle) => {
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      const name = (event.currentTarget as HTMLElement).dataset.resize as ResizeHandle | undefined
      if (!name) return
      bringToFront(note.id)
      startGesture(event, note.id, name, handle, 0)
    })
  })
  root.addEventListener('transitionend', (event) => {
    if (event.target !== root || event.propertyName !== 'opacity' || panel.closeTimer === undefined) return
    window.clearTimeout(panel.closeTimer)
    panel.closeTimer = undefined
    if (noteById(note.id)?.collapsed) root.hidden = true
  })
  root.addEventListener('focusin', () => bringToFront(note.id))

  panel.text.addEventListener('input', () => {
    patchNote(note.id, { text: panel.text.value })
    panel.count.textContent = formatNumber(panel.text.value.length)
    scheduleSave()
  })
  panel.text.addEventListener('blur', saveNow)
  panel.title.addEventListener('input', () => {
    patchNote(note.id, { title: panel.title.value })
    syncLabel(note.id)
    scheduleSave()
  })
  panel.title.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      // A named sheet is meant to be written next, so the caret goes there.
      panel.title.blur()
      panel.text.focus()
      panel.text.setSelectionRange(panel.text.value.length, panel.text.value.length)
      return
    }
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    const title = noteById(note.id)?.title ?? ''
    panel.title.value = title
    panel.title.blur()
  })
  panel.title.addEventListener('blur', saveNow)
  panel.mono.addEventListener('click', () => {
    const current = noteById(note.id)
    if (!current) return
    patchNote(note.id, { monospace: !current.monospace })
    renderNote(note.id)
    saveNow()
  })
  root.querySelector('[data-scratchpad="clear"]')?.addEventListener('click', () => {
    if (!noteById(note.id)) return
    patchNote(note.id, { text: '' })
    renderNote(note.id)
    saveNow()
    showToast(translateNow('scratchpad.cleared'))
    panel.text.focus()
  })
  panel.fold.addEventListener('click', () => fold(note.id))

  // Throwing a sheet away is the one thing here that cannot be undone, so the
  // bin in the title bar wants two clicks: the first one says so, the second
  // one does it. A keyboard gets the same two steps from Enter or Space.
  const primeDestroy = () => {
    window.clearTimeout(panel.primeTimer)
    panel.destroy.classList.add('is-primed')
    panel.primeTimer = window.setTimeout(() => {
      panel.primeTimer = undefined
      panel.destroy.classList.remove('is-primed')
    }, primeTimeout)
  }
  panel.destroy.addEventListener('click', primeDestroy)
  panel.destroy.addEventListener('dblclick', () => discardNote(note.id))
  panel.destroy.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    if (panel.destroy.classList.contains('is-primed')) discardNote(note.id)
    else primeDestroy()
  })

  panels.set(note.id, panel)
  return panel
}

/**
 * The sheet is named after whatever the title says, so a screen reader hears the
 * same thing the tab in the stack shows, including while it is being typed.
 */
function syncLabel(id: string) {
  const note = noteById(id)
  const panel = panels.get(id)
  if (!note || !panel) return
  panel.root.setAttribute('aria-label', noteLabel(note, translateNow('scratchpad.title')))
}

function renderNote(id: string) {
  const note = noteById(id)
  if (!note) return
  const panel = panels.get(id) ?? createPanel(note)
  if (!panel) return
  applyBox(id, note.box)
  panel.root.classList.toggle('is-mono', note.monospace)
  syncLabel(id)
  panel.mono.classList.toggle('is-on', note.monospace)
  panel.mono.setAttribute('aria-pressed', String(note.monospace))
  if (panel.title.value !== note.title) panel.title.value = note.title
  if (panel.text.value !== note.text) panel.text.value = note.text
  panel.count.textContent = formatNumber(note.text.length)
}

/** Folds a sheet away or brings it back, apart from the animation itself. */
function applyVisibility(id: string) {
  const note = noteById(id)
  const panel = panels.get(id)
  if (!note || !panel) return
  panel.root.hidden = note.collapsed
  panel.root.classList.toggle('is-open', !note.collapsed)
  panel.fold.setAttribute('aria-expanded', String(!note.collapsed))
}

function renderStack() {
  if (!stackHost) return
  const folded = notes.filter((note) => note.collapsed)
  // An empty stack is taken out of the layout, otherwise its gap in the dock
  // would push the pull tab out from under the sheet resting on it.
  if (stackHost) stackHost.hidden = folded.length === 0
  const signature = folded.map((note) => `${note.id}:${noteLabel(note, '')}:${note.text.length}`).join('|')
  if (signature === stackSignature) return
  stackSignature = signature
  stackHost.replaceChildren()

  // Newest first, so the sheet just folded away sits closest to the button.
  for (const note of folded.slice().reverse()) {
    const label = noteLabel(note, translateNow('scratchpad.title'))
    const tab = document.createElement('button')
    const name = document.createElement('span')
    const count = document.createElement('span')
    tab.type = 'button'
    tab.className = 'scratchpad-tab'
    tab.dataset.noteId = note.id
    tab.title = label
    tab.setAttribute('aria-label', label)
    tab.setAttribute('aria-expanded', 'false')
    name.className = 'scratchpad-tab-title'
    name.textContent = label
    count.className = 'scratchpad-tab-count'
    count.textContent = formatNumber(note.text.length)
    tab.append(name, count)

    tab.addEventListener('click', () => unfold(note.id))
    stackHost.append(tab)
  }
}

function syncDock() {
  if (!dockButton) return
  const full = notes.length >= scratchpadMaxNotes
  dockButton.disabled = full
  const label = full ? translateNow('scratchpad.limitLabel', { n: scratchpadMaxNotes }) : translateNow('scratchpad.dockLabel')
  dockButton.title = label
  dockButton.setAttribute('aria-label', label)
}

function syncPanels(instant = false) {
  if (!notesHost) return
  const render = () => {
    for (const [id, panel] of panels) {
      if (noteById(id)) continue
      window.clearTimeout(panel.closeTimer)
      window.clearTimeout(panel.primeTimer)
      window.clearTimeout(discardTimers.get(id))
      discardTimers.delete(id)
      panel.root.remove()
      panels.delete(id)
    }
    for (const note of notes) {
      renderNote(note.id)
      applyVisibility(note.id)
    }
    renderStack()
    syncDock()
  }
  if (instant) withoutMotion(render)
  else render()
}

function pullOutNote() {
  if (notes.length >= scratchpadMaxNotes) return
  const id = nextId()
  const note = createNote(id, viewport(), dockTop(), notes.length)
  notes = withNote(notes, note)
  const panel = createPanel(note)
  if (panel) {
    renderNote(id)
    bringToFront(id)
    // The sheet is in the DOM without its open state, so the first frame is the
    // starting point of the transition rather than the end of it.
    panel.root.hidden = false
    panel.fold.setAttribute('aria-expanded', 'true')
    void panel.root.offsetWidth
    panel.root.classList.add('is-open')
    panel.text.focus()
  }
  renderStack()
  syncDock()
  saveNow()
}

function clearDiscard(id: string) {
  const timer = discardTimers.get(id)
  if (timer === undefined) return
  window.clearTimeout(timer)
  discardTimers.delete(id)
  panels.get(id)?.root.classList.remove('is-discarding')
}

/** Folds the sheet into the stack above the pull tab. */
function fold(id: string) {
  const note = noteById(id)
  const panel = panels.get(id)
  if (!note || note.collapsed || !panel) return
  clearDiscard(id)
  patchNote(id, { collapsed: true })

  const root = panel.root
  window.clearTimeout(panel.closeTimer)
  root.classList.remove('is-open', 'is-discarding')
  panel.fold.setAttribute('aria-expanded', 'false')
  panel.closeTimer = window.setTimeout(() => {
    panel.closeTimer = undefined
    if (noteById(id)?.collapsed) root.hidden = true
  }, closeTimeout)
  renderStack()
  saveNow()
}

function unfold(id: string) {
  const note = noteById(id)
  if (!note || !note.collapsed) return
  clearDiscard(id)
  patchNote(id, { collapsed: false })
  renderStack()
  syncDock()

  const panel = panels.get(id)
  if (panel) {
    bringToFront(id)
    window.clearTimeout(panel.closeTimer)
    panel.closeTimer = undefined
    panel.root.hidden = false
    panel.fold.setAttribute('aria-expanded', 'true')
    void panel.root.offsetWidth
    panel.root.classList.add('is-open')
    panel.text.focus()
  }
  saveNow()
}

function discardNote(id: string) {
  const panel = panels.get(id)
  if (!panel) return
  clearDiscard(id)
  window.clearTimeout(panel.primeTimer)
  panel.primeTimer = undefined
  panel.destroy.classList.remove('is-primed')
  panel.root.classList.add('is-discarding')
  discardTimers.set(
    id,
    window.setTimeout(() => {
      discardTimers.delete(id)
      notes = withoutNote(notes, id)
      window.clearTimeout(panel.closeTimer)
      panel.root.remove()
      panels.delete(id)
      syncPanels()
      saveNow()
      showToast(translateNow('scratchpad.discarded'))
    }, discardDelay)
  )
}

function endGesture() {
  gesture = null
  detachDrag()
  detachPending()
}

/* ----------------------------------------------------------------- gestures */

let pendingHandlers: (() => void) | null = null
let dragHandlers: (() => void) | null = null

function detachPending() {
  pendingHandlers?.()
  pendingHandlers = null
}

function detachDrag() {
  dragHandlers?.()
  dragHandlers = null
}

/**
 * Watches the window until the press travels far enough to count as a drag, then
 * hands the gesture over to the captured element. Listening on the window first
 * is what keeps a quick flick from being dropped before it starts.
 */
function startGesture(
  event: PointerEvent,
  id: string,
  handle: ResizeHandle | null,
  surface: HTMLElement,
  threshold: number
) {
  if (!noteById(id)) return
  if (gesture && (gesture.moved || gesture.pointerId === event.pointerId)) return
  detachPending()
  detachDrag()

  gesture = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startBox: { ...noteById(id)!.box },
    id,
    handle,
    surface,
    moved: false
  }

  if (threshold <= 0) {
    beginDrag(event)
    return
  }

  const onMove = (moveEvent: PointerEvent) => {
    if (!gesture || moveEvent.pointerId !== gesture.pointerId) return
    const dx = moveEvent.clientX - gesture.startX
    const dy = moveEvent.clientY - gesture.startY
    if (!gesture.moved && Math.hypot(dx, dy) < threshold) return
    beginDrag(moveEvent)
  }
  const onUp = (upEvent: PointerEvent) => {
    if (gesture?.pointerId === upEvent.pointerId) endGesture()
  }
  const onCancel = () => endGesture()

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  window.addEventListener('blur', onCancel)
  pendingHandlers = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('blur', onCancel)
  }
}

function beginDrag(event: PointerEvent) {
  const current = gesture
  if (!current) return
  detachPending()
  current.moved = true
  current.surface.setPointerCapture?.(event.pointerId)

  const panel = panels.get(current.id)
  panel?.root.classList.add(current.handle ? 'is-resizing' : 'is-dragging')
  // A press on the title would otherwise leave a text selection behind the
  // drag, so the caret is kept and the selection dropped.
  if (panel && document.activeElement === panel.title) panel.title.setSelectionRange(0, 0)

  const onMove = (moveEvent: PointerEvent) => {
    if (!gesture || moveEvent.pointerId !== gesture.pointerId) return
    moveEvent.preventDefault()
    const dx = moveEvent.clientX - gesture.startX
    const dy = moveEvent.clientY - gesture.startY
    if (gesture.handle) applyBox(gesture.id, resizeBox(gesture.startBox, gesture.handle, dx, dy, viewport()))
    else applyBox(gesture.id, clampDragBox(moveBox(gesture.startBox, dx, dy), viewport()))
  }

  const onUp = (upEvent: PointerEvent) => {
    if (!gesture || upEvent.pointerId !== gesture.pointerId) return
    const id = gesture.id
    endGesture()
    // A drag always leaves the sheet exactly where it was dropped.
    const note = noteById(id)
    if (note) applyBox(id, note.box)
    saveNow()
  }

  const onCancel = (cancelEvent: PointerEvent) => {
    if (!gesture || cancelEvent.pointerId !== gesture.pointerId) return
    const id = gesture.id
    const startBox = gesture.startBox
    endGesture()
    if (noteById(id)) applyBox(id, startBox)
  }

  current.surface.addEventListener('pointermove', onMove)
  current.surface.addEventListener('pointerup', onUp)
  current.surface.addEventListener('pointercancel', onCancel)
  dragHandlers = () => {
    current.surface.removeEventListener('pointermove', onMove)
    current.surface.removeEventListener('pointerup', onUp)
    current.surface.removeEventListener('pointercancel', onCancel)
  }
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  const active = document.activeElement
  if (!(active instanceof HTMLElement) || !layer?.contains(active)) return
  const id = active.closest<HTMLElement>('.scratchpad')?.dataset.noteId
  if (!id) return
  event.stopPropagation()
  fold(id)
}

/* ------------------------------------------------------------------ storage */

function restore() {
  const content = parseScratchpadState(readShared())?.notes ?? []
  notes = joinStores(content, readViews(), viewport(), dockTop())
  stateLoaded = true
  stackSignature = ''
  clampAll()
  syncPanels(true)
}

/**
 * Another tab wrote the stack. Only its words are adopted: this tab keeps its own
 * placement for every sheet it already knows, because a note dragged over there
 * has no business jumping across the screen here. Its text is still taken even
 * while this tab is the one editing it, caret kept in place, so a sheet another
 * tab threw away does not come back to life from the next autosave here.
 */
function adoptStorage(raw: string | null | undefined) {
  const stored = parseScratchpadState(raw)
  if (!stored) return
  const active = document.activeElement
  const field = active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement ? active : null
  const focusedId = active instanceof HTMLElement ? active.closest<HTMLElement>('.scratchpad')?.dataset.noteId : undefined
  const caret = field?.selectionStart ?? null

  notes = joinStores(stored.notes, viewOf(notes), viewport(), dockTop())
  clampAll()
  syncPanels()

  if (focusedId && field && caret != null) {
    const panel = panels.get(focusedId)
    const target = field === panel?.title ? panel.title : panel?.text
    if (target) {
      target.focus()
      target.setSelectionRange(caret, caret)
    }
  }
}

/**
 * The client router replaces the whole body, so the live layer is handed over to
 * the incoming document first. That is what keeps the notes, their carets and
 * their positions alive across a view transition instead of reloading on every
 * page. The freshly rendered layer is swapped out, otherwise the page would ship
 * a second copy. A locale switch is left alone on purpose: those strings come
 * from the server, so the incoming layer is rendered in the new language.
 */
function onSwap(event: Event) {
  const newDocument = (event as Event & { newDocument?: Document }).newDocument
  if (!newDocument?.body || !layer?.isConnected) return
  if (newDocument.documentElement.dataset.locale !== document.documentElement.dataset.locale) return
  saveNow()
  const incoming = newDocument.body.querySelector('.scratchpad-layer')
  if (incoming) incoming.replaceWith(layer)
  else newDocument.body.append(layer)
}

function mount() {
  if (!document.body) return
  const nextLayer = document.querySelector<HTMLElement>('.scratchpad-layer')
  if (!nextLayer) return
  if (layer && layer !== nextLayer) {
    // The incoming document brought its own layer: let that one stand.
    for (const panel of panels.values()) {
      window.clearTimeout(panel.closeTimer)
      panel.root.remove()
    }
    panels = new Map()
    stackSignature = ''
    layer = null
  }
  if (nextLayer !== layer) {
    layer = nextLayer
    notesHost = nextLayer.querySelector<HTMLElement>('[data-scratchpad="notes"]')
    stackHost = nextLayer.querySelector<HTMLElement>('[data-scratchpad="stack"]')
    dock = nextLayer.querySelector<HTMLElement>('.scratchpad-dock')
    dockButton = nextLayer.querySelector<HTMLButtonElement>('#scratchpad-dock-button')
    template = nextLayer.querySelector<HTMLTemplateElement>('#scratchpad-template')
    collectIcons()
    if (dockButton && !boundButtons.has(dockButton)) {
      boundButtons.add(dockButton)
      dockButton.addEventListener('click', pullOutNote)
    }
  }
  if (!wired) {
    wired = true
    window.addEventListener('resize', () => {
      clampAll()
      syncPanels()
    })
    window.addEventListener('pagehide', saveNow)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveNow()
    })
    document.addEventListener('astro:before-swap', onSwap)
    document.addEventListener('keydown', onKeyDown)
    // Another tab wrote the shared words; only those are adopted.
    storage().subscribe((key) => {
      if (key === scratchpadStorageKey) adoptStorage(readValue(scratchpadStorageKey))
    })
  }

  // Opening the table takes a moment; restoring before it has read the database
  // would start from an empty drawer and then have to be corrected.
  whenStorageReady(() => {
    if (stateLoaded) syncPanels(true)
    else restore()
  })
}

document.addEventListener('astro:page-load', mount)
mount()
