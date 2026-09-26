export type JsonObject = Record<string, unknown>

export type JwtStatus = 'valid' | 'expired' | 'not-yet-valid' | 'unknown-expiry' | 'encrypted'
export type JwtDecodeResult =
  | { ok: false; error: string }
  | {
      ok: true
      kind: 'jwt' | 'jwe'
      header: JsonObject
      payload: JsonObject | null
      signature: string
      status: JwtStatus
      warnings: string[]
      expiresAt: number | null
      issuedAt: number | null
      notBefore: number | null
    }

const tokenPattern = /^[A-Za-z0-9_-]+$/

function decodeBase64Url(value: string) {
  if (!tokenPattern.test(value) || value.length % 4 === 1) throw new Error('Base64URL 格式无效')
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

function decodeObject(value: string, label: string): JsonObject {
  let parsed: unknown
  try {
    parsed = JSON.parse(decodeBase64Url(value))
  } catch {
    throw new Error(`${label}不是有效的 UTF-8 JSON`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label}必须是 JSON 对象`)
  return parsed as JsonObject
}

function numericDate(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function decodeJwt(token: string, now = Date.now()): JwtDecodeResult {
  const value = token.trim()
  if (!value) return { ok: false, error: '请输入 JWT 令牌' }
  if (value.length > 65536) return { ok: false, error: '令牌内容过长，请检查输入' }

  const parts = value.split('.')
  if (parts.length !== 3 && parts.length !== 5) return { ok: false, error: '令牌格式无效，应为 3 段 JWT 或 5 段 JWE' }
  if (!parts[0] || (parts.length === 3 && !parts[1])) return { ok: false, error: '令牌头部或载荷为空' }
  if (parts.slice(1).some((part) => part !== '' && !tokenPattern.test(part))) return { ok: false, error: '令牌片段包含无效字符' }

  let header: JsonObject
  try {
    header = decodeObject(parts[0], '令牌头部')
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '令牌头部解析失败' }
  }

  if (parts.length === 5) {
    return {
      ok: true,
      kind: 'jwe',
      header,
      payload: null,
      signature: parts[1],
      status: 'encrypted',
      warnings: ['这是加密 JWT（JWE），只能读取头部，无法直接查看加密载荷。'],
      expiresAt: numericDate(header.exp),
      issuedAt: numericDate(header.iat),
      notBefore: numericDate(header.nbf)
    }
  }

  let payload: JsonObject
  try {
    payload = decodeObject(parts[1], '令牌载荷')
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '令牌载荷解析失败' }
  }

  const expiresAt = numericDate(payload.exp)
  const issuedAt = numericDate(payload.iat)
  const notBefore = numericDate(payload.nbf)
  const nowSeconds = now / 1000
  const warnings = ['此工具只解析令牌内容，不验证签名或加密性。']
  if (!parts[2]) warnings.push('签名为空，无法验证令牌。')
  if (header.alg === 'none') warnings.push('令牌声明使用 none 算法，请勿将其用于身份认证。')
  if (expiresAt !== null && nowSeconds >= expiresAt) warnings.push('令牌已过期。')
  if (notBefore !== null && nowSeconds < notBefore) warnings.push('令牌尚未生效。')
  if (issuedAt !== null && issuedAt > nowSeconds + 60) warnings.push('签发时间在未来，请确认令牌来源。')

  const status: JwtStatus = expiresAt !== null && nowSeconds >= expiresAt
    ? 'expired'
    : notBefore !== null && nowSeconds < notBefore
      ? 'not-yet-valid'
      : expiresAt !== null || notBefore !== null
        ? 'valid'
        : 'unknown-expiry'

  return { ok: true, kind: 'jwt', header, payload, signature: parts[2], status, warnings, expiresAt, issuedAt, notBefore }
}
