import { strict as assert } from 'node:assert'
import test from 'node:test'
import {
  ADDRESS_COUNT,
  HISTORY_BASE_LIMIT,
  WIN_THRESHOLD,
  drawFromSource,
  formatRandomSource,
  newRandomSource,
  odds,
  parseRandomSource,
  randomDigits,
  trimHistory,
  tronscanUrl
} from '../src/lib/wallet/lottery.ts'
import { loadWordlist, validateMnemonic } from '../src/lib/wallet/bip39.ts'
import { base58checkDecode } from '../src/lib/wallet/address.ts'

const SOURCE = '1758937200000-427'

test('the advertised odds are exactly the implemented odds', () => {
  // The UI shows `406,041,315 / 2^256`; the draw wins when a 256-bit digest is
  // below that threshold, so the two must be the same number by construction.
  assert.equal(WIN_THRESHOLD, 406041315n)
  const summary = odds()
  assert.equal(summary.fraction, '406,041,315 / 2²⁵⁶')
  assert.equal(summary.oneIn, '285,173,170,708,789,068,480,804,681,190,355,981,024,418,622,685,330,836,443,226,433,763,059')
  assert.equal(summary.space, '115,792,089,237,316,195,423,570,985,008,687,907,853,269,984,665,640,564,039,457,584,007,913,129,639,936')
  // 69 significant digits: the sample space is the largest figure shown.
  assert.equal(summary.oneIn.length - summary.oneIn.split(',').length + 1, 69)
})

test('the full decimal is printed exactly, not rounded or truncated', () => {
  const { decimal } = odds()
  // 1/2**256 terminates after exactly 256 decimal places, so the expansion is
  // finite and can be printed in full instead of as a rounded exponent.
  assert.ok(decimal.startsWith('0.'), decimal)
  const digits = decimal.slice(2)
  assert.equal(digits.length, 256)
  // 68 leading zeros, then the significant digits of 3.5066412366721982...e-69.
  assert.equal(digits.length - digits.replace(/^0+/, '').length, 68)
  assert.equal(digits.replace(/^0+/, '').slice(0, 40), '3506641236672198244886556693424173824381')
  // Independently confirm the printed digits are the threshold: reading them
  // back as a fraction must reproduce WIN_THRESHOLD / 2**256 exactly.
  assert.equal(BigInt(digits) * (1n << 256n), WIN_THRESHOLD * 10n ** 256n)
  // No ellipsis and no exponent marker anywhere in the printed value.
  assert.equal(/[eE\u2026]/.test(decimal), false)
})

test('a random source round-trips through text', () => {
  const parsed = parseRandomSource(SOURCE)
  assert.deepEqual(parsed, { timestamp: 1758937200000, digits: 427 })
  assert.equal(formatRandomSource(parsed), SOURCE)
  // Three digits are zero-padded so the text is always the same width.
  assert.equal(formatRandomSource({ timestamp: 1_700_000_000_000, digits: 7 }), '1700000000000-007')
})

test('a random source is rejected unless it is a timestamp and three digits', () => {
  for (const bad of ['', 'abc', '1758937200000', '1758937200000-12', '1758937200000-1234', '1758937200000-abc', '123-456']) {
    assert.equal(parseRandomSource(bad), null, bad)
  }
  // Surrounding whitespace is tolerated, out-of-range digits are not.
  assert.deepEqual(parseRandomSource(`  ${SOURCE}  `), { timestamp: 1758937200000, digits: 427 })
  assert.equal(parseRandomSource('1758937200000-1000'), null)
})

test('new sources carry a current timestamp and three digits', () => {
  const source = newRandomSource(() => 1758937200000)
  assert.equal(formatRandomSource(source), '1758937200000-' + String(source.digits).padStart(3, '0'))
  assert.ok(source.digits >= 0 && source.digits <= 999)
  // The digit part must actually vary, otherwise it is not random.
  const seen = new Set(Array.from({ length: 40 }, () => newRandomSource(() => 1).digits))
  assert.ok(seen.size > 1, 'the three digits never changed')
})

test('the three digits are uniform, not skewed by a modulo', () => {
  // A naive `% 1000` over 16 bits gives 0-535 a 66/65536 share and the rest
  // 65/65536, so the spread across buckets would be visibly lopsided.
  const draws = 50000
  const counts = new Array(1000).fill(0)
  for (let n = 0; n < draws; n += 1) {
    const digits = randomDigits()
    assert.ok(Number.isInteger(digits) && digits >= 0 && digits <= 999, `out of range: ${digits}`)
    counts[digits] += 1
  }
  // Expected 50 per bucket, standard deviation ~7, so a spread under 150 is
  // far beyond noise and still nowhere near the 50+ it would be if skewed.
  const spread = Math.max(...counts) - Math.min(...counts)
  assert.ok(spread < 150, `bucket spread ${spread} suggests the digits are biased`)
})

test('a draw produces ten valid mnemonics and ten TRON addresses', async () => {
  const entries = await drawFromSource(SOURCE)
  assert.equal(entries.length, ADDRESS_COUNT)
  assert.equal(entries.length, 10)
  const english = await loadWordlist('english')

  entries.forEach((entry, index) => {
    assert.equal(entry.index, index)
    // A real 12-word BIP39 mnemonic that validates and round-trips.
    const check = validateMnemonic(entry.mnemonic, english)
    assert.equal(check.valid, true, entry.mnemonic)
    assert.equal(entry.mnemonic.split(' ').length, 12)
    // A real TRON address: Base58Check, 34 chars, 0x41 payload.
    assert.match(entry.address, /^T[1-9A-HJ-NP-Za-km-z]{33}$/, entry.address)
    const decoded = base58checkDecode(entry.address)
    assert.equal(decoded.length, 21)
    assert.equal(decoded[0], 0x41)
    assert.match(entry.addressHex, /^41[0-9a-f]{40}$/)
    assert.equal(entryHexMatchesBase58(entry.addressHex, decoded), true)
    assert.match(entry.privateKey, /^[0-9a-f]{64}$/)
  })

  // Ten distinct addresses, or the draw would be pointless.
  assert.equal(new Set(entries.map((e) => e.address)).size, 10)
  assert.equal(new Set(entries.map((e) => e.mnemonic)).size, 10)
})

test('the same random source always replays the same draw', async () => {
  const first = await drawFromSource(SOURCE)
  const second = await drawFromSource(SOURCE)
  assert.deepEqual(second, first)
  // Formatting through parse/format must not change the outcome either.
  const normalised = formatRandomSource(parseRandomSource(`  ${SOURCE} `))
  assert.deepEqual(await drawFromSource(normalised), first)
})

test('a different random source gives a completely different draw', async () => {
  const a = await drawFromSource(SOURCE)
  const b = await drawFromSource('1758937200000-428')
  const shared = a.filter((entry) => b.some((other) => other.address === entry.address))
  assert.equal(shared.length, 0)
})

test('nothing has ever won, which is the entire point', async () => {
  // Sample far more draws than anyone would ever run; a false positive here
  // would mean the threshold was wired up wrong rather than merely unlucky.
  const winners = []
  for (let n = 0; n < 60; n += 1) {
    const entries = await drawFromSource(`175893720000${String(n).padStart(4, '0')}-${String(n % 1000).padStart(3, '0')}`)
    for (const entry of entries) if (entry.winner) winners.push(entry.address)
  }
  assert.deepEqual(winners, [], `expected no winners across ${60 * ADDRESS_COUNT} addresses`)
})

test('the threshold is what makes a winner, and it is reachable in principle', () => {
  // 2^256 is the sample space, so the odds are threshold / 2^256 exactly.
  const space = 1n << 256n
  assert.ok(WIN_THRESHOLD < space)
  assert.equal(WIN_THRESHOLD / space, 406041315n / space)
  // Close to 3.5e-69, comfortably below any float's resolution.
  assert.ok(Number(space / WIN_THRESHOLD) > 2.8e68)
  assert.ok(Number(space / WIN_THRESHOLD) < 2.9e68)
})

test('the explorer link points at the address it belongs to', () => {
  assert.equal(tronscanUrl('TXYZ'), 'https://tronscan.org/#/address/TXYZ')
  assert.match(tronscanUrl('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'), /^https:\/\/tronscan\.org\/#\/address\/T[A-Za-z1-9]{33}$/)
})

/** The hex form and the Base58 form must be two encodings of one address. */
function entryHexMatchesBase58(hex, decoded) {
  return hex === Array.from(decoded, (b) => b.toString(16).padStart(2, '0')).join('')
}

// ------------------------------------------------------------------ history cap

const row = (n, claim) => ({ source: `s${n}`, at: n, winners: 0, ...(claim ? { claim } : {}) })

test('the history is capped at 12 entries when nobody has won', () => {
  assert.equal(HISTORY_BASE_LIMIT, 12)
  const rows = Array.from({ length: 40 }, (_, i) => row(i))
  const kept = trimHistory(rows)
  assert.equal(kept.length, 12)
  // Newest first, and the oldest are the ones dropped.
  assert.equal(kept[0].source, 's0')
  assert.deepEqual(kept.map((r) => r.source), Array.from({ length: 12 }, (_, i) => `s${i}`))
})

test('the cap grows by one for every reported win, so 12 + n', () => {
  for (const wins of [1, 2, 5, 9]) {
    const rows = Array.from({ length: 40 }, (_, i) => row(i, i < wins ? { index: 0, amount: '1 TRX' } : undefined))
    const kept = trimHistory(rows)
    assert.equal(kept.length, HISTORY_BASE_LIMIT + wins, `${wins} wins`)
  }
})

test('a reported win is never dropped, even at the very end of the list', () => {
  // The win is the oldest row, so a plain slice would discard it.
  const rows = Array.from({ length: 40 }, (_, i) => row(i, i === 39 ? { index: 4, amount: '1000 TRX' } : undefined))
  const kept = trimHistory(rows)
  const last = kept.find((r) => r.source === 's39')
  assert.ok(last, 'the oldest winning row was dropped')
  assert.deepEqual(last.claim, { index: 4, amount: '1000 TRX' })
  // Still 12 ordinary rows alongside it, and the newest stays on top.
  assert.equal(kept.filter((r) => !r.claim).length, HISTORY_BASE_LIMIT)
  assert.equal(kept[0].source, 's0')
})

test('a win with no amount still counts as a win and is still kept', () => {
  const rows = Array.from({ length: 30 }, (_, i) => row(i, i === 29 ? { index: 0, amount: '' } : undefined))
  const kept = trimHistory(rows)
  assert.equal(kept.length, HISTORY_BASE_LIMIT + 1)
  assert.ok(kept.some((r) => r.source === 's29'))
})

test('trimming preserves order and does not mutate the input', () => {
  const rows = Array.from({ length: 20 }, (_, i) => row(i, i === 19 ? { index: 1, amount: '7' } : undefined))
  const snapshot = JSON.stringify(rows)
  const kept = trimHistory(rows)
  assert.equal(JSON.stringify(rows), snapshot, 'input was mutated')
  const sources = kept.map((r) => r.source)
  assert.deepEqual(sources, [...sources].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))))
  // s19 is the oldest yet ends up last, so order is kept rather than resorted.
  assert.equal(sources[sources.length - 1], 's19')
})

test('an empty or short history is returned unchanged', () => {
  assert.deepEqual(trimHistory([]), [])
  const few = [row(0), row(1)]
  assert.deepEqual(trimHistory(few), few)
})
