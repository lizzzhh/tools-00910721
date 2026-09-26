import { closeFloatingMenu, isFloatingMenuOpen, openFloatingMenu, type FloatingMenu } from './floating-menu'

const mountedRoots = new WeakSet<HTMLElement>()

type SelectInstance = {
  root: HTMLElement
  input: HTMLInputElement
  trigger: HTMLButtonElement
  triggerLabel: HTMLElement
  menu: HTMLElement
  options: HTMLButtonElement[]
  entry: FloatingMenu | null
}

function close(instance: SelectInstance, focusTrigger = false) {
  closeFloatingMenu(instance.entry, focusTrigger)
  instance.entry = null
}

function select(instance: SelectInstance, option: HTMLButtonElement) {
  instance.input.value = option.dataset.value ?? ''
  instance.triggerLabel.textContent = option.textContent?.trim() ?? ''
  instance.options.forEach((item) => {
    const selected = item === option
    item.classList.toggle('selected', selected)
    item.setAttribute('aria-selected', String(selected))
  })
  close(instance)
  instance.input.dispatchEvent(new Event('change', { bubbles: true }))
}

function initSelects() {
  document.querySelectorAll<HTMLElement>('[data-select]').forEach((root) => {
    if (mountedRoots.has(root)) return
    mountedRoots.add(root)

    const input = root.querySelector<HTMLInputElement>('input[type="hidden"]')
    const trigger = root.querySelector<HTMLButtonElement>('.ui-select-trigger')
    const triggerLabel = trigger?.querySelector<HTMLElement>('span')
    const menu = root.querySelector<HTMLElement>('.ui-select-menu')
    const options = root.querySelectorAll<HTMLButtonElement>('[role="option"]')
    if (!input || !trigger || !triggerLabel || !menu) return

    const instance: SelectInstance = { root, input, trigger, triggerLabel, menu, options: [...options], entry: null }

    trigger.addEventListener('click', () => {
      if (isFloatingMenuOpen(instance.entry)) {
        close(instance)
        return
      }
      instance.entry = openFloatingMenu(trigger, menu)
    })
    options.forEach((option) => option.addEventListener('click', () => select(instance, option)))
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isFloatingMenuOpen(instance.entry)) {
        event.preventDefault()
        close(instance, true)
      }
    })
  })
}

document.addEventListener('astro:page-load', initSelects)
initSelects()
