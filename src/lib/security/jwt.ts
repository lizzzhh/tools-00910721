export type JsonObject = Record<string, unknown>

export type JwtStatus = 'valid' | 'expired' | 'not-yet-valid' | 'unknown-expiry' | 'encrypted'
export type JwtDecodeResult =
  | { ok: false; code: JwtErrorCode; params?: { part: JwtPart } }
  | {
      ok: true
      kind: 'jwt' | 'jwe'
      header: JsonObject
      payload: JsonObject | null
      signature: string
      status: JwtStatus
      warnings: JwtWarningCode[]
      expiresAt: number | null
      issuedAt: number | null
      notBefore: number | null
    }

/** Codes the UI maps to `toolUi.jwt-decode.errors.*` / `.warnings.*`. */
export type JwtErrorCode =
  | 'invalidBase64Url'
  | 'notUtf8Json'
  | 'notJsonObject'
  | 'needToken'
  | 'tokenTooLong'
  | 'badStructure'
  | 'emptyHeaderOrPayload'
  | 'invalidCharacters'
  | 'headerFailed'
  | 'payloadFailed'

export type JwtWarningCode =
  | 'encrypted'
  | 'noSignatureVerification'
  | 'emptySignature'
  | 'algNone'
  | 'expired'
  | 'notYetValid'
  | 'issuedInFuture'

/** Internal labels so the decode helpers stay locale-neutral. */
type JwtPart = 'header' | 'payload'

export class JwtDecodeError extends Error {
  code: JwtErrorCode
  params?: { part: JwtPart }

  constructor(code: JwtErrorCode, params?: { part: JwtPart }) {
    super(code)
    this.name = 'JwtDecodeError'
    this.code = code
    this.params = params
  }
}

const tokenPattern = /^[A-Za-z0-9_-]+$/

function decodeBase64Url(value: string) {
  if (!tokenPattern.test(value) || value.length % 4 === 1) throw new JwtDecodeError('invalidBase64Url')
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

function decodeObject(value: string, part: JwtPart): JsonObject {
  let parsed: unknown
  try {
    parsed = JSON.parse(decodeBase64Url(value))
  } catch (error) {
    if (error instanceof JwtDecodeError) throw error
    throw new JwtDecodeError('notUtf8Json', { part })
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new JwtDecodeError('notJsonObject', { part })
  return parsed as JsonObject
}

function numericDate(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function decodeJwt(token: string, now = Date.now()): JwtDecodeResult {
  const value = token.trim()
  if (!value) return { ok: false, code: 'needToken' }
  if (value.length > 65536) return { ok: false, code: 'tokenTooLong' }

  const parts = value.split('.')
  if (parts.length !== 3 && parts.length !== 5) return { ok: false, code: 'badStructure' }
  if (!parts[0] || (parts.length === 3 && !parts[1])) return { ok: false, code: 'emptyHeaderOrPayload' }
  if (parts.slice(1).some((part) => part !== '' && !tokenPattern.test(part))) return { ok: false, code: 'invalidCharacters' }

  let header: JsonObject
  try {
    header = decodeObject(parts[0], 'header')
  } catch (error) {
    return { ok: false, code: 'headerFailed' }
  }

  if (parts.length === 5) {
    return {
      ok: true,
      kind: 'jwe',
      header,
      payload: null,
      signature: parts[1],
      status: 'encrypted',
      warnings: ['encrypted'],
      expiresAt: numericDate(header.exp),
      issuedAt: numericDate(header.iat),
      notBefore: numericDate(header.nbf)
    }
  }

  let payload: JsonObject
  try {
    payload = decodeObject(parts[1], 'payload')
  } catch (error) {
    return { ok: false, code: 'payloadFailed' }
  }

  const expiresAt = numericDate(payload.exp)
  const issuedAt = numericDate(payload.iat)
  const notBefore = numericDate(payload.nbf)
  const nowSeconds = now / 1000
  const warnings: JwtWarningCode[] = ['noSignatureVerification']
  if (!parts[2]) warnings.push('emptySignature')
  if (header.alg === 'none') warnings.push('algNone')
  if (expiresAt !== null && nowSeconds >= expiresAt) warnings.push('expired')
  if (notBefore !== null && nowSeconds < notBefore) warnings.push('notYetValid')
  if (issuedAt !== null && issuedAt > nowSeconds + 60) warnings.push('issuedInFuture')

  const status: JwtStatus = expiresAt !== null && nowSeconds >= expiresAt
    ? 'expired'
    : notBefore !== null && nowSeconds < notBefore
      ? 'not-yet-valid'
      : expiresAt !== null || notBefore !== null
        ? 'valid'
        : 'unknown-expiry'

  return { ok: true, kind: 'jwt', header, payload, signature: parts[2], status, warnings, expiresAt, issuedAt, notBefore }
}
