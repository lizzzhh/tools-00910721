document.querySelectorAll<HTMLElement>('[data-select]').forEach((root) => {
  if (root.dataset.initialized) return
  root.dataset.initialized = 'true'

  const input = root.querySelector<HTMLInputElement>('input[type="hidden"]')
  const trigger = root.querySelector<HTMLButtonElement>('.ui-select-trigger')
  const triggerLabel = trigger?.querySelector<HTMLElement>('span')
  const menu = root.querySelector<HTMLElement>('.ui-select-menu')
  const options = root.querySelectorAll<HTMLButtonElement>('[role="option"]')
  if (!input || !trigger || !triggerLabel || !menu) return

  const setOpen = (open: boolean) => {
    menu.hidden = !open
    trigger.setAttribute('aria-expanded', String(open))
  }

  trigger.addEventListener('click', () => setOpen(menu.hidden))
  options.forEach((option) => {
    option.addEventListener('click', () => {
      const value = option.dataset.value ?? ''
      input.value = value
      triggerLabel.textContent = option.textContent?.trim() ?? ''
      options.forEach((item) => {
        const selected = item === option
        item.classList.toggle('selected', selected)
        item.setAttribute('aria-selected', String(selected))
      })
      setOpen(false)
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
  })
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setOpen(false)
      trigger.focus()
    }
  })
})

document.addEventListener('click', (event) => {
  document.querySelectorAll<HTMLElement>('[data-select] .ui-select-menu:not([hidden])').forEach((menu) => {
    const root = menu.closest<HTMLElement>('[data-select]')
    if (root && !root.contains(event.target as Node)) {
      menu.hidden = true
      root.querySelector<HTMLButtonElement>('.ui-select-trigger')?.setAttribute('aria-expanded', 'false')
    }
  })
})
