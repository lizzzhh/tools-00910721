export type UsageSnapshot = {
  total: number
  today: number
  byTool: Record<string, number>
  recent: { id: string; at: string }[]
}

type StoredUsage = UsageSnapshot & {
  date: string
}

const storageKey = 'code-space-usage'
const todayKey = () => new Date().toLocaleDateString('sv-SE')

const emptyUsage = (): StoredUsage => ({
  total: 0,
  today: 0,
  byTool: {},
  recent: [],
  date: todayKey()
})

function readUsage(): StoredUsage {
  if (typeof localStorage === 'undefined') return emptyUsage()
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<StoredUsage>
    const currentDate = todayKey()
    return {
      total: Number(stored.total) || 0,
      today: stored.date === currentDate ? Number(stored.today) || 0 : 0,
      byTool: stored.byTool && typeof stored.byTool === 'object' ? stored.byTool : {},
      recent: Array.isArray(stored.recent) ? stored.recent : [],
      date: currentDate
    }
  } catch {
    return emptyUsage()
  }
}

function writeUsage(usage: StoredUsage) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(storageKey, JSON.stringify(usage))
  } catch {}
}

export function recordToolUsage(toolId: string) {
  const usage = readUsage()
  usage.total += 1
  usage.today += 1
  usage.byTool[toolId] = (usage.byTool[toolId] ?? 0) + 1
  usage.recent = [{ id: toolId, at: new Date().toISOString() }, ...usage.recent.filter((item) => item.id !== toolId)].slice(0, 6)
  writeUsage(usage)
}

export function getUsageSnapshot(): UsageSnapshot {
  const { total, today, byTool, recent } = readUsage()
  return { total, today, byTool, recent }
}
