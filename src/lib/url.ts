export type UrlMode = 'component' | 'uri'

export type UrlResult =
  | {
      ok: true
      output: string
      byteLength: number
      outputLength: number
    }
  | {
      ok: false
      message: string
      position?: number
    }

function getOutputLength(value: string) {
  return Array.from(value).length
}

function getByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength
}

function getMalformedPercentPosition(value: string) {
  const match = /%(?![0-9a-f]{2})/i.exec(value)
  return match ? match.index + 1 : undefined
}

function success(output: string): UrlResult {
  return { ok: true, output, byteLength: getByteLength(output), outputLength: getOutputLength(output) }
}

export function encodeUrl(input: string, mode: UrlMode = 'component'): UrlResult {
  try {
    return success(mode === 'uri' ? encodeURI(input) : encodeURIComponent(input))
  } catch {
    return { ok: false, message: '内容包含无法编码的字符' }
  }
}

export function decodeUrl(input: string, mode: UrlMode = 'component'): UrlResult {
  try {
    return success(mode === 'uri' ? decodeURI(input) : decodeURIComponent(input))
  } catch {
    return {
      ok: false,
      message: 'URL 编码格式无效，请检查百分号转义',
      ...(getMalformedPercentPosition(input) === undefined ? {} : { position: getMalformedPercentPosition(input) })
    }
  }
}
