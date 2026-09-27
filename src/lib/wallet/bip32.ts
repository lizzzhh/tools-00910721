import { secp256k1 } from '@noble/curves/secp256k1.js'
import { hmac } from '@noble/hashes/hmac.js'
import { sha512 } from '@noble/hashes/sha2.js'
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import { base58checkEncode, hash160 } from './address.ts'

export type Bip32ErrorCode = 'invalidPath' | 'invalidSeedLength' | 'invalidPrivateKey'

export class Bip32Error extends Error {
  readonly code: Bip32ErrorCode

  constructor(code: Bip32ErrorCode) {
    super(code)
    this.name = 'Bip32Error'
    this.code = code
  }
}

const HARDENED_OFFSET = 0x80000000
/** secp256k1 group order; a private key or tweak must be in [1, n). */
export const CURVE_ORDER = secp256k1.Point.Fn.ORDER
const MASTER_KEY = utf8ToBytes('Bitcoin seed')

/** A BIP32 extended key, holding only the fields this tool needs to display. */
export type ExtendedKey = {
  depth: number
  /** Chain code, 32 bytes. */
  chainCode: Uint8Array
  /** First 4 bytes of the parent's hash160; zero at the master key. */
  parentFingerprint: number
  /** Hardened child index, or zero for the master key. */
  childIndex: number
  privateKey: Uint8Array
  /** Always the compressed 33-byte form. */
  publicKey: Uint8Array
}

/** One element of a derivation path. */
export type PathElement = { index: number; hardened: boolean }

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n
  for (const byte of bytes) value = (value << 8n) | BigInt(byte)
  return value
}

function toBytes(value: bigint, length: number): Uint8Array {
  return hexToBytes(value.toString(16).padStart(length * 2, '0').slice(-length * 2))
}

function isValidScalar(value: bigint): boolean {
  return value > 0n && value < CURVE_ORDER
}

/** The 4-byte parent fingerprint shown next to a derived key. */
export function fingerprintOf(publicKey: Uint8Array): number {
  const hash = hash160(publicKey)
  return ((hash[0] << 24) | (hash[1] << 16) | (hash[2] << 8) | hash[3]) >>> 0
}

export function formatFingerprint(value: number): string {
  return value.toString(16).padStart(8, '0')
}

/**
 * Parses a path such as `m/44'/60'/0'/0/0`. `h`/`H` is accepted alongside the
 * apostrophe so paths copied from other wallets still work.
 */
export function parsePath(path: string): PathElement[] {
  const trimmed = path.trim()
  if (trimmed === '' || trimmed === 'm' || trimmed === 'M') return []
  const parts = trimmed.split('/')
  if (parts[0] !== 'm' && parts[0] !== 'M') throw new Bip32Error('invalidPath')
  const elements: PathElement[] = []
  for (const part of parts.slice(1)) {
    if (part === '') throw new Bip32Error('invalidPath')
    const hardened = /['hH]$/.test(part)
    const digits = hardened ? part.slice(0, -1) : part
    if (!/^\d+$/.test(digits)) throw new Bip32Error('invalidPath')
    const index = Number(digits)
    if (index >= HARDENED_OFFSET) throw new Bip32Error('invalidPath')
    elements.push({ index, hardened })
  }
  return elements
}

export function formatPath(elements: PathElement[]): string {
  return ['m', ...elements.map((element) => `${element.index}${element.hardened ? "'" : ''}`)].join('/')
}

export function normalizePath(path: string): string {
  return formatPath(parsePath(path))
}

/** BIP32 master key: HMAC-SHA512 keyed with the literal string "Bitcoin seed". */
export function masterKeyFromSeed(seed: Uint8Array): ExtendedKey {
  if (seed.length < 16 || seed.length > 64) throw new Bip32Error('invalidSeedLength')
  const digest = hmac(sha512, MASTER_KEY, seed)
  const privateKey = digest.subarray(0, 32)
  if (!isValidScalar(bytesToBigInt(privateKey))) throw new Bip32Error('invalidPrivateKey')
  return {
    depth: 0,
    chainCode: digest.subarray(32),
    parentFingerprint: 0,
    childIndex: 0,
    privateKey,
    publicKey: secp256k1.getPublicKey(privateKey, true)
  }
}

/** CKDpriv from BIP32. Throws rather than returning null, since every valid index derives. */
export function deriveChild(key: ExtendedKey, element: PathElement): ExtendedKey {
  const index = element.index + (element.hardened ? HARDENED_OFFSET : 0)
  const data = element.hardened
    ? concatBytes(new Uint8Array([0]), key.privateKey, toBytes(BigInt(index), 4))
    : concatBytes(key.publicKey, toBytes(BigInt(index), 4))
  const digest = hmac(sha512, key.chainCode, data)
  const tweak = bytesToBigInt(digest.subarray(0, 32))
  if (tweak >= CURVE_ORDER) throw new Bip32Error('invalidPrivateKey')
  // Both operands are already reduced below n, so a single subtraction suffices.
  const childScalar = tweak + bytesToBigInt(key.privateKey) >= CURVE_ORDER
    ? tweak + bytesToBigInt(key.privateKey) - CURVE_ORDER
    : tweak + bytesToBigInt(key.privateKey)
  if (!isValidScalar(childScalar)) throw new Bip32Error('invalidPrivateKey')
  const childPrivateKey = toBytes(childScalar, 32)
  return {
    depth: key.depth + 1,
    chainCode: digest.subarray(32),
    parentFingerprint: fingerprintOf(key.publicKey),
    childIndex: index,
    privateKey: childPrivateKey,
    publicKey: secp256k1.getPublicKey(childPrivateKey, true)
  }
}

export function derivePath(seed: Uint8Array, path: string): ExtendedKey {
  let key = masterKeyFromSeed(seed)
  for (const element of parsePath(path)) key = deriveChild(key, element)
  return key
}

export function privateKeyHex(key: ExtendedKey): string {
  return bytesToHex(key.privateKey)
}

export function chainCodeHex(key: ExtendedKey): string {
  return bytesToHex(key.chainCode)
}

const XPRV_VERSION = 0x0488ade4
const XPUB_VERSION = 0x0488b21e

function uint32(value: number): Uint8Array {
  return Uint8Array.of((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff)
}

/**
 * Serialises to the base58check `xprv`/`xpub` form wallets import. Only the
 * mainnet versions are used; the tool derives display keys, never spends.
 */
export function serializeExtendedKey(key: ExtendedKey, kind: 'private' | 'public'): string {
  const version = kind === 'private' ? XPRV_VERSION : XPUB_VERSION
  const payload = concatBytes(
    uint32(version),
    new Uint8Array([key.depth]),
    uint32(key.parentFingerprint),
    uint32(key.childIndex),
    key.chainCode,
    kind === 'private' ? concatBytes(new Uint8Array([0]), key.privateKey) : key.publicKey
  )
  return base58checkEncode(payload)
}
