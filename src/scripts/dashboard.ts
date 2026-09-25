import { tools } from '../data/tools'
import { getUsageSnapshot } from './usage'

type Fortune = (typeof fortunes)[number]

const fortunes = [
  { score: 92, label: '状态在线', message: '今天很适合把复杂问题拆小，逐个击破。' },
  { score: 78, label: '稳步推进', message: '不追求灵感，先让计划里的下一格完成。' },
  { score: 64, label: '偶尔卡顿', message: '遇到难题时先喝口水，答案可能就在下一步。' },
  { score: 88, label: '灵感在线', message: '适合清理 TODO，也许一次重构就能省下半天。' },
  { score: 71, label: '专注模式', message: '关掉通知，把最重要的任务放在第一屏。' },
  { score: 96, label: '超级顺滑', message: '今天的手感和思路都很好，适合解决历史遗留问题。' }
] as const

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
const fortuneStorageKey = 'code-space-daily-fortune'
const todayKey = () => new Date().toLocaleDateString('sv-SE')

function getSavedFortune() {
  const date = todayKey()
  try {
    const saved = JSON.parse(localStorage.getItem(fortuneStorageKey) ?? 'null') as { date?: string; index?: number } | null
    if (saved?.date === date && typeof saved.index === 'number' && saved.index >= 0 && saved.index < fortunes.length) return { date, index: saved.index }
  } catch {}
  return undefined
}

function renderFortune(fortune: Fortune | undefined) {
  if (drawButton) {
    drawButton.disabled = Boolean(fortune)
    drawButton.textContent = fortune ? '今日已解锁' : '抽取今日运势'
  }
  if (!fortune) {
    if (score) score.textContent = '--'
    if (meter) meter.style.width = '0%'
    if (label) label.textContent = '等待今日签到'
    if (message) message.textContent = '每天可以抽取一次今日运势。'
    return
  }
  if (score) score.textContent = String(fortune.score)
  if (meter) meter.style.width = `${fortune.score}%`
  if (label) label.textContent = fortune.label
  if (message) message.textContent = fortune.message
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
  const usage = getUsageSnapshot()
  const maxCount = Math.max(...tools.map((tool) => usage.byTool[tool.id] ?? 0), 1)
  const favorite = tools.reduce((current, tool) => {
    const count = usage.byTool[tool.id] ?? 0
    return count > (usage.byTool[current.id] ?? 0) && count > 0 ? tool : current
  }, tools[0])

  if (totalUsage) totalUsage.textContent = String(usage.total)
  if (todayUsage) todayUsage.textContent = String(usage.today)
  if (favoriteTool) favoriteTool.textContent = usage.total ? favorite.name : '暂无'
  if (favoriteCount) favoriteCount.textContent = usage.byTool[favorite.id] ? `${usage.byTool[favorite.id]} 次` : '0 次'

  document.querySelectorAll<HTMLElement>('.usage-bar-row').forEach((row) => {
    const toolId = row.dataset.toolId ?? ''
    const count = usage.byTool[toolId] ?? 0
    const rowCount = row.querySelector<HTMLElement>('[data-tool-count]')
    const bar = row.querySelector<HTMLElement>('[data-tool-bar]')
    if (rowCount) rowCount.textContent = String(count)
    if (bar) bar.style.width = `${(count / maxCount) * 100}%`
  })

  if (activityCount) activityCount.textContent = `${usage.recent.length} 条记录`
  if (activityEmpty) activityEmpty.hidden = usage.recent.length > 0
  if (activityList) {
    activityList.hidden = usage.recent.length === 0
    activityList.innerHTML = usage.recent.map((item) => {
      const tool = tools.find((candidate) => candidate.id === item.id)
      const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.at))
      return `<li><span class="activity-icon"><svg><use href="#icon-hash"></use></svg></span><span><strong>${tool?.name ?? item.id}</strong><small>${time} 使用</small></span></li>`
    }).join('')
  }
}

drawButton?.addEventListener('click', drawFortune)
const savedFortune = getSavedFortune()
renderFortune(savedFortune === undefined ? undefined : fortunes[savedFortune.index])
renderUsage()
