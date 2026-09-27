import { strict as assert } from 'node:assert'
import test from 'node:test'
import {
  ADDRESS_COUNT,
  HISTORY_BASE_LIMIT,
  claimCountsAsWin,
  WIN_THRESHOLD,
  drawFromSource,
  formatPercent,
  formatRandomSource,
  newRandomSource,
  odds,
  parseRandomSource,
  posteriorHitProbability,
  posteriorStreak,
  POSTERIOR_BASISES,
  randomDigits,
  trimHistory,
  tronscanUrl,
  winProbability
} from '../src/lib/wallet/lottery.ts'
import { loadWordlist, validateMnemonic } from '../src/lib/wallet/bip39.ts'
import { base58checkDecode } from '../src/lib/wallet/address.ts'

const SOURCE = '1758937200000-427'

test('the advertised odds are exactly the implemented odds', () => {
  // The UI shows `406,041,315 / 2^256`; the draw wins when a 256-bit digest is
  // below that threshold, so the two must be the same number by construction.
  assert.equal(WIN_THRESHOLD, 406041315n)
  const summary = odds()
  assert.equal(summary.fraction, '\\frac{406{,}041{,}315}{2^{256}}')
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

// ------------------------------------------------------------ claim accounting

test('a reported win counts towards the lifetime tally', () => {
  // The claim is the only thing that can move `wins` in practice: the algorithm
  // threshold makes a real hit astronomically unlikely, so without this the
  // counter the UI shows would sit at zero forever.
  assert.equal(claimCountsAsWin(row(0)), true)
})

test('re-confirming the same draw does not count a second win', () => {
  // The dialog can be reopened per address, so claiming again must replace the
  // stored claim rather than inflating the total.
  const claimed = row(0, { index: 3, amount: '1000 TRX' })
  assert.equal(claimCountsAsWin(claimed), false)
  // A claim with an empty amount is still a claim, so it still blocks a re-count.
  assert.equal(claimCountsAsWin(row(1, { index: 0, amount: '' })), false)
})

test('each distinct draw can be claimed once', () => {
  const rows = [row(0), row(1), row(2)]
  // First pass: every row is unclaimed, so all three count.
  const counted = rows.filter((r) => claimCountsAsWin(r))
  assert.equal(counted.length, 3)
  // Second pass: every row now carries a claim, so nothing counts again.
  for (const r of rows) r.claim = { index: 0, amount: '1 TRX' }
  assert.equal(rows.filter((r) => claimCountsAsWin(r)).length, 0)
})

// ------------------------------------------------------------ percentages

test('percentages read as plain numbers while they stay legible', () => {
  assert.equal(formatPercent(0.5), '50\\%')
  assert.equal(formatPercent(1), '100\\%')
  assert.equal(formatPercent(0), '0\\%')
  assert.equal(formatPercent(0.5 / 3), '16.6667\\%')
  // Trailing zeros are dropped rather than padded out.
  assert.equal(formatPercent(0.25), '25\\%')
})

test('an absurdly small probability falls back to exponent notation', () => {
  // 3.5e-69 as a percentage is 66 zeros followed by digits, so a fixed expansion
  // would be unreadable; the exponent keeps the significant figures visible.
  assert.equal(formatPercent(3.5066412366721982e-69), '3.507\\times 10^{-67}\\,\\%')
  assert.equal(formatPercent(1e-5), '0.001\\%')
  assert.equal(formatPercent(9.999e-5), '0.01\\%')
})

test('the odds are shown as a percentage that matches the threshold', () => {
  // The advertised odds are 406,041,315 / 2^256 = 3.5066...e-69, so as a
  // percentage they are 3.5066...e-67 %.
  assert.equal(odds().percent, '3.507\\times 10^{-67}\\,\\%')
})


// --------------------------------------------------------------- posterior

test('the prior agrees with the published odds, so one trial reads as the odds', () => {
  const p = winProbability()
  // Beta(1, 1/p - 1) has mean exactly p, so a single upcoming trial must come out
  // at the published rate and not at some comfortable round number.
  assert.equal(formatPercent(posteriorHitProbability(p, 0, 1)), '3.507\\times 10^{-67}\\,\\%')
  // A uniform Beta(1, 1) prior would have claimed ~50% here. That was the bug.
  assert.ok(posteriorHitProbability(p, 0, 1) < 1e-60)
})

test('no horizon means no claim', () => {
  const p = winProbability()
  assert.equal(posteriorHitProbability(p, 0, 0), 0)
  assert.equal(posteriorHitProbability(p, 500, 0), 0)
  assert.equal(formatPercent(posteriorHitProbability(p, 0, 0)), '0\\%')
})

test('the closed form is the exact Beta predictive for any prior strength', () => {
  // At the real odds the posterior is a spike at zero and cannot be integrated
  // numerically, so verify the algebra where it is computable: Beta(1, 1/p - 1)
  // updated by n misses, then the chance the next m all miss.
  // m / (1/p + n + m), which is the b + 1 that a naive derivation drops.
  assert.equal(posteriorHitProbability(0.05, 0, 1), 1 / 21)
  for (const p of [0.05, 0.2, 0.5]) {
    const b = 1 / p - 1
    for (const [n, m] of [[0, 1], [1, 1], [10, 10], [7, 30], [100, 5]]) {
      const density = (theta) => (b + n + 1) * (1 - theta) ** (b + n)
      let allMiss = 0
      const steps = 2000000
      for (let i = 0; i < steps; i += 1) {
        const theta = (i + 0.5) / steps
        allMiss += density(theta) * (1 - theta) ** m * (1 / steps)
      }
      assert.ok(Math.abs(1 - allMiss - posteriorHitProbability(p, n, m)) < 1e-9,
        `p=${p} n=${n} m=${m}: ${1 - allMiss} vs ${posteriorHitProbability(p, n, m)}`)
    }
  }
})

test('at the real odds the streak is uninformative, to the last bit', () => {
  // 1/p is about 2.85e68, so a few hundred extra misses move the denominator by
  // less than one part in 1e66. The loss streak carries no information at all,
  // which is the whole reason the figure cannot climb on its own.
  const p = winProbability()
  const reference = posteriorHitProbability(p, 1, 1000)
  for (const n of [1, 100, 10 ** 4, 10 ** 9, 10 ** 18]) {
    const value = posteriorHitProbability(p, n, 1000)
    assert.ok(Math.abs(value - reference) / reference < 1e-15, `n=${n} moved it: ${value}`)
  }
  // The horizon, by contrast, scales it linearly.
  assert.ok(Math.abs(posteriorHitProbability(p, 0, 2000) / posteriorHitProbability(p, 0, 1000) - 2) < 1e-9)
})

test('it rises with the horizon but stays vanishingly small', () => {
  const p = winProbability()
  let previous = -1
  for (const n of [0, 1, 10, 100, 1000, 10 ** 5, 10 ** 6]) {
    const value = posteriorHitProbability(p, n, n)
    assert.ok(value > previous, `not rising at n=${n}`)
    // The whole point of the odds-matched prior: nowhere near even 1%.
    assert.ok(value < 1e-50, `implausibly high at n=${n}: ${value}`)
    previous = value
  }
  // One decade of the exponent per decade of the streak, i.e. it scales linearly.
  assert.equal(formatPercent(posteriorHitProbability(p, 1, 1)), '3.507\\times 10^{-67}\\,\\%')
  assert.equal(formatPercent(posteriorHitProbability(p, 10, 10)), '3.507\\times 10^{-66}\\,\\%')
  assert.equal(formatPercent(posteriorHitProbability(p, 100, 100)), '3.507\\times 10^{-65}\\,\\%')
  assert.equal(formatPercent(posteriorHitProbability(p, 1000, 1000)), '3.507\\times 10^{-64}\\,\\%')
})

test('a longer horizon lifts it, and it stays a vanishing probability', () => {
  const p = winProbability()
  const base = 100
  assert.ok(posteriorHitProbability(p, base, 200) > posteriorHitProbability(p, base, 100))
  // A billion further losses still cannot make a single check likely.
  assert.ok(posteriorHitProbability(p, 10 ** 9, 1) < 1e-60)
  // And no reachable horizon gets anywhere near 1.
  for (const m of [1, 10 ** 3, 10 ** 9, 10 ** 30]) {
    assert.ok(posteriorHitProbability(p, 0, m) < 1e-30, `m=${m}`)
  }
})

test('reaching even one half would take on the order of 1/p trials', () => {
  const p = winProbability()
  const attempts = Math.round(1 / p)
  // m = 1/p puts the predictive right at the halfway point of 0.5.
  assert.ok(Math.abs(posteriorHitProbability(p, 0, attempts) - 0.5) < 1e-6)
  assert.ok(attempts > 1e68, `1/p is only ${attempts}`)
  // A thousandth of that is nowhere near.
  assert.ok(posteriorHitProbability(p, 0, Math.round(attempts / 1000)) < 1e-3)
})

test('the streak is the counted total minus wins, floored at zero', () => {
  assert.equal(posteriorStreak(0, 0), 0)
  assert.equal(posteriorStreak(12, 0), 12)
  assert.equal(posteriorStreak(12, 3), 9)
  // Wins are claimed as well as computed, so they can outrun the tally.
  assert.equal(posteriorStreak(1, 5), 0)
  assert.equal(posteriorStreak(0, 1), 0)
})

test('both bases are offered and differ by the address count', () => {
  assert.deepEqual([...POSTERIOR_BASISES], ['checks', 'addresses'])
  const p = winProbability()
  // One check hands out ADDRESS_COUNT addresses, so the address basis counts ~10x
  // more trials and the figure is correspondingly ~10x higher.
  const checks = 1000
  const byChecks = posteriorHitProbability(p, posteriorStreak(checks, 0), posteriorStreak(checks, 0))
  const addresses = checks * ADDRESS_COUNT
  const byAddresses = posteriorHitProbability(p, posteriorStreak(addresses, 0), posteriorStreak(addresses, 0))
  assert.ok(byAddresses > byChecks)
  const ratio = byAddresses / byChecks
  assert.ok(Math.abs(ratio - ADDRESS_COUNT) < 0.01, `ratio was ${ratio}`)
})

test('a win pulls the streak down and the estimate back with it', () => {
  const p = winProbability()
  const misses = (n) => posteriorHitProbability(p, posteriorStreak(n, 0), posteriorStreak(n, 0))
  const withWin = (n) => posteriorHitProbability(p, posteriorStreak(n, 1), posteriorStreak(n, 1))
  assert.ok(withWin(10) < misses(10))
  assert.equal(withWin(10), misses(9))
})

test('negative input cannot produce a nonsense probability', () => {
  const p = winProbability()
  for (const bad of [-1, -100]) {
    const value = posteriorHitProbability(p, bad, 1)
    assert.ok(value >= 0 && value < 1, `${bad} -> ${value}`)
    assert.equal(value, p)
  }
  assert.equal(posteriorHitProbability(p, 0, -5), 0)
})
