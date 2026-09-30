/**
 * The data page: the one place where everything the site remembers can be read,
 * taken away, or carried to another browser.
 *
 * It reads through the same table the tools write to, so what is listed here is
 * exactly what the tools would find — no second copy of the truth. The listing
 * is a window onto the table, not a form: values are written as text into a
 * `<pre>`, which is what keeps a note someone typed from becoming markup and
 * keeps the page from offering a way to change what the tools would then read.
 */

import { translateNow } from '../i18n/client'
import { tokenizeJson } from '../lib/json-highlight'
import { storage } from '../lib/storage'
import { storageExportLimit } from '../lib/storage-schema'

const byteLength = (value: string): number => new TextEncoder().encode(value).length

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Values are stored as text, and most of them are text that happens to be JSON.
 * Unwrapping that JSON makes a stored note readable here, which is the whole
 * point of looking; anything that is not JSON is shown as it is.
 */
const readable = (value: string): string => {
  try {
    const parsed = JSON.parse(value) as unknown
    if (parsed !== null && typeof parsed === 'object') return JSON.stringify(parsed, null, 2)
  } catch {
    // Not JSON, so the string is already the most readable form of it.
  }
  return value
}

/**
 * Paints one stored value into a box, as text, with JSON pieces marked up when
 * the value turns out to be JSON. Every piece goes in as its own text node, so
 * a note holding angle brackets stays exactly what someone typed.
 */
const showValue = (box: HTMLElement, raw: string) => {
  const text = readable(raw)
  const tokens = tokenizeJson(text)
  if (!tokens) {
    box.textContent = text
    return
  }
  box.replaceChildren(
    ...tokens.map((token) => {
      const span = document.createElement('span')
      span.className = `data-tok data-tok-${token.kind}`
      span.textContent = token.text
      return span
    })
  )
}

const download = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  // A link that is not on the page is a link the browser will not follow.
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function mount() {
  const root = document.querySelector<HTMLElement>('[data-data-page]')
  if (!root || root.dataset.ready === 'true') return
  root.dataset.ready = 'true'

  // The page is assembled from a template, so these exist as long as the markup
  // and this script agree. A mismatch has to leave a page that still works rather
  // than an exception on load, which would also stop the page being remounted
  // after a client-side navigation.
  const required = <T extends HTMLElement>(selector: string): T | null => root.querySelector<T>(selector)
  const status = required<HTMLElement>('[data-data-status]')
  const empty = required<HTMLElement>('[data-data-empty]')
  const totalLine = required<HTMLElement>('[data-data-total]')
  const list = required<HTMLElement>('.data-rows')
  const template = required<HTMLTemplateElement>('[data-data-row-template]')
  if (!status || !empty || !totalLine || !list || !template) return
  const fileInput = required<HTMLInputElement>('[data-data-file]')
  const table = storage()

  // The rows the build already knows, so a key that turns up later can join them
  // without a selector and without anyone having to register it here.
  const rows = new Map<string, HTMLElement>()
  for (const row of list.querySelectorAll<HTMLElement>('[data-data-key]')) {
    if (row.dataset.dataKey) rows.set(row.dataset.dataKey, row)
  }

  const say = (key: Parameters<typeof translateNow>[0], vars?: Record<string, string | number>) => {
    status.textContent = translateNow(key, vars)
    status.hidden = false
    status.dataset.kind = key === 'data.failed' ? 'error' : 'ok'
  }

  const paint = () => {
    const entries = Object.entries(table.snapshot()).sort(([a], [b]) => a.localeCompare(b))
    const seen = new Set<string>()

    for (const [key, value] of entries) {
      seen.add(key)
      let row = rows.get(key)
      if (!row) {
        const clone = template.content.firstElementChild?.cloneNode(true) as HTMLElement | null
        if (!clone) continue
        row = clone
        row.dataset.dataKey = key
        // A key the build did not name, such as a per-tab layout record, is
        // introduced by its own name.
        const name = row.querySelector<HTMLElement>('.data-row-name')
        const label = row.querySelector<HTMLElement>('.data-row-key')
        if (!name || !label) continue
        name.textContent = key
        label.textContent = key
        rows.set(key, row)
        list.append(row)
      }
      const sizeCell = row.querySelector<HTMLElement>('[data-data-size]')
      const box = row.querySelector<HTMLElement>('[data-data-value]')
      if (!sizeCell || !box) continue
      row.hidden = false
      sizeCell.textContent = formatSize(byteLength(value))
      showValue(box, value)
      // The box scrolls, so it can be reached by keyboard, and the key it
      // belongs to is the name a screen reader should announce for it.
      box.setAttribute('aria-label', key)
    }

    for (const [key, row] of rows) if (!seen.has(key)) row.hidden = true

    empty.hidden = entries.length > 0
    const bytes = entries.reduce((sum, [, value]) => sum + byteLength(value), 0)
    totalLine.textContent = translateNow('data.size', { count: entries.length, size: formatSize(bytes) })
  }

  table.ready.then(paint)
  table.subscribe(paint)

  root.querySelector('[data-data-action="export"]')?.addEventListener('click', async () => {
    const backup = await table.export()
    const stamp = new Date().toISOString().slice(0, 10)
    download(`code-space-backup-${stamp}.json`, backup)
    say('data.exported')
  })

  root.querySelector('[data-data-action="import"]')?.addEventListener('click', () => fileInput?.click())

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (!file) return
    if (file.size > storageExportLimit) {
      say('data.failed')
      return
    }
    try {
      const count = await table.import(await file.text())
      say('data.imported', { count })
    } catch {
      say('data.failed')
    }
  })

  // Wiping the table is the one thing on this page that cannot be undone, so it
  // takes a second press: the first reveals the question and the buttons that
  // answer it, and only the second one clears. Anything that closes the question
  // without answering it puts the button back the way it was.
  const clearButton = required<HTMLButtonElement>('[data-data-action="clear"]')
  const confirm = required<HTMLElement>('[data-data-confirm]')
  const confirmYes = required<HTMLButtonElement>('[data-data-confirm-yes]')
  const confirmNo = required<HTMLButtonElement>('[data-data-confirm-no]')
  if (!clearButton || !confirm || !confirmYes || !confirmNo) return

  const setConfirming = (on: boolean) => {
    clearButton.hidden = on
    confirm.hidden = !on
    if (on) confirmYes.focus()
    else clearButton.focus()
  }

  clearButton.addEventListener('click', () => setConfirming(true))
  confirmNo.addEventListener('click', () => setConfirming(false))
  confirm.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Escape') setConfirming(false)
  })
  confirmYes.addEventListener('click', async () => {
    confirmYes.disabled = true
    await table.clear()
    setConfirming(false)
    say('data.cleared')
  })
}

document.addEventListener('astro:page-load', mount)
mount()
