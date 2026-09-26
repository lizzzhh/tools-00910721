const toolSwitchScrollKey = 'code-space-tool-switch-scroll'
let sidebar: HTMLElement | null = null
let backdrop: HTMLElement | null = null
let menuButton: HTMLButtonElement | null = null
let closeButton: HTMLButtonElement | null = null
let searchInput: HTMLInputElement | null = null
let themeButton: HTMLButtonElement | null = null
let toastTimer: number | undefined
const mountedBodies = new WeakSet<HTMLElement>()
let persistentAttached = false
let navigatedViaSwap = false

export function showToast(message: string) {
  const toast = document.querySelector<HTMLElement>('#toast')
  const toastText = document.querySelector<HTMLElement>('#toast-text')
  if (!toast || !toastText) return
  toastText.textContent = message
  toast.classList.add('is-visible')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 1800)
}

function saveScrollToStorage() {
  const scrollElement = document.querySelector<HTMLElement>('.sidebar-scroll')
  sessionStorage.setItem(toolSwitchScrollKey, JSON.stringify({ y: window.scrollY, sidebarTop: scrollElement?.scrollTop ?? 0 }))
}

function saveToolSwitchScroll(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  saveScrollToStorage()
}

function restoreToolSwitchScroll() {
  let raw: string | null = null
  try {
    raw = sessionStorage.getItem(toolSwitchScrollKey)
  } catch {}
  if (!raw) return
  try {
    sessionStorage.removeItem(toolSwitchScrollKey)
    const saved = JSON.parse(raw) as { y?: number; sidebarTop?: number }
    const y = Number(saved.y)
    if (Number.isFinite(y) && y > 0) window.scrollTo(0, y)
    const scrollElement = document.querySelector<HTMLElement>('.sidebar-scroll')
    const top = Number(saved.sidebarTop)
    if (scrollElement && Number.isFinite(top)) scrollElement.scrollTop = top
  } catch {}
}

function revealActiveTool() {
  const scrollElement = document.querySelector<HTMLElement>('.sidebar-scroll')
  if (!scrollElement) return
  const activeItem = scrollElement.querySelector<HTMLElement>('.tool-item.active')
  if (!activeItem) return
  const itemRect = activeItem.getBoundingClientRect()
  const containerRect = scrollElement.getBoundingClientRect()
  scrollElement.scrollTop = Math.max(0, scrollElement.scrollTop + (itemRect.top - containerRect.top) - (containerRect.height - itemRect.height) / 2)
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

function attachPersistentListeners() {
  if (persistentAttached) return
  persistentAttached = true
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      if (window.innerWidth < 1024) openMobileMenu()
      window.setTimeout(() => searchInput?.focus(), 50)
    }
    if (event.key === 'Escape') closeMobileMenu()
  })
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) closeMobileMenu()
  })
  document.addEventListener('astro:before-preparation', () => {
    navigatedViaSwap = true
    saveScrollToStorage()
  })
  document.addEventListener('astro:after-swap', restoreToolSwitchScroll)
}

function initPage() {
  const body = document.body
  if (mountedBodies.has(body)) return
  mountedBodies.add(body)

  sidebar = document.querySelector<HTMLElement>('#sidebar')
  backdrop = document.querySelector<HTMLElement>('#mobile-backdrop')
  menuButton = document.querySelector<HTMLButtonElement>('#mobile-menu')
  closeButton = document.querySelector<HTMLButtonElement>('#close-sidebar')
  searchInput = document.querySelector<HTMLInputElement>('#tool-search')
  themeButton = document.querySelector<HTMLButtonElement>('#theme-toggle')

  menuButton?.addEventListener('click', () => sidebar?.classList.contains('is-open') ? closeMobileMenu() : openMobileMenu())
  closeButton?.addEventListener('click', closeMobileMenu)
  backdrop?.addEventListener('click', closeMobileMenu)
  sidebar?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMobileMenu))
  document.querySelectorAll<HTMLAnchorElement>('a[href^="/tools/"]').forEach((link) => link.addEventListener('click', saveToolSwitchScroll))
  searchInput?.addEventListener('input', (event) => filterTools((event.currentTarget as HTMLInputElement).value))
  searchInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (searchInput) searchInput.value = ''
      filterTools('')
      searchInput?.blur()
    }
  })
  themeButton?.addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark')
    localStorage.setItem('code-space-theme', isDark ? 'dark' : 'light')
    themeButton?.setAttribute('aria-label', isDark ? '切换浅色主题' : '切换深色主题')
  })

  if (!navigatedViaSwap) requestAnimationFrame(revealActiveTool)

  attachPersistentListeners()
}

document.addEventListener('astro:page-load', initPage)
initPage()