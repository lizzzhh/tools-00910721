import type { ExtendedKey } from './bip32.ts'
import { derivePath, normalizePath, privateKeyHex, serializeExtendedKey } from './bip32.ts'
import {
  TRON_VERSION_BYTE,
  base58checkEncode,
  ethereumAddress,
  hash160,
  p2pkhAddress,
  segwitAddress,
  tronAddress,
  tronAddressHex
} from './address.ts'
import { bytesToHex, concatBytes } from '@noble/hashes/utils.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { secp256k1 } from '@noble/curves/secp256k1.js'

/** SLIP-0044 coin types, which is what the `44'` component of a BIP44 path means. */
export const coinTypes = {
  bitcoin: 0,
  litecoin: 2,
  dogecoin: 3,
  ethereum: 60,
  binance: 60,
  tron: 195
} as const

export type ChainId = keyof typeof coinTypes

export type AddressFormatId = 'p2pkh' | 'p2sh-p2wpkh' | 'p2wpkh' | 'eip55' | 'tron-base58' | 'tron-hex'

export type Chain = {
  id: ChainId
  symbol: string
  coinType: number
  /** BIP44 default receive path, hardened up to the account level. */
  defaultPath: string
  formats: AddressFormatId[]
}

/**
 * Every chain here shares the secp256k1 curve and BIP44 account layout, so a
 * single mnemonic derives all of them. BNB Smart Chain is Ethereum with
 * coin type 60 and an identical address, so it is listed separately only so the
 * UI can label the two rows distinctly.
 */
export const chains: Chain[] = [
  {
    id: 'bitcoin',
    symbol: 'BTC',
    coinType: coinTypes.bitcoin,
    defaultPath: "m/44'/0'/0'/0/0",
    formats: ['p2pkh', 'p2sh-p2wpkh', 'p2wpkh']
  },
  {
    id: 'litecoin',
    symbol: 'LTC',
    coinType: coinTypes.litecoin,
    defaultPath: "m/44'/2'/0'/0/0",
    formats: ['p2pkh', 'p2sh-p2wpkh', 'p2wpkh']
  },
  {
    id: 'dogecoin',
    symbol: 'DOGE',
    coinType: coinTypes.dogecoin,
    defaultPath: "m/44'/3'/0'/0/0",
    formats: ['p2pkh']
  },
  {
    id: 'ethereum',
    symbol: 'ETH',
    coinType: coinTypes.ethereum,
    defaultPath: "m/44'/60'/0'/0/0",
    formats: ['eip55']
  },
  {
    id: 'binance',
    symbol: 'BNB',
    coinType: coinTypes.binance,
    defaultPath: "m/44'/60'/0'/0/0",
    formats: ['eip55']
  },
  {
    id: 'tron',
    symbol: 'TRX',
    coinType: coinTypes.tron,
    // TRON is not an EVM chain but it does use BIP44, with its own coin type.
    defaultPath: "m/44'/195'/0'/0/0",
    formats: ['tron-base58', 'tron-hex']
  }
]

/**
 * Version bytes for the P2PKH/P2SH-style addresses, and the segwit hrp per chain.
 *
 * Litecoin is the odd one out: its P2SH is `0x32` (M-prefixed), not Bitcoin's
 * `0x05` (3-prefixed), because Litecoin Core 0.13.3 gave P2SH its own prefix to
 * stop LTC being sent to BTC by mistake. Legacy `3` addresses remain valid on
 * the network but new software should emit `M`.
 */
const P2PKH_VERSION: Record<string, number> = { bitcoin: 0x00, litecoin: 0x30, dogecoin: 0x1e }
const P2SH_VERSION: Record<string, number> = { bitcoin: 0x05, litecoin: 0x32 }
const SEGWIT_HRP: Record<string, string> = { bitcoin: 'bc', litecoin: 'ltc' }

export function getChain(id: ChainId): Chain {
  const found = chains.find((chain) => chain.id === id)
  if (!found) throw new Error(`unknown chain ${id}`)
  return found
}

export type DerivedAddress = {
  format: AddressFormatId
  address: string
}

export type DerivedEntry = {
  chain: Chain
  path: string
  privateKey: string
  /** Uncompressed 65-byte key, hex. */
  publicKey: string
  /** Compressed 33-byte key, hex. */
  publicKeyCompressed: string
  /** BIP44 account level, the `xprv` that wallets import as "the account". */
  accountPath: string
  accountXprv: string
  accountXpub: string
  fingerprint: string
  addresses: DerivedAddress[]
}

/**
 * P2SH-wrapped P2WPKH (the "3..." addresses). The redeem script is
 * `0x0014{hash160(pubkey)}`, hashed with SHA-256 then RIPEMD-160, exactly as in
 * BIP16 — no segwit-specific hashing is involved.
 */
function p2shP2wpkhAddress(version: number, publicKey: Uint8Array): string {
  const redeem = concatBytes(new Uint8Array([0x00, 0x14]), hash160(publicKey))
  return base58checkEncode(concatBytes(new Uint8Array([version]), hash160(redeem)))
}

export function formatAddress(chain: Chain, format: AddressFormatId, publicKey: Uint8Array): string {
  switch (format) {
    case 'p2pkh':
      return p2pkhAddress(P2PKH_VERSION[chain.id], publicKey)
    case 'p2sh-p2wpkh':
      return p2shP2wpkhAddress(P2SH_VERSION[chain.id], publicKey)
    case 'p2wpkh':
      return segwitAddress(SEGWIT_HRP[chain.id], 0, hash160(publicKey))
    case 'eip55':
      return ethereumAddress(publicKey)
    case 'tron-base58':
      return tronAddress(publicKey)
    case 'tron-hex':
      return tronAddressHex(publicKey)
  }
}

/** `m/44'/coin'/0'` — the level wallets import to watch a whole account. */
export function accountPathFor(chain: Chain, account = 0): string {
  return `m/44'/${chain.coinType}'/${account}'`
}

/**
 * Derives every configured address for one chain at one path.
 *
 * `account` selects the BIP44 account level reported in `accountPath` and the
 * `xprv`/`xpub`. It must match the account the caller put in `path`, otherwise
 * the table would show a leaf from one account next to an extended key from
 * another. When `path` overrides the standard layout entirely, parse the
 * account out of it so the two stay consistent by default.
 */
export function deriveChainEntry(seed: Uint8Array, chain: Chain, path: string, account?: number): DerivedEntry {
  const normalized = normalizePath(path)
  const key: ExtendedKey = derivePath(seed, normalized)
  const accountIndex = account ?? accountFromPath(normalized) ?? 0
  const accountPath = accountPathFor(chain, accountIndex)
  const accountKey = derivePath(seed, accountPath)
  const compressed = secp256k1.getPublicKey(key.privateKey, true)
  const uncompressed = secp256k1.getPublicKey(key.privateKey, false)

  return {
    chain,
    path: normalized,
    privateKey: privateKeyHex(key),
    publicKey: bytesToHex(uncompressed),
    publicKeyCompressed: bytesToHex(compressed),
    accountPath,
    accountXprv: serializeExtendedKey(accountKey, 'private'),
    accountXpub: serializeExtendedKey(accountKey, 'public'),
    fingerprint: bytesToHex(hash160(compressed).subarray(0, 4)),
    addresses: chain.formats.map((format) => ({ format, address: formatAddress(chain, format, compressed) }))
  }
}

/**
 * Reads the account back out of a BIP44 path. The third level is hardened, so
 * its on-chain index is the stored value plus `2^31`; anything that does not
 * look like `m/44'/coin'/account'/...` returns null and the caller decides.
 */
function accountFromPath(path: string): number | null {
  const match = /^m\/44'\/(\d+)'?\/(\d+)'?(?:\/|$)/.exec(path)
  if (!match) return null
  const value = Number(match[2])
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

/** Derives the full standard table: one row per chain at its BIP44 path. */
export function deriveAllChains(seed: Uint8Array): DerivedEntry[] {
  return chains.map((chain) => deriveChainEntry(seed, chain, chain.defaultPath))
}

/**
 * The same 20 account bytes, wrapped two different ways. Useful for showing
 * that a TRON address is just `41` + the Ethereum address.
 */
export function tronHexToBase58(hex: string): string {
  const clean = hex.trim().replace(/^0x/i, '').toLowerCase()
  if (!/^[0-9a-f]{42}$/.test(clean)) throw new Error('expected a 21-byte TRON hex address')
  const bytes = new Uint8Array(21)
  for (let index = 0; index < 21; index += 1) bytes[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16)
  if (bytes[0] !== TRON_VERSION_BYTE) throw new Error(`expected a 0x${TRON_VERSION_BYTE.toString(16)} prefix`)
  return base58checkEncode(bytes)
}

export { keccak_256 }
