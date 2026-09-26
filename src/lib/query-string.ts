/** Codes the UI maps to `toolUi.query-string.errors.*`. */
export type QueryErrorCode = 'badKeyEncoding' | 'badValueEncoding'

export type QueryErrorParams = { index: number }

export type QueryEntry = {
  key: string
  value: string
  hasValue: boolean
}

export type QueryParseResult =
  | {
      ok: true
      entries: QueryEntry[]
      base: string
      hash: string
      duplicateKeys: number
      count: number
    }
  | {
      ok: false
      code: QueryErrorCode
      params?: QueryErrorParams
      position?: number
    }

export type QueryFilterOptions = {
  includeEmpty?: boolean
  sortKeys?: boolean
}

export type QueryBuildOptions = QueryFilterOptions & {
  encode?: boolean
  encodeSpaceAsPlus?: boolean
  leadingQuestionMark?: boolean
  appendHash?: boolean
  hash?: string
}

function decodeComponent(value: string) {
  const normalized = value.replace(/\+/g, ' ')
  try {
    return decodeURIComponent(normalized)
  } catch {
    return null
  }
}

// A bare string without "?" is only treated as a query string when it cannot be
// a URL: any "=" means a pair, and a lone token only counts when it has no
// scheme, path or dotted-host shape.
function looksLikeUrl(value: string) {
  if (value.includes('://') || value.startsWith('//')) return true
  return !value.includes('=') && /[./:]/.test(value)
}

function splitQuery(input: string) {
  const raw = input.trim()
  const questionIndex = raw.indexOf('?')

  if (questionIndex >= 0) {
    const afterQuestion = raw.slice(questionIndex + 1)
    const hashIndex = afterQuestion.indexOf('#')
    return {
      base: raw.slice(0, questionIndex),
      body: hashIndex >= 0 ? afterQuestion.slice(0, hashIndex) : afterQuestion,
      bodyStart: questionIndex + 1,
      hash: hashIndex >= 0 ? afterQuestion.slice(hashIndex + 1) : ''
    }
  }

  const hashIndex = raw.indexOf('#')
  const head = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw
  return {
    base: '',
    body: looksLikeUrl(head) ? '' : head,
    bodyStart: 0,
    hash: hashIndex >= 0 ? raw.slice(hashIndex + 1) : ''
  }
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

function byKey(left: QueryEntry, right: QueryEntry) {
  return left.key === right.key ? 0 : left.key < right.key ? -1 : 1
}

export function countDuplicateKeys(entries: QueryEntry[]) {
  return entries.length - new Set(entries.map((entry) => entry.key)).size
}

export function parseQueryString(input: string): QueryParseResult {
  const { base, body, bodyStart, hash } = splitQuery(input)
  const entries: QueryEntry[] = []

  for (const [index, part] of splitParts(body).entries()) {
    const equalsIndex = part.value.indexOf('=')
    const rawKey = equalsIndex >= 0 ? part.value.slice(0, equalsIndex) : part.value
    const rawValue = equalsIndex >= 0 ? part.value.slice(equalsIndex + 1) : undefined
    const key = decodeComponent(rawKey)
    if (key === null) {
      return { ok: false, code: 'badKeyEncoding', params: { index: index + 1 }, position: bodyStart + part.offset + 1 }
    }
    let value = ''
    let hasValue = false
    if (rawValue !== undefined) {
      const decoded = decodeComponent(rawValue)
      if (decoded === null) {
        return { ok: false, code: 'badValueEncoding', params: { index: index + 1 }, position: bodyStart + part.offset + 1 }
      }
      value = decoded
      hasValue = true
    }
    entries.push({ key, value, hasValue })
  }

  return { ok: true, entries, base, hash, duplicateKeys: countDuplicateKeys(entries), count: entries.length }
}

export function selectEntries(entries: QueryEntry[], options: QueryFilterOptions = {}): QueryEntry[] {
  const { includeEmpty = true, sortKeys = false } = options
  const usable = entries.filter((entry) => entry.key !== '' && (includeEmpty || entry.hasValue))
  return sortKeys ? [...usable].sort(byKey) : usable
}

export function buildQueryString(entries: QueryEntry[], options: QueryBuildOptions = {}): string {
  const { encode = true, encodeSpaceAsPlus = false, leadingQuestionMark = false, appendHash = false, hash = '' } = options
  const ordered = selectEntries(entries, options)

  const parts = ordered.map((entry) => {
    const key = encode ? encodeURIComponent(entry.key) : entry.key
    if (!entry.hasValue) return key
    let value = encode ? encodeURIComponent(entry.value) : entry.value
    if (encodeSpaceAsPlus) value = value.replace(encode ? /%20/g : / /g, '+')
    return `${key}=${value}`
  })

  const query = parts.join('&')
  if (!query) return ''
  const prefix = leadingQuestionMark ? '?' : ''
  return appendHash && hash ? `${prefix}${query}#${hash}` : `${prefix}${query}`
}
