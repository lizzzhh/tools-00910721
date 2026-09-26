export type FloatingMenu = {
  trigger: HTMLElement
  menu: HTMLElement
  home: { parent: Element; next: Node | null }
  open: boolean
}

const layerClass = 'ui-popover-layer'
const viewportGap = 8

const openMenus = new Set<FloatingMenu>()
let layer: HTMLElement | null = null
let frame = 0

function readSpacing(name: string, fallback: number) {
  if (typeof getComputedStyle !== 'function' || typeof document === 'undefined') return fallback
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name))
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function getLayer() {
  if (layer?.isConnected) return layer

  const existing = document.querySelector<HTMLElement>(`.${layerClass}`)
  if (existing) {
    layer = existing
    return existing
  }

  const created = document.createElement('div')
  created.className = layerClass
  created.dataset.popoverLayer = ''
  document.body.append(created)
  layer = created
  return created
}

function place(entry: FloatingMenu) {
  const { trigger, menu } = entry
  const gap = readSpacing('--spacing-xs', 4)
  const viewportWidth = document.documentElement.clientWidth
  const viewportHeight = document.documentElement.clientHeight
  const triggerRect = trigger.getBoundingClientRect()

  menu.style.minWidth = `${Math.round(triggerRect.width)}px`
  menu.style.maxHeight = ''

  const naturalHeight = menu.offsetHeight
  const roomBelow = viewportHeight - triggerRect.bottom - gap
  const roomAbove = triggerRect.top - gap
  const flip = naturalHeight > roomBelow && roomAbove > roomBelow
  const maxHeight = Math.max(0, Math.min(flip ? roomAbove : roomBelow, viewportHeight - viewportGap * 2))
  const height = Math.min(naturalHeight, maxHeight)

  menu.style.maxHeight = `${Math.round(maxHeight)}px`
  menu.style.top = `${Math.round(flip ? triggerRect.top - gap - height : triggerRect.bottom + gap)}px`
  menu.style.left = `${Math.round(
    Math.max(viewportGap, Math.min(triggerRect.left, viewportWidth - menu.offsetWidth - viewportGap))
  )}px`
}

export function openFloatingMenu(trigger: HTMLElement, menu: HTMLElement) {
  closeAllFloatingMenus()

  const home = { parent: menu.parentElement as Element, next: menu.nextSibling }
  const entry: FloatingMenu = { trigger, menu, home, open: true }

  getLayer().append(menu)
  menu.hidden = false
  trigger.setAttribute('aria-expanded', 'true')
  openMenus.add(entry)
  place(entry)

  return entry
}

export function closeFloatingMenu(entry: FloatingMenu | null, focusTrigger = false) {
  if (!entry?.open) return

  entry.open = false
  openMenus.delete(entry)
  entry.menu.hidden = true
  entry.menu.style.minWidth = ''
  entry.menu.style.maxHeight = ''
  entry.menu.style.top = ''
  entry.menu.style.left = ''
  entry.trigger.setAttribute('aria-expanded', 'false')

  if (entry.home.parent.isConnected) {
    if (entry.home.next?.parentNode === entry.home.parent) entry.home.parent.insertBefore(entry.menu, entry.home.next)
    else entry.home.parent.append(entry.menu)
  }

  if (focusTrigger) entry.trigger.focus()
}

export function closeAllFloatingMenus() {
  for (const entry of [...openMenus]) closeFloatingMenu(entry)
}

export function isFloatingMenuOpen(entry: FloatingMenu | null) {
  return entry?.open === true
}

export function repositionFloatingMenus() {
  const viewportHeight = document.documentElement.clientHeight

  for (const entry of [...openMenus]) {
    const rect = entry.trigger.getBoundingClientRect()
    if (!entry.menu.isConnected || rect.bottom < 0 || rect.top > viewportHeight) closeFloatingMenu(entry)
    else place(entry)
  }
}

function scheduleReposition() {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    repositionFloatingMenus()
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('scroll', scheduleReposition, { capture: true, passive: true })
  window.addEventListener('resize', scheduleReposition, { passive: true })
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    const entry = openMenus.values().next().value
    if (entry) {
      event.preventDefault()
      closeFloatingMenu(entry, true)
    }
  })
  document.addEventListener('click', (event) => {
    const target = event.target as Node | null
    if (!target) return
    for (const entry of [...openMenus]) {
      if (entry.trigger.contains(target) || entry.menu.contains(target)) continue
      closeFloatingMenu(entry)
    }
  })
  document.addEventListener('astro:page-load', () => {
    closeAllFloatingMenus()
    layer = null
  })
}
