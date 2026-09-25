const sidebar = document.querySelector<HTMLElement>('#sidebar')
const backdrop = document.querySelector<HTMLElement>('#mobile-backdrop')
const menuButton = document.querySelector<HTMLButtonElement>('#mobile-menu')
const closeButton = document.querySelector<HTMLButtonElement>('#close-sidebar')
const searchInput = document.querySelector<HTMLInputElement>('#tool-search')
const themeButton = document.querySelector<HTMLButtonElement>('#theme-toggle')
const toast = document.querySelector<HTMLElement>('#toast')
const toastText = document.querySelector<HTMLElement>('#toast-text')
let toastTimer: number | undefined

export function showToast(message: string) {
  if (!toast || !toastText) return
  toastText.textContent = message
  toast.classList.add('is-visible')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 1800)
}

function closeMobileMenu() {
  sidebar?.classList.remove('is-open')
  backdrop?.classList.remove('is-visible')
  menuButton?.setAttribute('aria-expanded', 'false')
}

function openMobileMenu() {
  sidebar?.classList.add('is-open')
  backdrop?.classList.add('is-visible')
  menuButton?.setAttribute('aria-expanded', 'true')
}

function filterTools(value: string) {
  const keyword = value.trim().toLocaleLowerCase()
  let visibleCount = 0
  document.querySelectorAll<HTMLElement>('.tool-item').forEach((item) => {
    const searchText = item.dataset.search?.toLocaleLowerCase() ?? ''
    const matches = !keyword || searchText.includes(keyword)
    item.hidden = !matches
    if (matches) visibleCount += 1
  })
  document.querySelectorAll<HTMLElement>('.tool-group').forEach((group) => {
    group.hidden = Boolean(keyword && !group.querySelector('.tool-item:not([hidden])'))
  })
  const emptySearch = document.querySelector<HTMLElement>('#empty-search')
  if (emptySearch) emptySearch.hidden = visibleCount > 0 || !keyword
}

menuButton?.addEventListener('click', () => sidebar?.classList.contains('is-open') ? closeMobileMenu() : openMobileMenu())
closeButton?.addEventListener('click', closeMobileMenu)
backdrop?.addEventListener('click', closeMobileMenu)
sidebar?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMobileMenu))
searchInput?.addEventListener('input', (event) => filterTools((event.currentTarget as HTMLInputElement).value))
searchInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    searchInput.value = ''
    filterTools('')
    searchInput.blur()
  }
})
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    if (window.innerWidth < 1024) openMobileMenu()
    window.setTimeout(() => searchInput?.focus(), 50)
  }
  if (event.key === 'Escape') closeMobileMenu()
})
themeButton?.addEventListener('click', () => {
  const isDark = document.documentElement.classList.toggle('dark')
  localStorage.setItem('code-space-theme', isDark ? 'dark' : 'light')
  themeButton.setAttribute('aria-label', isDark ? '切换浅色主题' : '切换深色主题')
})
window.addEventListener('resize', () => {
  if (window.innerWidth >= 1024) closeMobileMenu()
})
