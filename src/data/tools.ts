import type { MessageKey, Translator } from '../i18n'

export type ToolCategoryId = 'developer' | 'encoding' | 'text' | 'security' | 'media' | 'market' | 'efficiency'

export type Tool = {
  id: string
  /** Category id, never a display name, so it stays stable across locales. */
  category: ToolCategoryId
  icon: string
  /** Language-neutral search tokens; all locales are merged in so search works in any language. */
  keywords: string[]
  available: boolean
}

export type LocalizedTool = Tool & { name: string; description: string }

export const toolCategories: { id: ToolCategoryId }[] = [
  { id: 'developer' },
  { id: 'encoding' },
  { id: 'text' },
  { id: 'security' },
  { id: 'media' },
  { id: 'market' },
  { id: 'efficiency' }
]

export const tools: Tool[] = [
  {
    id: 'market',
    category: 'market',
    icon: 'lucide:trending-up',
    keywords: ['kline', 'candlestick', 'ohlc', 'chart', 'trading', 'market', '虚拟交易', 'K线', '行情', '图表', '交易', 'ローソク足', 'チャート', '取引', 'K線', '走勢', '圖表'],
    available: true
  },
  {
    id: 'hash',
    category: 'security',
    icon: 'lucide:hash',
    keywords: ['md5', 'sha', 'hmac', 'hash', 'checksum', 'digest', '哈希', '摘要', '签名', '校验', '校验和', 'ダイジェスト', 'ハッシュ'],
    available: true
  },
  {
    id: 'jwt-decode',
    category: 'security',
    icon: 'lucide:key-round',
    keywords: ['jwt', 'token', 'auth', '解析', '认证', 'トークン', '解析'],
    available: true
  },
  {
    id: 'password-generator',
    category: 'security',
    icon: 'lucide:key-round',
    keywords: ['password', 'random', 'secure', '密码', '随机', '安全', 'パスワード', '生成'],
    available: true
  },
  {
    id: 'password-strength',
    category: 'security',
    icon: 'lucide:shield-check',
    keywords: ['password', 'strength', 'security', '密码', '强度', '安全', '检测', 'パスワード', '強度'],
    available: true
  },
  {
    id: 'tron-lottery',
    category: 'security',
    icon: 'lucide:party-popper',
    keywords: ['tron', 'lottery', 'trx', 'bip39', 'draw', '抽奖', '随机', '助记词', '地址', 'trl', '抽選', 'ランダム', 'ニモニック', 'アドレス', '抽獎', '亂數'],
    available: true
  },
  {
    id: 'bip39',
    category: 'security',
    icon: 'lucide:key-round',
    keywords: ['bip39', 'mnemonic', 'seed phrase', 'hd wallet', 'bip32', 'bip44', 'bitcoin', 'ethereum', 'tron', '助记词', '种子', '助記詞', 'ニモニック', 'HDウォレット', '秘密鍵', '地址', 'アドレス'],
    available: true
  },
  {
    id: 'json-format',
    category: 'encoding',
    icon: 'lucide:braces',
    keywords: ['json', 'format', 'validate', 'beautify', 'minify', '格式化', '校验', '美化', '压缩', '整形', '検証'],
    available: true
  },
  {
    id: 'base64',
    category: 'encoding',
    icon: 'lucide:binary',
    keywords: ['base', 'base32', 'base58', 'base62', 'base64', 'base85', 'ascii85', 'base91', 'encode', 'decode', '编码', 'エンコード', 'エンコード'],
    available: true
  },
  {
    id: 'url-encode',
    category: 'encoding',
    icon: 'lucide:link-2',
    keywords: ['url', 'encode', 'decode', 'uri', '链接', '查询参数', 'リンク', 'クエリ'],
    available: true
  },
  {
    id: 'html-entity',
    category: 'encoding',
    icon: 'lucide:code-xml',
    keywords: ['html', 'entity', 'escape', 'unescape', '实体', '转义', '转义还原', '特殊字符', 'エンティティ', 'エスケープ'],
    available: true
  },
  {
    id: 'unicode-escape',
    category: 'encoding',
    icon: 'lucide:scan-text',
    keywords: ['unicode', 'escape', 'code point', 'codepoint', '转义', '字符', '编码', '码点', 'ユニコード', 'コードポイント'],
    available: true
  },
  {
    id: 'query-string',
    category: 'encoding',
    icon: 'lucide:list-ordered',
    keywords: ['query', 'params', 'url', 'search params', 'query string', '参数', '解析', '查询串', 'クエリ', 'パラメータ'],
    available: true
  },
  {
    id: 'number-base',
    category: 'encoding',
    icon: 'lucide:binary',
    keywords: ['进制', 'binary', 'hex', 'octal', 'base', 'radix', '十进制', '十六进制', '八进制', 'base58', 'base62', '任意精度', '基数', '変換'],
    available: true
  },
  {
    id: 'uuid-generator',
    category: 'developer',
    icon: 'lucide:fingerprint',
    keywords: ['uuid', 'guid', 'ulid', 'batch', '唯一', '标识', '生成', '批量', '識別子', '生成'],
    available: true
  },
  {
    id: 'uuid-parser',
    category: 'developer',
    icon: 'lucide:scan-search',
    keywords: ['uuid', 'guid', 'parse', 'version', 'variant', '解析', '版本', '变体', '时间戳', '节点', '校验', '批量', '解析'],
    available: true
  },
  {
    id: 'timestamp-converter',
    category: 'developer',
    icon: 'lucide:calendar-clock',
    keywords: ['timestamp', 'unix', 'epoch', 'date', '时间戳', '时间转换', '日期', 'タイムスタンプ', '変換'],
    available: true
  },
  {
    id: 'text-case',
    category: 'text',
    icon: 'lucide:case-sensitive',
    keywords: ['case', 'camel', 'snake', 'kebab', 'pascal', '大小写', '文本', '转换', '大文字', '小文字', '変換'],
    available: true
  },
  {
    id: 'text-counter',
    category: 'text',
    icon: 'lucide:bar-chart-3',
    keywords: ['count', 'word', 'character', 'line', '字数', '统计', '文本', '字符数', '行数', '文字数', 'カウント'],
    available: true
  },
  {
    id: 'text-deduplicate',
    category: 'text',
    icon: 'lucide:list-checks',
    keywords: ['dedupe', 'unique', 'sort', 'shuffle', '去重', '文本', '重复', '清理', '排序', '打乱', '重複排除', '並べ替え'],
    available: true
  },
  {
    id: 'text-replace',
    category: 'text',
    icon: 'lucide:replace',
    keywords: ['replace', 'find', 'regex', '查找', '替换', '文本', '正则', '批量', '置換', '置換ツール'],
    available: true
  },
  {
    id: 'fullwidth-halfwidth',
    category: 'text',
    icon: 'lucide:arrow-left-right',
    keywords: ['width', 'fullwidth', 'halfwidth', 'katakana', '全角', '半角', '假名', '标点', '空格', '全角半角', '全角半角'],
    available: true
  }
]

type PlannedToolInput = Omit<Tool, 'available'>

function plannedTool(id: string, category: ToolCategoryId, icon: string, keywords: string[]): PlannedToolInput {
  return { id, category, icon, keywords }
}

export const plannedTools: Tool[] = [
  plannedTool('yaml-format', 'encoding', 'lucide:file-cog', ['yaml', 'yml', 'format', 'validate', '格式化', '校验', '整形']),
  plannedTool('xml-format', 'encoding', 'lucide:code-xml', ['xml', 'format', 'validate', '格式化', '校验', '整形']),
  plannedTool('sql-format', 'encoding', 'lucide:database', ['sql', 'format', 'query', '格式化', '数据库', '整形']),
  plannedTool('json-path', 'encoding', 'lucide:braces', ['jsonpath', 'json', 'query', '查询', '节点', 'クエリ']),
  plannedTool('json-to-typescript', 'encoding', 'lucide:file-code-2', ['json', 'typescript', 'types', '类型', '转换', '型定義']),
  plannedTool('json-schema-validator', 'encoding', 'lucide:badge-check', ['json', 'schema', 'validate', '校验', '验证', '検証']),
  plannedTool('cron-parser', 'developer', 'lucide:clock-3', ['cron', 'schedule', '定时', '任务', '表达式', 'スケジュール']),
  plannedTool('regex-tester', 'developer', 'lucide:regex', ['regex', 'regexp', 'match', 'test', '正则', '匹配', '测试', '正規表現']),
  plannedTool('markdown-preview', 'developer', 'lucide:file-text', ['markdown', 'md', 'preview', '预览', '文档', 'プレビュー']),
  plannedTool('curl-builder', 'developer', 'lucide:terminal', ['curl', 'http', 'api', '命令', 'api']),
  plannedTool('http-request', 'developer', 'lucide:globe', ['http', 'api', 'request', 'debug', '请求', '调试', 'リクエスト']),
  plannedTool('code-beautify', 'developer', 'lucide:wand-sparkles', ['code', 'format', 'beautify', '代码', '格式化', '美化', '整形']),
  plannedTool('openapi-viewer', 'developer', 'lucide:file-chart-column', ['openapi', 'swagger', 'api', '文档', '仕様書']),
  plannedTool('markdown-toc', 'developer', 'lucide:list', ['markdown', 'toc', '目录', '文档', '目次']),
  plannedTool('diff-text', 'text', 'lucide:file-diff', ['diff', 'compare', '对比', '差异', '文本', '差分']),
  plannedTool('text-sort', 'text', 'lucide:list-ordered', ['sort', 'order', '排序', '文本', '行', '並べ替え']),
  plannedTool('timezone-converter', 'efficiency', 'lucide:globe', ['timezone', 'time', '时区', '时间', '转换', 'タイムゾーン']),
  plannedTool('date-calculator', 'efficiency', 'lucide:calendar-range', ['date', 'calculator', '日期', '计算', '工作日', '日付']),
  plannedTool('scientific-calculator', 'efficiency', 'lucide:calculator', ['calculator', 'math', '计算器', '数学', '科学', '計算機']),
  plannedTool('color-converter', 'efficiency', 'lucide:palette', ['color', 'hex', 'rgb', 'hsl', '颜色', '转换', 'カラー']),
  plannedTool('contrast-checker', 'efficiency', 'lucide:contrast', ['contrast', 'accessibility', '颜色', '对比度', '无障碍', '检查', 'コントラスト']),
  plannedTool('qr-code', 'media', 'lucide:qr-code', ['qr', 'code', '二维码', '生成', '图片', 'QR']),
  plannedTool('image-compressor', 'media', 'lucide:image', ['image', 'compress', '图片', '压缩', '优化', '画像']),
  plannedTool('image-cropper', 'media', 'lucide:crop', ['image', 'crop', '图片', '裁剪', '尺寸', '切り抜き']),
  plannedTool('image-converter', 'media', 'lucide:file-image', ['image', 'format', '图片', '格式', '转换', '変換']),
  plannedTool('exif-viewer', 'media', 'lucide:scan-face', ['exif', 'metadata', 'photo', '图片', '信息', '写真']),
  plannedTool('audio-converter', 'media', 'lucide:audio-lines', ['audio', 'format', '音频', '转换', '音声']),
  plannedTool('docker-compose', 'developer', 'lucide:package', ['docker', 'compose', '容器', '配置', '設定']),
  plannedTool('nginx-config', 'developer', 'lucide:server', ['nginx', 'config', '配置', '检查', '服务器', '設定'])
].map((tool) => ({ ...tool, available: false }))

export const allTools: Tool[] = [...tools, ...plannedTools]

export function getTool(id: string) {
  return tools.find((tool) => tool.id === id)
}

/** Merges the localized name and description onto a tool record. */
export function localizeTool(tool: Tool, t: Translator): LocalizedTool {
  return {
    ...tool,
    name: t(`tools.${tool.id}.name` as MessageKey),
    description: t(`tools.${tool.id}.description` as MessageKey)
  }
}

export function localizeTools(list: readonly Tool[], t: Translator): LocalizedTool[] {
  return list.map((tool) => localizeTool(tool, t))
}

export function categoryName(id: ToolCategoryId, t: Translator): string {
  return t(`categories.${id}` as MessageKey)
}
