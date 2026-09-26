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
    id: 'hash',
    name: '哈希计算',
    description: '多算法摘要与签名',
    category: '安全与加密',
    icon: 'lucide:hash',
    keywords: ['md5', 'sha', 'hmac', '哈希', '摘要', '签名', 'hash', 'checksum', '校验'],
    available: true
  },
  {
    id: 'jwt-decode',
    name: 'JWT 解析',
    description: '解析令牌内容',
    category: '安全与加密',
    icon: 'lucide:key-round',
    keywords: ['jwt', 'token', '解析', '认证'],
    available: true
  },
  {
    id: 'password-generator',
    name: '密码生成器',
    description: '生成安全随机密码',
    category: '安全与加密',
    icon: 'lucide:key-round',
    keywords: ['密码', 'password', '随机', '安全'],
    available: true
  },
  {
    id: 'password-strength',
    name: '密码强度检测',
    description: '评估密码安全性',
    category: '安全与加密',
    icon: 'lucide:shield-check',
    keywords: ['密码', '强度', '安全', '检测'],
    available: true
  },
  {
    id: 'json-format',
    name: 'JSON 格式化',
    description: '格式化与校验 JSON',
    category: '编码与数据',
    icon: 'lucide:braces',
    keywords: ['json', '格式化', '校验', '美化', '压缩'],
    available: true
  },
  {
    id: 'base64',
    name: 'Base 编解码',
    description: '文本与 Base32、Base58、Base62、标准 Base64、Ascii85、Base91 转换',
    category: '编码与数据',
    icon: 'lucide:binary',
    keywords: ['base', 'base32', 'base58', 'base62', 'base64', 'base85', 'ascii85', 'base91', 'encode', 'decode', '编码'],
    available: true
  },
  {
    id: 'url-encode',
    name: 'URL 编解码',
    description: '处理链接与查询参数',
    category: '编码与数据',
    icon: 'lucide:link-2',
    keywords: ['url', 'encode', 'decode', '链接', '查询参数'],
    available: true
  },
  {
    id: 'html-entity',
    name: 'HTML 实体转换',
    description: '转义与还原 HTML 字符',
    category: '编码与数据',
    icon: 'lucide:code-xml',
    keywords: ['html', '实体', '转义', 'encode', '转义还原', 'entity', '特殊字符'],
    available: true
  },
  {
    id: 'unicode-escape',
    name: 'Unicode 转义',
    description: '字符编码、转义与码点查询',
    category: '编码与数据',
    icon: 'lucide:scan-text',
    keywords: ['unicode', '转义', '字符', '编码', '码点', 'escape', 'code point'],
    available: true
  },
  {
    id: 'query-string',
    name: 'Query String 解析',
    description: '逐条编辑查询参数并实时同步查询串',
    category: '编码与数据',
    icon: 'lucide:list-ordered',
    keywords: ['query', '参数', 'url', '解析', 'query string', 'search params', '查询串'],
    available: true
  },
  {
    id: 'number-base',
    name: '进制转换',
    description: '二进制与十进制互转',
    category: '编码与数据',
    icon: 'lucide:binary',
    keywords: ['进制', 'binary', 'hex', '转换', 'base', 'radix', '十进制', '十六进制'],
    available: true
  },
  {
    id: 'uuid-generator',
    name: 'UUID 生成器',
    description: '批量生成 v1 至 v8 唯一标识',
    category: '开发者工具',
    icon: 'lucide:fingerprint',
    keywords: ['uuid', 'guid', '唯一', '标识', 'uuid v4', 'uuid v7', 'ulid', '生成', '批量'],
    available: true
  },
  {
    id: 'uuid-parser',
    name: 'UUID 解析',
    description: '拆解版本、变体与时间',
    category: '开发者工具',
    icon: 'lucide:scan-search',
    keywords: ['uuid', 'guid', '解析', '版本', '变体', '时间戳', '节点', '校验', '批量'],
    available: true
  },
  {
    id: 'timestamp-converter',
    name: '时间戳转换',
    description: 'Unix 时间与日期互转',
    category: '开发者工具',
    icon: 'lucide:calendar-clock',
    keywords: ['时间戳', 'timestamp', 'unix', '日期', 'epoch', '时间转换'],
    available: true
  },
  {
    id: 'text-case',
    name: '大小写转换',
    description: '切换文本大小写与命名风格',
    category: '文本处理',
    icon: 'lucide:case-sensitive',
    keywords: ['大小写', '文本', '转换', 'case', 'camel', 'snake', 'kebab', 'pascal'],
    available: true
  },
  {
    id: 'text-counter',
    name: '文本统计',
    description: '统计字数、行数和词数',
    category: '文本处理',
    icon: 'lucide:bar-chart-3',
    keywords: ['字数', '统计', '文本', 'word', '字符数', '行数', 'count'],
    available: true
  },
  {
    id: 'text-deduplicate',
    name: '文本去重排序',
    description: '删除重复行并排序文本',
    category: '文本处理',
    icon: 'lucide:list-checks',
    keywords: ['去重', '文本', '重复', '清理', '排序', 'sort', 'unique', '打乱'],
    available: true
  },
  {
    id: 'text-replace',
    name: '查找替换',
    description: '批量替换文本内容',
    category: '文本处理',
    icon: 'lucide:replace',
    keywords: ['查找', '替换', '文本', 'replace', '正则', 'regex', '批量'],
    available: true
  },
  {
    id: 'fullwidth-halfwidth',
    name: '全角半角转换',
    description: '在中文全角与西文半角字符之间转换',
    category: '文本处理',
    icon: 'lucide:arrow-left-right',
    keywords: ['全角', '半角', '全角半角', 'width', 'katakana', '假名', '标点', '空格', '转换'],
    available: true
  }
]

export const toolCategories = [
  { id: 'developer', name: '开发者工具' },
  { id: 'encoding', name: '编码与数据' },
  { id: 'text', name: '文本处理' },
  { id: 'security', name: '安全与加密' },
  { id: 'media', name: '媒体处理' },
  { id: 'efficiency', name: '效率工具' }
]

type PlannedToolInput = Omit<Tool, 'category' | 'available'>

function plannedTool(id: string, name: string, description: string, icon: string, keywords: string[]): PlannedToolInput {
  return { id, name, description, icon, keywords }
}

const plannedToolCategories = new Map<string, string>([
  ...['yaml-format', 'xml-format', 'sql-format', 'json-path', 'json-to-typescript', 'json-schema-validator'].map((id): [string, string] => [id, '编码与数据']),
  ...['cron-parser', 'regex-tester', 'markdown-preview', 'curl-builder', 'http-request', 'code-beautify', 'openapi-viewer', 'markdown-toc', 'docker-compose', 'nginx-config'].map((id): [string, string] => [id, '开发者工具']),
  ...['diff-text', 'random-string', 'text-sort'].map((id): [string, string] => [id, '文本处理']),
  ...['timezone-converter', 'date-calculator', 'scientific-calculator', 'contrast-checker', 'color-converter'].map((id): [string, string] => [id, '效率工具']),
  ...['image-compressor', 'image-cropper', 'image-converter', 'exif-viewer', 'audio-converter', 'qr-code'].map((id): [string, string] => [id, '媒体处理'])
])

const plannedToolList: PlannedToolInput[] = [
  plannedTool('yaml-format', 'YAML 格式化', '校验与整理 YAML', 'lucide:file-cog', ['yaml', 'yml', '格式化', '校验']),
  plannedTool('xml-format', 'XML 格式化', '格式化与校验 XML', 'lucide:code-xml', ['xml', '格式化', '校验']),
  plannedTool('sql-format', 'SQL 格式化', '整理 SQL 查询语句', 'lucide:database', ['sql', '格式化', '数据库', 'query']),
  plannedTool('cron-parser', 'Cron 表达式解析', '解释定时任务表达式', 'lucide:clock-3', ['cron', '定时', '任务', '表达式']),
  plannedTool('regex-tester', '正则表达式测试', '匹配、分组与替换', 'lucide:regex', ['regex', '正则', '匹配', '测试']),
  plannedTool('diff-text', '文本 Diff 比较', '对比两段文本差异', 'lucide:file-diff', ['diff', '对比', '差异', '文本']),
  plannedTool('markdown-preview', 'Markdown 预览', '实时预览 Markdown', 'lucide:file-text', ['markdown', 'md', '预览', '文档']),
  plannedTool('json-path', 'JSONPath 查询', '定位 JSON 数据节点', 'lucide:braces', ['jsonpath', 'json', '查询', '节点']),
  plannedTool('curl-builder', 'cURL 生成器', '从参数生成 cURL 命令', 'lucide:terminal', ['curl', 'http', '命令', 'api']),
  plannedTool('http-request', 'HTTP 请求测试', '发送与调试 HTTP 请求', 'lucide:globe', ['http', 'api', '请求', '调试']),
  plannedTool('code-beautify', '代码格式化', '统一代码缩进与排版', 'lucide:wand-sparkles', ['代码', '格式化', '美化', 'beautify']),
  plannedTool('json-to-typescript', 'JSON 转 TypeScript', '从样例生成类型定义', 'lucide:file-code-2', ['json', 'typescript', '类型', '转换']),
  plannedTool('openapi-viewer', 'OpenAPI 查看器', '阅读和检索接口文档', 'lucide:file-chart-column', ['openapi', 'swagger', 'api', '文档']),
  plannedTool('json-schema-validator', 'JSON Schema 校验', '验证数据结构与约束', 'lucide:badge-check', ['json', 'schema', '校验', '验证']),
  plannedTool('markdown-toc', 'Markdown 目录生成', '生成文档标题目录', 'lucide:list', ['markdown', '目录', 'toc', '文档']),
  plannedTool('random-string', '随机字符串生成', '按规则生成随机文本', 'lucide:shuffle', ['随机', '字符串', 'random', '生成']),
  plannedTool('timezone-converter', '时区转换', '跨时区转换时间', 'lucide:globe', ['时区', 'timezone', '时间', '转换']),
  plannedTool('date-calculator', '日期计算器', '计算日期差与加减天数', 'lucide:calendar-range', ['日期', 'date', '计算', '工作日']),
  plannedTool('scientific-calculator', '科学计算器', '计算函数与表达式', 'lucide:calculator', ['计算器', '数学', '科学', 'calculator']),
  plannedTool('text-sort', '文本排序', '按规则排列文本行', 'lucide:list-ordered', ['排序', '文本', 'sort', '行']),
  plannedTool('color-converter', '颜色转换', '转换 HEX、RGB 与 HSL', 'lucide:palette', ['颜色', 'hex', 'rgb', 'hsl']),
  plannedTool('contrast-checker', '对比度检查', '检查文字颜色可读性', 'lucide:contrast', ['颜色', '对比度', '无障碍', '检查']),
  plannedTool('qr-code', '二维码生成', '生成与下载二维码', 'lucide:qr-code', ['二维码', 'qr', '生成', '图片']),
  plannedTool('image-compressor', '图片压缩', '压缩图片并减小体积', 'lucide:image', ['图片', '压缩', 'image', '优化']),
  plannedTool('image-cropper', '图片裁剪', '按比例裁剪图片', 'lucide:crop', ['图片', '裁剪', 'image', '尺寸']),
  plannedTool('image-converter', '图片格式转换', '转换常见图片格式', 'lucide:file-image', ['图片', '格式', '转换', 'image']),
  plannedTool('exif-viewer', 'EXIF 信息查看', '读取图片拍摄信息', 'lucide:scan-face', ['exif', '图片', '信息', 'metadata']),
  plannedTool('audio-converter', '音频格式转换', '转换音频文件格式', 'lucide:audio-lines', ['音频', 'audio', '格式', '转换']),
  plannedTool('docker-compose', 'Docker Compose 格式化', '校验与整理容器配置', 'lucide:package', ['docker', 'compose', '容器', '配置']),
  plannedTool('nginx-config', 'Nginx 配置检查', '检查常见配置问题', 'lucide:server', ['nginx', '配置', '检查', '服务器'])
]

export const plannedTools: Tool[] = plannedToolList.map((tool) => ({
  ...tool,
  category: plannedToolCategories.get(tool.id) ?? '效率工具',
  available: false
}))

export const allTools: Tool[] = [...tools, ...plannedTools]

export function getTool(id: string) {
  return tools.find((tool) => tool.id === id)
}
