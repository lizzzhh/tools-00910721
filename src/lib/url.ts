export type UrlMode = 'component' | 'uri'

/** Codes the UI maps to `toolUi.url-encode.errors.*`. */
export type UrlErrorCode = 'unencodable' | 'malformedPercent'

export type UrlResult =
  | {
      ok: true
      output: string
      byteLength: number
      outputLength: number
    }
  | {
      ok: false
      code: UrlErrorCode
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
    return { ok: false, code: 'unencodable' }
  }
}

export function decodeUrl(input: string, mode: UrlMode = 'component'): UrlResult {
  try {
    return success(mode === 'uri' ? decodeURI(input) : decodeURIComponent(input))
  } catch {
    return {
      ok: false,
      code: 'malformedPercent',
      ...(getMalformedPercentPosition(input) === undefined ? {} : { position: getMalformedPercentPosition(input) })
    }
  }
}
