import { keccak_256 } from '@noble/hashes/sha3.js'
import { ripemd160 } from '@noble/hashes/legacy.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import { secp256k1 } from '@noble/curves/secp256k1.js'

/** RIPEMD-160(SHA-256(data)), the Bitcoin public key hash. */
export function hash160(data: Uint8Array): Uint8Array {
  return ripemd160(sha256(data))
}

/** Bitcoin's Base58 alphabet: no 0, O, I or l. */
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const BASE58_INDEX = new Map([...BASE58_ALPHABET].map((char, index) => [char, index]))

/** Bech32 charset, shared by P2WPKH and P2WSH. */
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const BECH32_CONST = 1

export type AddressErrorCode = 'base58Decode' | 'base58Checksum' | 'bech32' | 'invalidVersionByte' | 'invalidLength'

export class AddressError extends Error {
  readonly code: AddressErrorCode

  constructor(code: AddressErrorCode) {
    super(code)
    this.name = 'AddressError'
    this.code = code
  }
}

function base58Encode(bytes: Uint8Array): string {
  let value = 0n
  for (const byte of bytes) value = (value << 8n) | BigInt(byte)
  let out = ''
  while (value > 0n) {
    out = BASE58_ALPHABET[Number(value % 58n)] + out
    value /= 58n
  }
  // Every leading zero byte is encoded as a literal '1'.
  for (const byte of bytes) {
    if (byte !== 0) break
    out = '1' + out
  }
  return out
}

function base58Decode(value: string): Uint8Array {
  let numeric = 0n
  for (const char of value) {
    const digit = BASE58_INDEX.get(char)
    if (digit === undefined) throw new AddressError('base58Decode')
    numeric = numeric * 58n + BigInt(digit)
  }
  const hex = numeric.toString(16)
  const bytes = numeric === 0n ? new Uint8Array(0) : hexToBytes(hex.length % 2 === 0 ? hex : '0' + hex)
  let leading = 0
  for (const char of value) {
    if (char !== '1') break
    leading += 1
  }
  return concatBytes(new Uint8Array(leading), bytes)
}

export function sha256d(data: Uint8Array): Uint8Array {
  return sha256(sha256(data))
}

/**
 * Base58Check. The trailing 4 bytes are the first 4 bytes of a double SHA-256,
 * which is what Bitcoin, Litecoin, Dogecoin and Tron all use.
 */
export function base58checkEncode(payload: Uint8Array): string {
  return base58Encode(concatBytes(payload, sha256d(payload).subarray(0, 4)))
}

export function base58checkDecode(value: string): Uint8Array {
  const raw = base58Decode(value)
  if (raw.length < 5) throw new AddressError('invalidLength')
  const payload = raw.subarray(0, raw.length - 4)
  const checksum = raw.subarray(raw.length - 4)
  const expected = sha256d(payload).subarray(0, 4)
  for (let index = 0; index < 4; index += 1) {
    if (checksum[index] !== expected[index]) throw new AddressError('base58Checksum')
  }
  return payload
}

function bech32Polymod(values: number[]): number {
  const generator = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  let checksum = 1
  for (const value of values) {
    const top = checksum >>> 25
    checksum = ((checksum & 0x1ffffff) << 5) ^ value
    for (let index = 0; index < 5; index += 1) {
      if ((top >>> index) & 1) checksum ^= generator[index]
    }
  }
  return checksum >>> 0
}

function bech32HrpExpand(hrp: string): number[] {
  const out: number[] = []
  for (const char of hrp) out.push(char.charCodeAt(0) >>> 5)
  out.push(0)
  for (const char of hrp) out.push(char.charCodeAt(0) & 31)
  return out
}

function convertBits(data: Uint8Array, from: number, to: number, pad: boolean): number[] {
  let accumulator = 0
  let bits = 0
  const out: number[] = []
  const max = (1 << to) - 1
  for (const value of data) {
    accumulator = (accumulator << from) | value
    bits += from
    while (bits >= to) {
      bits -= to
      out.push((accumulator >>> bits) & max)
    }
  }
  if (pad && bits > 0) out.push((accumulator << (to - bits)) & max)
  return out
}

/** Encodes a segwit address (BIP173). `witnessVersion` 0 uses Bech32. */
export function segwitAddress(hrp: string, witnessVersion: number, program: Uint8Array): string {
  const data = [witnessVersion, ...convertBits(program, 8, 5, true)]
  const polymod = bech32Polymod([...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ BECH32_CONST
  const checksum = Array.from({ length: 6 }, (_, index) => (polymod >>> (5 * (5 - index))) & 31)
  return `${hrp}1${[...data, ...checksum].map((value) => BECH32_CHARSET[value]).join('')}`
}

/** A Bitcoin P2PKH address: Base58Check of version byte + hash160. */
export function p2pkhAddress(version: number, publicKey: Uint8Array): string {
  return base58checkEncode(concatBytes(new Uint8Array([version]), hash160(publicKey)))
}

/**
 * The 20 shared account bytes that Ethereum, BNB and TRON all start from:
 * Keccak-256 of the 64-byte uncompressed key, minus the `0x04` tag, keeping the
 * low 20 bytes. No version byte and no trailing checksum — those are added by
 * each chain on its own.
 */
export function ethAccountBytes(publicKey: Uint8Array): Uint8Array {
  const uncompressed = publicKey.length === 33 ? uncompress(publicKey) : publicKey
  if (uncompressed.length !== 65) throw new AddressError('invalidLength')
  return keccak_256(uncompressed.subarray(1)).subarray(12)
}

/**
 * An EIP-55 checksummed Ethereum address.
 *
 * Note the asymmetry with Bitcoin: Ethereum hashes the *uncompressed* key with
 * Keccak-256 and keeps the low 20 bytes, with no version byte and no checksum
 * suffix — the mixed casing itself is the checksum.
 */
export function ethereumAddress(publicKey: Uint8Array): string {
  const lower = bytesToHex(ethAccountBytes(publicKey))
  const hash = bytesToHex(keccak_256(utf8ToBytes(lower)))
  let out = '0x'
  for (let index = 0; index < lower.length; index += 1) {
    out += Number.parseInt(hash[index], 16) >= 8 ? lower[index].toUpperCase() : lower[index]
  }
  return out
}

/**
 * A TRON address.
 *
 * TRON reuses Ethereum's 20 account bytes but wraps them in its own envelope:
 * a 0x41 version byte on the front, and the same double-SHA-256 Base58Check
 * checksum Bitcoin uses on the back. The result is always 34 characters and
 * always starts with T.
 */
export const TRON_VERSION_BYTE = 0x41

export function tronAddress(publicKey: Uint8Array): string {
  return base58checkEncode(concatBytes(new Uint8Array([TRON_VERSION_BYTE]), ethAccountBytes(publicKey)))
}

/** The 21-byte hex form TRON's API expects, e.g. `41abc…`. */
export function tronAddressHex(publicKey: Uint8Array): string {
  return bytesToHex(concatBytes(new Uint8Array([TRON_VERSION_BYTE]), ethAccountBytes(publicKey)))
}

/** Expands a compressed 33-byte key to the 65-byte form that Ethereum and TRON require. */
function uncompress(publicKey: Uint8Array): Uint8Array {
  if (publicKey.length === 65) return publicKey
  if (publicKey.length !== 33) throw new AddressError('invalidLength')
  return secp256k1.Point.fromBytes(publicKey).toBytes(false)
}
