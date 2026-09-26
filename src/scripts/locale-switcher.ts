import { localeStorageKey } from '../i18n/config'

const mounted = new WeakSet<HTMLElement>()

function initLocaleSwitcher() {
  const found = document.querySelector<HTMLElement>('#locale-switcher')
  if (!found || mounted.has(found)) return
  mounted.add(found)

  const trigger = found.querySelector<HTMLButtonElement>('#locale-trigger')
  const menu = found.querySelector<HTMLElement>('#locale-menu')
  if (!trigger || !menu) return
  const switcher = found
  const triggerButton = trigger
  const popup = menu

  function setOpen(open: boolean) {
    popup.hidden = !open
    triggerButton.setAttribute('aria-expanded', String(open))
    switcher.classList.toggle('open', open)
  }

  trigger.addEventListener('click', (event) => {
    event.stopPropagation()
    setOpen(popup.hidden)
  })

  popup.querySelectorAll<HTMLAnchorElement>('[data-locale-option]').forEach((option) => {
    option.addEventListener('click', () => {
      const next = option.dataset.localeOption
      if (next) {
        // Persist before navigating so the inline detector in <head> keeps the
        // choice instead of second-guessing it from Accept-Language.
        try {
          localStorage.setItem(localeStorageKey, next)
        } catch {}
        document.documentElement.lang = option.getAttribute('lang') ?? document.documentElement.lang
        document.documentElement.dataset.locale = next
      }
      setOpen(false)
    })
  })

  document.addEventListener('click', (event) => {
    if (!switcher.contains(event.target as Node)) setOpen(false)
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !popup.hidden) {
      setOpen(false)
      triggerButton.focus()
    }
  })
}

document.addEventListener('astro:page-load', initLocaleSwitcher)
initLocaleSwitcher()
