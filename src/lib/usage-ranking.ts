export type RankedTool<T> = {
  tool: T
  count: number
  rank: number
}

export function rankByUsage<T extends { id: string }>(tools: T[], counts: Record<string, number>, limit = 5): RankedTool<T>[] {
  return tools
    .map((tool, index) => ({ tool, count: counts[tool.id] ?? 0, index }))
    .sort((left, right) => right.count - left.count || left.index - right.index)
    .slice(0, Math.max(0, limit))
    .map((entry, index) => ({ tool: entry.tool, count: entry.count, rank: index + 1 }))
}

export function pickFavoriteTool<T extends { id: string }>(tools: T[], counts: Record<string, number>): T | undefined {
  return rankByUsage(tools, counts, 1)[0]?.tool
}
