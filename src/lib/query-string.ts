export type QueryEntry = {
  key: string
  value: string
  hasValue: boolean
}

export type QueryResult =
  | {
      ok: true
      output: string
      entries: QueryEntry[]
      duplicateKeys: number
      count: number
    }
  | {
      ok: false
      message: string
      position?: number
    }

export type QueryParseOptions = {
  keepHash?: boolean
  keepEmpty?: boolean
  sortKeys?: boolean
}

export type QueryBuildOptions = {
  encode?: boolean
  encodeSpaceAsPlus?: boolean
  keepEmpty?: boolean
  sortKeys?: boolean
}

function decodeComponent(value: string) {
  const normalized = value.replace(/\+/g, ' ')
  try {
    return decodeURIComponent(normalized)
  } catch {
    return null
  }
}

function normalizeInput(input: string) {
  let value = input.trim()
  const hashIndex = value.indexOf('#')
  if (hashIndex >= 0) value = value.slice(0, hashIndex)
  if (value.startsWith('?')) value = value.slice(1)
  return value
}

function splitParts(body: string) {
  const parts: { value: string; offset: number }[] = []
  let start = 0

  for (let index = 0; index <= body.length; index += 1) {
    if (index === body.length || body[index] === '&') {
      if (index > start) parts.push({ value: body.slice(start, index), offset: start })
      start = index + 1
    }
  }

  return parts
}

export function parseQueryString(input: string, options: QueryParseOptions = {}): QueryResult {
  const { keepHash = false, keepEmpty = true, sortKeys = false } = options
  const raw = input.trim()
  const hashIndex = raw.indexOf('#')
  const hash = hashIndex >= 0 ? raw.slice(hashIndex + 1) : ''
  const body = normalizeInput(raw)
  const entries: QueryEntry[] = []

  for (const [index, part] of splitParts(body).entries()) {
    const equalsIndex = part.value.indexOf('=')
    const rawKey = equalsIndex >= 0 ? part.value.slice(0, equalsIndex) : part.value
    const rawValue = equalsIndex >= 0 ? part.value.slice(equalsIndex + 1) : undefined
    const key = decodeComponent(rawKey)
    if (key === null) {
      return { ok: false, message: `第 ${index + 1} 个参数的键不是合法的百分号编码`, position: part.offset + 1 }
    }
    let value = ''
    let hasValue = false
    if (rawValue !== undefined) {
      const decoded = decodeComponent(rawValue)
      if (decoded === null) {
        return { ok: false, message: `第 ${index + 1} 个参数的值不是合法的百分号编码`, position: part.offset + 1 }
      }
      value = decoded
      hasValue = true
    }
    if (!hasValue && !keepEmpty) continue
    entries.push({ key, value, hasValue })
  }

  if (sortKeys) {
    entries.sort((left, right) => (left.key === right.key ? 0 : left.key < right.key ? -1 : 1))
  }

  const duplicateKeys = entries.length - new Set(entries.map((entry) => entry.key)).size
  const json = JSON.stringify(entries, null, 2)
  const output = keepHash && hash ? `${json}\n\n# ${hash}` : json

  return { ok: true, output, entries, duplicateKeys, count: entries.length }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function collectEntries(value: unknown): QueryEntry[] | undefined {
  if (Array.isArray(value)) {
    const entries: QueryEntry[] = []
    for (const item of value) {
      if (typeof item === 'string') {
        const equalsIndex = item.indexOf('=')
        entries.push({ key: equalsIndex >= 0 ? item.slice(0, equalsIndex) : item, value: equalsIndex >= 0 ? item.slice(equalsIndex + 1) : '', hasValue: equalsIndex >= 0 })
        continue
      }
      if (isPlainObject(item) && Object.keys(item).length === 1) {
        const [key, entryValue] = Object.entries(item)[0]
        entries.push({ key, value: entryValue === null ? '' : String(entryValue), hasValue: entryValue !== null })
        continue
      }
      return undefined
    }
    return entries
  }

  if (isPlainObject(value)) {
    return Object.entries(value).map(([key, entryValue]) => ({
      key,
      value: entryValue === null ? '' : typeof entryValue === 'object' ? JSON.stringify(entryValue) : String(entryValue),
      hasValue: true
    }))
  }

  return undefined
}

export function buildQueryString(input: string, options: QueryBuildOptions = {}): QueryResult {
  const { encode = true, encodeSpaceAsPlus = false, keepEmpty = true, sortKeys = false } = options

  let parsed: unknown
  try {
    parsed = JSON.parse(input)
  } catch {
    return { ok: false, message: '输入不是合法的 JSON，无法生成查询字符串' }
  }

  const entries = collectEntries(parsed)
  if (!entries) {
    return { ok: false, message: '仅支持 JSON 对象、键值对数组或字符串数组' }
  }

  const usable = sortKeys ? [...entries].sort((left, right) => (left.key === right.key ? 0 : left.key < right.key ? -1 : 1)) : entries

  const parts: string[] = []
  for (const entry of usable) {
    if (!entry.hasValue && !keepEmpty) continue
    const key = encode ? encodeURIComponent(entry.key) : entry.key
    const encodedValue = encode ? encodeURIComponent(entry.value) : entry.value
    const value = encodeSpaceAsPlus ? encodedValue.replace(encode ? /%20/g : / /g, '+') : encodedValue
    parts.push(entry.hasValue ? `${key}=${value}` : key)
  }

  const output = parts.join('&')
  const duplicateKeys = usable.length - new Set(usable.map((entry) => entry.key)).size

  return { ok: true, output, entries: usable, duplicateKeys, count: usable.length }
}
