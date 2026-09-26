import { localizeTools, tools } from '../data/tools'
import { pickFavoriteTool, rankByUsage } from '../lib/usage-ranking'
import { currentIntlLocale, currentTranslator } from '../i18n/client'
import type { MessageKey } from '../i18n'
import { getUsageSnapshot } from './usage'

type Fortune = { score: number; labelKey: MessageKey; messageKey: MessageKey }

/** Scores stay fixed so the daily draw is deterministic per day; the wording is localized. */
const fortunes: Fortune[] = [
  { score: 92, labelKey: 'fortunes.online.label', messageKey: 'fortunes.online.message' },
  { score: 78, labelKey: 'fortunes.steady.label', messageKey: 'fortunes.steady.message' },
  { score: 64, labelKey: 'fortunes.stutter.label', messageKey: 'fortunes.stutter.message' },
  { score: 88, labelKey: 'fortunes.inspired.label', messageKey: 'fortunes.inspired.message' },
  { score: 71, labelKey: 'fortunes.focus.label', messageKey: 'fortunes.focus.message' },
  { score: 96, labelKey: 'fortunes.smooth.label', messageKey: 'fortunes.smooth.message' }
]

const fortuneStorageKey = 'code-space-daily-fortune'
const todayKey = () => new Date().toLocaleDateString('sv-SE')
const mountedRoots = new WeakSet<HTMLElement>()

function initDashboard() {
  const root = document.querySelector<HTMLElement>('.dashboard-workspace')
  if (!root || mountedRoots.has(root)) return
  mountedRoots.add(root)

  const score = document.querySelector<HTMLElement>('#fortune-score')
  const meter = document.querySelector<HTMLElement>('#fortune-meter')
  const label = document.querySelector<HTMLElement>('#fortune-label')
  const message = document.querySelector<HTMLElement>('#fortune-message')
  const drawButton = document.querySelector<HTMLButtonElement>('#draw-fortune')
  const totalUsage = document.querySelector<HTMLElement>('#total-usage')
  const todayUsage = document.querySelector<HTMLElement>('#today-usage')
  const favoriteTool = document.querySelector<HTMLElement>('#favorite-tool')
  const favoriteCount = document.querySelector<HTMLElement>('#favorite-count')
  const activityCount = document.querySelector<HTMLElement>('#activity-count')
  const activityEmpty = document.querySelector<HTMLElement>('#activity-empty')
  const activityList = document.querySelector<HTMLOListElement>('#activity-list')
  const usageBars = document.querySelector<HTMLElement>('#usage-bars')
  const usageEmpty = document.querySelector<HTMLElement>('#usage-empty')
  const topLimit = 5

  function getSavedFortune() {
    const date = todayKey()
    try {
      const saved = JSON.parse(localStorage.getItem(fortuneStorageKey) ?? 'null') as { date?: string; index?: number } | null
      if (saved?.date === date && typeof saved.index === 'number' && saved.index >= 0 && saved.index < fortunes.length) return { date, index: saved.index }
    } catch {}
    return undefined
  }

  function renderFortune(fortune: Fortune | undefined) {
    const t = currentTranslator()
    if (drawButton) {
      drawButton.disabled = Boolean(fortune)
      drawButton.textContent = fortune ? t('home.fortune.drawn') : t('home.fortune.draw')
    }
    if (!fortune) {
      if (score) score.textContent = '--'
      if (meter) meter.style.width = '0%'
      if (label) label.textContent = t('home.fortune.idle')
      if (message) message.textContent = t('home.fortune.idleMessage')
      return
    }
    if (score) score.textContent = String(fortune.score)
    if (meter) meter.style.width = `${fortune.score}%`
    if (label) label.textContent = t(fortune.labelKey)
    if (message) message.textContent = t(fortune.messageKey)
  }

  function drawFortune() {
    if (getSavedFortune()) return
    const index = Math.floor(Math.random() * fortunes.length)
    try {
      localStorage.setItem(fortuneStorageKey, JSON.stringify({ date: todayKey(), index }))
    } catch {}
    renderFortune(fortunes[index])
  }

  function renderUsage() {
    const t = currentTranslator()
    const localized = localizeTools(tools, t)
    const usage = getUsageSnapshot()
    const top = rankByUsage(tools, usage.byTool, topLimit)
    const maxCount = Math.max(...top.map((item) => item.count), 1)
    const favorite = pickFavoriteTool(tools, usage.byTool) ?? tools[0]
    const favoriteName = localized.find((item) => item.id === favorite.id)?.name ?? favorite.id

    if (totalUsage) totalUsage.textContent = String(usage.total)
    if (todayUsage) todayUsage.textContent = String(usage.today)
    if (favoriteTool) favoriteTool.textContent = usage.total ? favoriteName : t('home.usage.none')
    if (favoriteCount) favoriteCount.textContent = t('home.usage.times', { count: usage.byTool[favorite.id] ?? 0 })

    const topIds = new Set(top.map((item) => item.tool.id))
    document.querySelectorAll<HTMLElement>('.usage-bar-row').forEach((row) => {
      const toolId = row.dataset.toolId ?? ''
      const entry = top.find((item) => item.tool.id === toolId)
      row.hidden = !topIds.has(toolId)
      if (!entry) return
      const rowCount = row.querySelector<HTMLElement>('[data-tool-count]')
      const bar = row.querySelector<HTMLElement>('[data-tool-bar]')
      if (rowCount) rowCount.textContent = String(entry.count)
      if (bar) bar.style.width = `${(entry.count / maxCount) * 100}%`
    })

    if (usageBars) {
      for (const item of top) {
        const row = usageBars.querySelector<HTMLElement>(`.usage-bar-row[data-tool-id="${item.tool.id}"]`)
        if (row) usageBars.append(row)
      }
      usageBars.hidden = top.every((item) => item.count === 0)
    }
    if (usageEmpty) usageEmpty.hidden = top.some((item) => item.count > 0)

    if (activityCount) activityCount.textContent = t('home.activity.count', { count: usage.recent.length })
    if (activityEmpty) activityEmpty.hidden = usage.recent.length > 0
    if (activityList) {
      activityList.hidden = usage.recent.length === 0
      activityList.innerHTML = usage.recent.map((item) => {
        const tool = localized.find((candidate) => candidate.id === item.id)
        const time = new Intl.DateTimeFormat(currentIntlLocale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(item.at))
        return `<li><span class="activity-icon"><svg><use href="#icon-hash"></use></svg></span><span><strong>${tool?.name ?? item.id}</strong><small>${t('home.activity.usedAt', { time })}</small></span></li>`
      }).join('')
    }
  }

  drawButton?.addEventListener('click', drawFortune)
  const savedFortune = getSavedFortune()
  renderFortune(savedFortune === undefined ? undefined : fortunes[savedFortune.index])
  renderUsage()
}

document.addEventListener('astro:page-load', initDashboard)
initDashboard()