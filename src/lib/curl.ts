/**
 * Assembles a cURL command from the fields on the page.
 *
 * The command is the product, so two things matter more than tidiness. Arguments
 * are quoted the way a POSIX shell needs them quoted, because pasting an
 * unquoted `-H 'Cookie: a=b'` into a shell is how a header silently becomes two
 * arguments. And every flag is listed with the reason it is there, so a reader
 * can tell the two that matter from the two that are habit.
 */

/** Display names live in the dictionaries as `toolUi.curl-builder.methods.*`. */
export const curlMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
export type HttpMethod = (typeof curlMethods)[number]

/** Display names live in the dictionaries as `toolUi.curl-builder.bodies.*`. */
export const curlBodyKinds = ['none', 'json', 'form', 'raw'] as const
export type BodyKind = (typeof curlBodyKinds)[number]

export const curlAuthKinds = ['none', 'basic', 'bearer'] as const
export type AuthKind = (typeof curlAuthKinds)[number]

export type CurlHeader = { name: string; value: string; enabled: boolean }

export type CurlRequest = {
  method: HttpMethod
  url: string
  headers: CurlHeader[]
  body: string
  bodyKind: BodyKind
  auth: { kind: AuthKind; username: string; password: string; token: string }
  insecure?: boolean
  followRedirects?: boolean
  compressed?: boolean
  showErrors?: boolean
  timeout?: number
}

export type CurlErrorCode = 'emptyUrl' | 'badUrl' | 'badHeader'

export type CurlToken = { flag: string | null; value: string | null }

export type CurlResult =
  | {
      ok: true
      /** One line, ready to paste. */
      command: string
      /** The same command broken after each flag, which is the readable form. */
      pretty: string
      tokens: CurlToken[]
      headerCount: number
      bodyBytes: number
      /** Which of the offered flags this request actually uses, for the legend. */
      usedFlags: string[]
    }
  | { ok: false; code: CurlErrorCode; header?: string }

/**
 * Wraps an argument in single quotes, which is the only quoting that needs no
 * escaping rules of its own. An embedded single quote has to leave the quotes,
 * add a backslash-quote, and come back.
 */
export function shellQuote(value: string): string {
  if (value === '') return "''"
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function encodeForm(body: string) {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf('=')
      if (index < 0) return line
      return `${encodeURIComponent(line.slice(0, index))}=${encodeURIComponent(line.slice(index + 1))}`
    })
}

function isValidHeaderName(name: string) {
  // RFC 7230 token: no spaces, no colon, nothing that would end the header early.
  return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)
}

export function buildCurl(request: CurlRequest): CurlResult {
  const url = request.url.trim()
  if (!url) return { ok: false, code: 'emptyUrl' }
  try {
    // `new URL` is the cheapest way to reject what a shell would not accept, and
    // it does not need a scheme to be reachable to be worth complaining about.
    new URL(/^[a-zA-Z][\w+.-]*:\/\//.test(url) ? url : `https://${url}`)
  } catch {
    return { ok: false, code: 'badUrl' }
  }

  const tokens: CurlToken[] = [{ flag: null, value: 'curl' }]
  if (request.method !== 'GET') tokens.push({ flag: '-X', value: request.method })
  if (request.showErrors) tokens.push({ flag: '--fail-with-body', value: null })
  if (request.compressed) tokens.push({ flag: '--compressed', value: null })
  if (request.followRedirects) tokens.push({ flag: '-L', value: null })
  if (request.insecure) tokens.push({ flag: '-k', value: null })
  if (request.timeout && request.timeout > 0) tokens.push({ flag: '--max-time', value: String(request.timeout) })

  let headerCount = 0
  for (const header of request.headers) {
    const name = header.name.trim()
    if (!name || !header.enabled) continue
    if (!isValidHeaderName(name)) return { ok: false, code: 'badHeader', header: name }
    headerCount += 1
    tokens.push({ flag: '-H', value: `${name}: ${header.value}` })
  }

  const body = request.body
  const hasBody = body.trim() !== '' && request.bodyKind !== 'none'
  if (hasBody) {
    if (request.bodyKind === 'json') tokens.push({ flag: '-H', value: 'Content-Type: application/json' })
    if (request.bodyKind === 'form') tokens.push({ flag: '-H', value: 'Content-Type: application/x-www-form-urlencoded' })
    // `--data` and `--data-raw` differ only in how they treat `@`, which is a
    // reason to pick one, so the page picks it rather than the reader.
    if (request.bodyKind === 'form') tokens.push({ flag: '--data', value: encodeForm(body).join('&') })
    if (request.bodyKind === 'raw') tokens.push({ flag: '--data-raw', value: body })
  }

  if (request.auth.kind === 'basic' && request.auth.username) {
    tokens.push({ flag: '-u', value: request.auth.password ? `${request.auth.username}:${request.auth.password}` : request.auth.username })
  }
  if (request.auth.kind === 'bearer' && request.auth.token) {
    tokens.push({ flag: '-H', value: `Authorization: Bearer ${request.auth.token}` })
  }

  tokens.push({ flag: null, value: url })

  const parts = tokens.map((token) =>
    [token.flag, token.value].filter((part) => part !== null).map((part) => shellQuote(part)).join(' ')
  )
  return {
    ok: true,
    command: parts.join(' '),
    pretty: parts.join(' \\\n  '),
    tokens,
    headerCount,
    bodyBytes: new TextEncoder().encode(hasBody ? body : '').byteLength,
    usedFlags: [...new Set(tokens.map((token) => token.flag).filter((flag): flag is string => flag !== null))]
  }
}

/**
 * Appends query parameters to a URL, replacing any it already has. Keys without a
 * name are dropped rather than turned into `=value`, which is what a person means
 * by leaving one blank in the table.
 */
export function mergeQuery(url: string, pairs: { key: string; value: string }[]): string {
  const usable = pairs.filter((pair) => pair.key.trim() !== '')
  if (usable.length === 0) return url
  const [base, existing = ''] = url.split('?')
  const query = [existing, ...usable.map((pair) => `${encodeURIComponent(pair.key.trim())}=${encodeURIComponent(pair.value)}`)]
    .filter((part) => part !== '')
    .join('&')
  return `${base}?${query}`
}

/** The flags this tool can emit, so the page can gloss them without hardcoding. */
export const curlFlagNotes: { flag: string; note: string }[] = [
  { flag: '-X', note: 'method' },
  { flag: '--fail-with-body', note: 'failHttp' },
  { flag: '--compressed', note: 'compressed' },
  { flag: '-L', note: 'followRedirects' },
  { flag: '-k', note: 'insecure' },
  { flag: '--max-time', note: 'timeout' },
  { flag: '-H', note: 'header' },
  { flag: '--data', note: 'data' },
  { flag: '--data-raw', note: 'dataRaw' },
  { flag: '-u', note: 'basicAuth' }
]