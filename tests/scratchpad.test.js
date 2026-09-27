import { strict as assert } from 'node:assert'
import test from 'node:test'
import {
  clampBox,
  clampDragBox,
  contentOf,
  createNote,
  defaultScratchpadBox,
  hitResizeHandle,
  joinStores,
  moveBox,
  noteLabel,
  parseScratchpadState,
  parseScratchpadView,
  resizeBox,
  scratchpadCascadeStep,
  scratchpadHeadReserve,
  scratchpadMaxHeight,
  scratchpadMinHeight,
  scratchpadMinWidth,
  scratchpadViewportMargin,
  serializeScratchpadState,
  serializeScratchpadView,
  viewOf,
  withNote,
  withoutNote
} from '../src/lib/scratchpad.ts'

const desktop = { width: 1440, height: 900 }
const phone = { width: 375, height: 667 }
const box = { x: 100, y: 100, width: 360, height: 300 }
const headBottom = desktop.height - scratchpadViewportMargin - scratchpadHeadReserve

test('clamps a box pulled far off screen back into the viewport', () => {
  const result = clampBox({ x: -5000, y: 5000, width: 360, height: 300 }, desktop)
  assert.equal(result.x, 12)
  assert.equal(result.y, headBottom)
  assert.equal(result.width, 360)
  assert.equal(result.height, 300)
})

test('keeps a box inside the viewport margin instead of flush with the edge', () => {
  const result = clampBox({ x: 1200, y: 700, width: 360, height: 300 }, desktop)
  assert.equal(result.x, 1440 - 12 - 360)
  assert.equal(result.y, 700)
})

test('shrinks a box that is wider than a small viewport', () => {
  const result = clampBox(box, phone)
  assert.equal(result.width, 375 - 24)
  assert.equal(result.x, 12)
  assert.ok(result.height >= scratchpadMinHeight)
})

test('respects the minimum size in both directions', () => {
  const result = clampBox({ x: 0, y: 0, width: 10, height: 10 }, desktop)
  assert.equal(result.width, scratchpadMinWidth)
  assert.equal(result.height, scratchpadMinHeight)
  assert.equal(result.x, 12)
  assert.equal(result.y, 12)
})

test('the note may hang below the fold while its title bar stays on screen', () => {
  const result = clampBox({ x: 100, y: 5000, width: 360, height: 900 }, desktop)
  assert.equal(result.y, headBottom)
  assert.ok(result.y + result.height > desktop.height, 'the body is allowed to overflow')
  assert.ok(result.y + scratchpadHeadReserve <= desktop.height, 'the head still fits')
})

test('a stretched note stops at the height ceiling', () => {
  const result = clampBox({ x: 100, y: 12, width: 360, height: 99999 }, desktop)
  assert.equal(result.height, scratchpadMaxHeight)
})

test('the default box rests in the bottom-right corner above the pull tab', () => {
  const result = defaultScratchpadBox(desktop)
  assert.equal(result.x, 1440 - 12 - 360)
  assert.equal(result.y, 900 - 138 - 300)
})

test('the default box follows a measured tab position', () => {
  const result = defaultScratchpadBox(desktop, 400)
  assert.equal(result.y, 400 - 12 - 300)
})

test('each further note is offset so it does not land on the previous one', () => {
  const first = defaultScratchpadBox(desktop, 400, 0)
  const second = defaultScratchpadBox(desktop, 400, 1)
  const third = defaultScratchpadBox(desktop, 400, 2)
  assert.equal(second.x, first.x - scratchpadCascadeStep)
  assert.equal(second.y, first.y - scratchpadCascadeStep)
  assert.equal(third.x, first.x - scratchpadCascadeStep * 2)
})

test('a cascade on a small screen is still clamped on screen', () => {
  const result = defaultScratchpadBox(phone, 400, 40)
  assert.ok(result.x >= 12)
  assert.ok(result.y >= 12)
  assert.ok(result.x + result.width <= phone.width - 12)
})

test('a new note starts untitled, empty, monospaced and open', () => {
  const note = createNote('note-1', desktop)
  assert.equal(note.title, '')
  assert.equal(note.text, '')
  assert.equal(note.collapsed, false)
  assert.equal(note.monospace, true)
  assert.deepEqual(note.box, defaultScratchpadBox(desktop))
})

test('an untitled note falls back to the default label', () => {
  assert.equal(noteLabel(createNote('n1', desktop), 'Note'), 'Note')
  assert.equal(noteLabel({ ...createNote('n1', desktop), title: '   ' }, 'Note'), 'Note')
  assert.equal(noteLabel({ ...createNote('n1', desktop), title: ' API keys ' }, 'Note'), 'API keys')
})

test('moving keeps the size and shifts only the origin', () => {
  const result = moveBox(box, 30, -20)
  assert.deepEqual(result, { x: 130, y: 80, width: 360, height: 300 })
})

test('a drag keeps the sheet on screen sideways but lets it hang off the bottom', () => {
  const result = clampDragBox({ ...box, x: 5000, y: 5000 }, desktop)
  assert.equal(result.x, desktop.width - scratchpadViewportMargin - box.width)
  assert.equal(result.y, headBottom)
  assert.equal(result.width, 360)
})

test('a drag still cannot lose the panel off the top-left corner', () => {
  const result = clampDragBox({ ...box, x: -900, y: -900 }, desktop)
  assert.equal(result.x, 12)
  assert.equal(result.y, 12)
})

test('a south-east resize grows the box from the top-left corner', () => {
  const result = resizeBox(box, 'se', 40, 60, desktop)
  assert.deepEqual(result, { x: 100, y: 100, width: 400, height: 360 })
})

test('a north-west resize moves the origin and keeps the far corner pinned', () => {
  const result = resizeBox(box, 'nw', 40, 30, desktop)
  assert.deepEqual(result, { x: 140, y: 130, width: 320, height: 270 })
})

test('a resize never shrinks past the minimum', () => {
  const result = resizeBox(box, 'se', -5000, -5000, desktop)
  assert.equal(result.width, scratchpadMinWidth)
  assert.equal(result.height, scratchpadMinHeight)
})

test('a resize stops at the height ceiling', () => {
  const result = resizeBox(box, 's', 0, 5000, desktop)
  assert.equal(result.height, scratchpadMaxHeight)
})

test('an edge resize stops at the viewport margin', () => {
  const result = resizeBox(box, 'e', 5000, 0, desktop)
  assert.equal(result.x + result.width, 1440 - 12)
})

test('dragging the west edge past the margin keeps the panel on screen', () => {
  const result = resizeBox(box, 'w', -5000, 0, desktop)
  assert.equal(result.x, 12)
  assert.equal(result.x + result.width, 460)
})

test('a note can be stretched downwards past the bottom of the screen', () => {
  const result = resizeBox({ x: 100, y: 200, width: 360, height: 300 }, 's', 0, 5000, desktop)
  assert.equal(result.y, 200)
  assert.equal(result.height, scratchpadMaxHeight)
  assert.ok(result.y + result.height > desktop.height)
})

test('hit testing finds the handle under a point', () => {
  assert.equal(hitResizeHandle(box, { x: 460, y: 250 }), 'e')
  assert.equal(hitResizeHandle(box, { x: 280, y: 400 }), 's')
  assert.equal(hitResizeHandle(box, { x: 460, y: 400 }), 'se')
  assert.equal(hitResizeHandle(box, { x: 100, y: 400 }), 'sw')
  assert.equal(hitResizeHandle(box, { x: 100, y: 100 }), 'nw')
  assert.equal(hitResizeHandle(box, { x: 460, y: 100 }), 'ne')
  assert.equal(hitResizeHandle(box, { x: 100, y: 250 }), 'w')
  assert.equal(hitResizeHandle(box, { x: 280, y: 90 }), 'n')
})

test('hit testing reports nothing over the panel body', () => {
  assert.equal(hitResizeHandle(box, { x: 280, y: 250 }), null)
  assert.equal(hitResizeHandle(box, { x: -40, y: 250 }), null)
})

test('the shared store keeps the words and leaves the furniture out', () => {
  const notes = [
    { ...createNote('n1', desktop), title: 'api', text: 'key', box: { x: 1, y: 2, width: 3, height: 4 } },
    { ...createNote('n2', desktop), collapsed: true, monospace: false }
  ]
  const parsed = parseScratchpadState(serializeScratchpadState({ notes: contentOf(notes) }))
  assert.deepEqual(parsed, {
    notes: [
      { id: 'n1', title: 'api', text: 'key', monospace: true },
      { id: 'n2', title: '', text: '', monospace: false }
    ]
  })
})

test('the per-tab store round trips a box and a folded flag', () => {
  const notes = [
    { ...createNote('n1', desktop), box: { x: 1, y: 2, width: 3, height: 4 } },
    { ...createNote('n2', desktop), collapsed: true }
  ]
  assert.deepEqual(parseScratchpadView(serializeScratchpadView({ views: viewOf(notes) })), {
    n1: { box: { x: 1, y: 2, width: 3, height: 4 }, collapsed: false },
    n2: { box: notes[1].box, collapsed: true }
  })
  assert.deepEqual(parseScratchpadView(null), {})
  assert.deepEqual(parseScratchpadView('not json'), {})
  assert.deepEqual(parseScratchpadView('{"views":{"n1":{"collapsed":true}}}'), {})
  assert.deepEqual(parseScratchpadView('{"views":{"bad id":{"box":{"x":1,"y":2,"width":3,"height":4}}}}'), {})
})

test('a tab that has never seen a sheet folds it in the corner', () => {
  const content = [
    { id: 'n1', title: 'api', text: 'key', monospace: true },
    { id: 'n2', title: '', text: 'second', monospace: true }
  ]
  const joined = joinStores(content, {}, desktop, 700)
  assert.equal(joined.length, 2)
  assert.equal(joined[0].text, 'key')
  assert.deepEqual(joined[0].box, defaultScratchpadBox(desktop, 700, 0))
  assert.equal(joined[0].collapsed, true)
  assert.equal(joined[1].collapsed, true)
  assert.notDeepEqual(joined[0].box, joined[1].box)
})

test('a sheet this tab placed keeps its own box while the words travel', () => {
  const mine = { ...createNote('n1', desktop), box: { x: 700, y: 120, width: 400, height: 320 } }
  const views = viewOf([mine])
  const joined = joinStores([{ id: 'n1', title: 'renamed', text: 'fresh words', monospace: false }], views, desktop)
  assert.deepEqual(joined[0].box, mine.box)
  assert.equal(joined[0].collapsed, false)
  assert.equal(joined[0].title, 'renamed')
  assert.equal(joined[0].text, 'fresh words')
  assert.equal(joined[0].monospace, false)
})

test('a sheet thrown away in another tab leaves the stack here too', () => {
  const views = viewOf([createNote('n1', desktop), createNote('n2', desktop)])
  const joined = joinStores([{ id: 'n2', title: '', text: 'kept', monospace: true }], views, desktop)
  assert.equal(joined.length, 1)
  assert.equal(joined[0].id, 'n2')
})

test('rejects anything that is not a usable state', () => {
  assert.equal(parseScratchpadState(null), null)
  assert.equal(parseScratchpadState('not json'), null)
  assert.equal(parseScratchpadState('"text"'), null)
  assert.equal(parseScratchpadState('[1,2]'), null)
  assert.equal(parseScratchpadState('{"notes":"x"}'), null)
  assert.equal(parseScratchpadState('{"open":true,"text":5,"box":{}}'), null)
})

test('migrates the single-note shape written before the stack existed', () => {
  const parsed = parseScratchpadState('{"open":true,"text":"a","box":{"x":1,"y":2,"width":3,"height":4}}')
  assert.deepEqual(parsed, { notes: [{ id: 'note-1', title: '', text: 'a', monospace: true }] })
})

test('drops only the damaged sheets, and refuses ids that could break the DOM', () => {
  const parsed = parseScratchpadState(
    JSON.stringify({
      notes: [
        { id: 'ok', text: 'a' },
        { id: 'ok', text: 'duplicate' },
        { id: 'bad id', text: 'b' },
        { id: 'no-text' }
      ]
    })
  )
  assert.equal(parsed?.notes.length, 1)
  assert.equal(parsed?.notes[0].id, 'ok')
  assert.equal(parsed?.notes[0].text, 'a')
})

test('missing note fields fall back to the defaults', () => {
  const parsed = parseScratchpadState('{"notes":[{"id":"n1","text":"a","monospace":false}]}')
  assert.equal(parsed?.notes[0].title, '')
  assert.equal(parsed?.notes[0].monospace, false)
})

test('an empty stack is a valid state', () => {
  assert.deepEqual(parseScratchpadState('{"notes":[]}'), { notes: [] })
})

test('withNote replaces a sheet in place and appends a new one', () => {
  const first = createNote('n1', desktop)
  const second = createNote('n2', desktop)
  const replaced = withNote([first, second], { ...second, text: 'edited' })
  assert.equal(replaced.length, 2)
  assert.equal(replaced[1].text, 'edited')
  const appended = withNote([first], second)
  assert.equal(appended.length, 2)
  assert.equal(appended[1].id, 'n2')
})

test('withoutNote drops the discarded sheet', () => {
  const notes = [createNote('n1', desktop), createNote('n2', desktop)]
  const left = withoutNote(notes, 'n1')
  assert.equal(left.length, 1)
  assert.equal(left[0].id, 'n2')
  assert.equal(withoutNote(notes, 'missing').length, 2)
})
