import { currentTranslator } from '../i18n/client'
import { readValue, whenStorageReady, writeValue } from '../lib/storage'
import { storageKeys } from '../lib/storage-schema'

const storageKey = storageKeys.favorites
const mountedCatalogs = new WeakSet<HTMLElement>()

function getFavorites() {
  try {
    const stored = JSON.parse(readValue(storageKey) ?? '[]')
    return new Set(Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string') : [])
  } catch {
    return new Set<string>()
  }
}

function saveFavorites(favorites: Set<string>) {
  writeValue(storageKey, JSON.stringify([...favorites]))
}

function initCatalog() {
  const catalog = document.querySelector<HTMLElement>('[data-catalog]')
  if (!catalog || mountedCatalogs.has(catalog)) return
  mountedCatalogs.add(catalog)

  const searchInput = catalog.querySelector<HTMLInputElement>('#catalog-search-input')
  const cards = Array.from(catalog.querySelectorAll<HTMLElement>('[data-tool-card]'))
  const filters = Array.from(catalog.querySelectorAll<HTMLButtonElement>('[data-category]'))
  const empty = catalog.querySelector<HTMLElement>('#catalog-empty')
  const count = catalog.querySelector<HTMLElement>('#catalog-count')
  const favoritesOnly = catalog.dataset.favoritesOnly === 'true'
  const availableCount = cards.filter((card) => !card.classList.contains('planned')).length
  const plannedCount = cards.length - availableCount
  // The table takes a moment to open, so the stars are painted once it has.
  let favorites = getFavorites()
  whenStorageReady(() => {
    favorites = getFavorites()
    syncFavoriteState()
    applyFilters()
  })

  function syncFavoriteState() {
    cards.forEach((card) => {
      const favorite = favorites.has(card.dataset.toolId ?? '')
      card.classList.toggle('is-favorite', favorite)
      const button = card.querySelector<HTMLButtonElement>('[data-favorite]')
      if (!button) return
      button.setAttribute('aria-pressed', String(favorite))
      const t = currentTranslator()
      const action = favorite ? t('catalog.favoriteAction.remove') : t('catalog.favoriteAction.add')
      button.setAttribute('aria-label', `${action}${card.querySelector('strong')?.textContent ?? ''}`)
    })
  }

  function applyFilters() {
    const keyword = searchInput?.value.trim().toLocaleLowerCase() ?? ''
    const selectedCategory = filters.find((filter) => filter.classList.contains('active'))?.dataset.category ?? 'all'
    let visibleCount = 0
    cards.forEach((card) => {
      const searchText = card.dataset.toolSearch?.toLocaleLowerCase() ?? ''
      const categoryMatch = selectedCategory === 'all' || card.dataset.toolCategory === selectedCategory
      const favoriteMatch = !favoritesOnly || favorites.has(card.dataset.toolId ?? '')
      const keywordMatch = !keyword || searchText.includes(keyword)
      const visible = categoryMatch && favoriteMatch && keywordMatch
      card.hidden = !visible
      if (visible) visibleCount += 1
    })
    if (empty) empty.hidden = visibleCount > 0
    if (count) {
      const t = currentTranslator()
      if (favoritesOnly) count.textContent = t('catalog.favoritesCount', { count: visibleCount })
      else if (!keyword && selectedCategory === 'all')
        count.textContent = t('catalog.count', { available: availableCount, planned: plannedCount })
      else count.textContent = t('catalog.resultsCount', { count: visibleCount })
    }
  }

  catalog.addEventListener('click', (event) => {
    const favoriteButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-favorite]')
    if (favoriteButton) {
      const card = favoriteButton.closest<HTMLElement>('[data-tool-card]')
      const toolId = card?.dataset.toolId
      if (!toolId) return
      if (favorites.has(toolId)) favorites.delete(toolId)
      else favorites.add(toolId)
      saveFavorites(favorites)
      syncFavoriteState()
      applyFilters()
      return
    }
    const filter = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-category]')
    if (!filter) return
    filters.forEach((item) => item.classList.toggle('active', item === filter))
    applyFilters()
  })

  searchInput?.addEventListener('input', applyFilters)
  syncFavoriteState()
  applyFilters()
}

document.addEventListener('astro:page-load', initCatalog)
initCatalog()