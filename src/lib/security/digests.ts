import {
  createHMAC,
  createMD5,
  createSHA1,
  createSHA224,
  createSHA256,
  createSHA384,
  createSHA512,
  type IHasher
} from 'hash-wasm'

export type DigestAlgorithmId = 'md5' | 'sha-1' | 'sha-224' | 'sha-256' | 'sha-384' | 'sha-512'

export type HashAlgorithmId =
  | DigestAlgorithmId
  | 'hmac-md5'
  | 'hmac-sha-1'
  | 'hmac-sha-224'
  | 'hmac-sha-256'
  | 'hmac-sha-384'
  | 'hmac-sha-512'

export type HashAlgorithm = {
  id: HashAlgorithmId
  label: string
  kind: 'digest' | 'hmac'
}

const digestFactories: Record<DigestAlgorithmId, () => Promise<IHasher>> = {
  md5: () => createMD5(),
  'sha-1': () => createSHA1(),
  'sha-224': () => createSHA224(),
  'sha-256': () => createSHA256(),
  'sha-384': () => createSHA384(),
  'sha-512': () => createSHA512()
}

export const hashAlgorithms: HashAlgorithm[] = [
  { id: 'md5', label: 'MD5', kind: 'digest' },
  { id: 'sha-1', label: 'SHA-1', kind: 'digest' },
  { id: 'sha-224', label: 'SHA-224', kind: 'digest' },
  { id: 'sha-256', label: 'SHA-256', kind: 'digest' },
  { id: 'sha-384', label: 'SHA-384', kind: 'digest' },
  { id: 'sha-512', label: 'SHA-512', kind: 'digest' },
  { id: 'hmac-md5', label: 'HMAC-MD5', kind: 'hmac' },
  { id: 'hmac-sha-1', label: 'HMAC-SHA-1', kind: 'hmac' },
  { id: 'hmac-sha-224', label: 'HMAC-SHA-224', kind: 'hmac' },
  { id: 'hmac-sha-256', label: 'HMAC-SHA-256', kind: 'hmac' },
  { id: 'hmac-sha-384', label: 'HMAC-SHA-384', kind: 'hmac' },
  { id: 'hmac-sha-512', label: 'HMAC-SHA-512', kind: 'hmac' }
]

export const digestAlgorithms = hashAlgorithms.filter((algorithm) => algorithm.kind === 'digest')
export const hmacAlgorithms = hashAlgorithms.filter((algorithm) => algorithm.kind === 'hmac')

export function isHmacAlgorithm(id: HashAlgorithmId): id is Extract<HashAlgorithmId, `hmac-${string}`> {
  return id.startsWith('hmac-')
}

function toDigestId(id: HashAlgorithmId): DigestAlgorithmId {
  return isHmacAlgorithm(id) ? id.slice('hmac-'.length) as DigestAlgorithmId : id
}

export function createHashHashers(ids: HashAlgorithmId[], key = ''): Promise<Map<HashAlgorithmId, IHasher>> {
  const keyBytes = new TextEncoder().encode(key)
  return ids.reduce(async (pending, id) => {
    const hashers = await pending
    if (isHmacAlgorithm(id)) hashers.set(id, await createHMAC(digestFactories[toDigestId(id)](), keyBytes))
    else hashers.set(id, await digestFactories[id]())
    return hashers
  }, Promise.resolve(new Map<HashAlgorithmId, IHasher>()))
}