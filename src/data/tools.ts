export type Tool = {
  id: string
  name: string
  description: string
  category: string
  icon: string
  keywords: string[]
  available: boolean
}

export const tools: Tool[] = [
  {
    id: 'md5',
    name: 'MD5 计算',
    description: '字符串与文件摘要',
    category: '常用工具',
    icon: 'lucide:hash',
    keywords: ['md5', '哈希', '摘要', 'checksum'],
    available: true
  }
]

export const toolCategories = [
  { id: 'common', name: '常用', tools: ['md5'] },
  { id: 'developer', name: '开发者工具', tools: [] },
  { id: 'coming', name: '即将上线', tools: [] }
]

export const plannedTools: Tool[] = [
  {
    id: 'json-format',
    name: 'JSON 格式化',
    description: '格式化与校验',
    category: '即将上线',
    icon: 'lucide:braces',
    keywords: ['json', '格式化', '校验'],
    available: false
  },
  {
    id: 'base64',
    name: 'Base64 编解码',
    description: '文本与 URL 编码',
    category: '即将上线',
    icon: 'lucide:binary',
    keywords: ['base64', 'encode', 'decode'],
    available: false
  }
]

export function getTool(id: string) {
  return tools.find((tool) => tool.id === id)
}
