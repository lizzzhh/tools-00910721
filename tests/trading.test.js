import { strict as assert } from 'node:assert'
import test from 'node:test'
import {
  advanceTo,
  createAccount,
  deposit,
  feeFor,
  liquidationPriceFor,
  loadAccount,
  loadHistory,
  makerFeeRate,
  maintenanceRateFor,
  maxLeverage,
  placeOrder,
  priceExtremesBetween,
  quoteOrder,
  saveAccount,
  saveHistory,
  seededMarket,
  takerFeeRate,
  viewAccount,
  maxNotionalFor,
  slippageRate,
  slippedPrice,
} from '../src/lib/trading.ts'

const T0 = Date.UTC(2024, 3, 1, 0, 0, 0)
const HOUR = 3_600_000
const FLAT = 100_000
const funded = () => deposit(createAccount({ savedAt: T0, createdAt: T0 }), 100_000, T0)

/**
 * A market that can be told exactly what it did, so the replay can be tested
 * against a price path we can reason about rather than one the generator happens
 * to produce.
 */
const stub = (priceAt) => ({
  priceAt,
  extremesBetween(fromMs, toMs) {
      let low = Number.POSITIVE_INFINITY
    let high = Number.NEGATIVE_INFINITY
    let lowAt = fromMs
    let highAt = fromMs
    for (let at = fromMs; at <= toMs; at += 1000) {
      const price = priceAt(at)
      if (price < low) {
        low = price
        lowAt = at
      }
      if (price > high) {
        high = price
        highAt = at
      }
    }
    if (!Number.isFinite(low)) {
      const price = priceAt(fromMs)
      return { low: price, high: price, lowAt: fromMs, highAt: fromMs }
    }
    return { low, high, lowAt, highAt }
  },
})

const flat = stub(() => FLAT)
/** A straight line from one price to another over the hour after T0. */
const ramp = (from, to) => stub((at) => from + ((to - from) * (at - T0)) / HOUR)
/** Up through a peak, then down through a trough, inside the same hour. */
const hump = stub((at) => FLAT + 20_000 * Math.sin(((at - T0) / HOUR) * Math.PI * 2))

test('a market order pays the taker fee and a resting one pays the maker fee', () => {
  assert.equal(takerFeeRate, 0.0009)
  assert.equal(makerFeeRate, 0.0006)
  assert.equal(feeFor(0.1, FLAT, 'taker'), 9)
  assert.equal(feeFor(0.1, FLAT, 'maker'), 6)

  const account = placeOrder(funded(), { side: 'buy', kind: 'market', size: 0.1 }, T0, flat)
  assert.equal(account.feesPaid, 9)
  // Ten times leverage holds a thousand back, but only isolated margin leaves the wallet.
  assert.equal(account.balance, 99_991)
  assert.equal(account.positions.length, 1)
  assert.equal(account.trades[0].liquidity, 'taker')
})

test('a limit order that crosses the spread is a taker, one that waits is a maker', () => {
  const account = funded()
  const marketable = placeOrder(account, { side: 'buy', kind: 'limit', size: 0.1, price: 105_000 }, T0, flat)
  assert.equal(marketable.orders.length, 0, 'it should not rest')
  assert.equal(marketable.trades[0].liquidity, 'taker')
  // It paid on the better of the two prices: its own limit, not the mark.
  assert.equal(marketable.trades[0].price, 105_000)
  assert.equal(marketable.feesPaid, 9.45)

  const resting = placeOrder(account, { side: 'buy', kind: 'limit', size: 0.1, price: 90_000 }, T0, flat)
  assert.equal(resting.orders.length, 1)
  assert.equal(resting.positions.length, 0)
  assert.equal(resting.feesPaid, 0)
  assert.equal(resting.trades.length, 0)
})

test('both fees stay on the record for the whole round trip', () => {
  let account = placeOrder(funded(), { side: 'buy', kind: 'market', size: 0.1, leverage: 10 }, T0, flat)
  assert.equal(account.feesPaid, 9)

  const position = viewAccount(account, FLAT).positions[0]
  assert.equal(position.pnl, 0)
  // What closing now would actually leave, with the exit fee already taken out.
  const rising = stub(() => FLAT + 1_000)
  assert.equal(viewAccount(account, FLAT + 1_000).positions[0].equity, 100 - 9.09)

  account = placeOrder(
    account,
    { side: 'sell', kind: 'market', purpose: 'close', positionId: position.id, size: 0.1 },
    T0 + 1000,
    rising,
  )
  assert.equal(account.positions.length, 0)
  assert.equal(account.realized, 100)
  assert.equal(account.feesPaid, 18.09, 'nine in, nine and a bit out')
  assert.equal(account.balance, 100_081.91)
  const closing = account.trades[account.trades.length - 1]
  assert.equal(closing.realized, 100)
  assert.equal(closing.balance, 100_081.91, 'the record says what the wallet became')
  assert.equal(viewAccount(account, FLAT).positions.length, 0)
})

test('a record read back later still explains the trade on its own', () => {
  let account = placeOrder(
    funded(),
    { side: 'sell', kind: 'limit', size: 0.2, price: 120_000, leverage: 25, marginMode: 'isolated' },
    T0,
    flat,
  )
  account = advanceTo(account, T0 + HOUR, ramp(FLAT, 130_000))
  const record = account.trades[0]

  // Nothing here has to be recomputed to be understood later.
  assert.equal(record.side, 'sell')
  assert.equal(record.purpose, 'open')
  assert.equal(record.size, 0.2)
  assert.equal(record.price, 120_000)
  assert.equal(record.leverage, 25)
  assert.equal(record.marginMode, 'isolated')
  assert.equal(record.liquidity, 'maker')
  assert.ok(record.mark > 0, 'the market it filled into')
  assert.ok((record.liquidation ?? 0) > 120_000, 'a short is liquidated above its entry')
  assert.equal(record.liquidation, 124_179.1)
  assert.equal(record.fee, 14.4)
  assert.ok(Number.isFinite(record.balance))
  assert.ok(record.at >= T0)
})

test('leverage holds the margin back, up to four hundred times', () => {
  const account = funded()
  const atTen = placeOrder(account, { side: 'buy', kind: 'market', size: 0.1, leverage: 10 }, T0, flat)
  assert.equal(viewAccount(atTen, FLAT).marginUsed, 1_000)

  const atFourHundred = placeOrder(atTen, { side: 'buy', kind: 'market', size: 0.1, leverage: 400 }, T0, flat)
  assert.equal(viewAccount(atFourHundred, FLAT).marginUsed, 1_025)
  assert.equal(maxLeverage, 400)

  // Asking for more than the market offers does not get you more than it offers.
  const absurd = placeOrder(atTen, { side: 'buy', kind: 'market', size: 0.1, leverage: 5_000 }, T0, flat)
  assert.equal(absurd.positions.length, 2)
  assert.equal(absurd.positions[1].leverage, 400)
})

test('an isolated position is liquidated by its own margin alone', () => {
  const account = placeOrder(
    funded(),
    { side: 'buy', kind: 'market', size: 0.1, leverage: 10, marginMode: 'isolated' },
    T0,
    flat,
  )
  const position = account.positions[0]
  assert.equal(position.margin, 1_000)
  // Ten times leverage on a long with half a percent held back.
  assert.equal(liquidationPriceFor(position, account), 90_452.26)
  assert.equal(account.balance, 98_991, 'the posted margin left the wallet')

  const short = placeOrder(
    funded(),
    { side: 'sell', kind: 'market', size: 0.1, leverage: 10, marginMode: 'isolated' },
    T0,
    flat,
  )
  assert.equal(liquidationPriceFor(short.positions[0], short), 109_452.74)
  // Two isolated positions do not share: the wallet is short of both margins.
  assert.equal(short.balance, 98_991)
})

test('a four hundred times long lives on a quarter of a percent', () => {
  const account = placeOrder(
    funded(),
    { side: 'buy', kind: 'market', size: 0.1, leverage: 400, marginMode: 'isolated' },
    T0,
    flat,
  )
  const price = liquidationPriceFor(account.positions[0], account)
  assert.equal(account.positions[0].maintenanceRate, 0.002)
  assert.ok(price !== null && price < FLAT, 'below the entry, as a long must be')
  // A quarter of a percent, which is all a 400x position can afford to lose.
  assert.ok(FLAT - (price ?? 0) < FLAT * 0.0025, `got ${FLAT - (price ?? 0)}`)
})

test('cross margin is lent from the whole wallet, so a thicker one holds longer', () => {
  // Two units at ten times is 200k of notional, which both of these wallets can
  // post and neither of them is a cushion.
  const open = (account) =>
    placeOrder(account, { side: 'buy', kind: 'market', size: 2, leverage: 10, marginMode: 'cross' }, T0, flat)

  const thin = open(deposit(createAccount({ savedAt: T0 }), 30_000, T0))
  const thick = open(deposit(createAccount({ savedAt: T0 }), 60_000, T0))
  const thinPrice = liquidationPriceFor(thin.positions[0], thin)
  const thickPrice = liquidationPriceFor(thick.positions[0], thick)
  // The opening fee has already come out of the wallet, so the cross price is
  // reached a little sooner than the deposit alone would suggest.
  assert.equal(thin.feesPaid, 180)
  assert.equal(thin.balance, 29_820)
  assert.equal(thinPrice, 85_517.59)
  assert.equal(thickPrice, 70_442.21, 'a thicker wallet holds further down')
  // No margin was taken out of the wallet, only the fee: what is left is the
  // balance less the twenty thousand the position borrowed against it. The
  // maintenance margin is not subtracted as well, because it is a floor inside
  // that twenty thousand rather than a second cost against the wallet.
  assert.equal(viewAccount(thin, FLAT).available, 9_820)

  // A wallet that comfortably covers the position has no liquidation price, and
  // is shown none rather than a number that cannot be reached.
  const over = open(deposit(createAccount({ savedAt: T0 }), 500_000, T0))
  assert.equal(liquidationPriceFor(over.positions[0], over), null)
})

test('a position the market liquidated while the tab was shut is closed at that price', () => {
  const account = placeOrder(
    funded(),
    { side: 'buy', kind: 'market', size: 0.1, leverage: 20, marginMode: 'isolated' },
    T0,
    flat,
  )
  const price = liquidationPriceFor(account.positions[0], account)
  const away = advanceTo(account, T0 + HOUR, ramp(FLAT, 50_000))

  assert.equal(away.positions.length, 0, 'the position did not survive the drop')
  assert.equal(away.liquidations, 1)
  const exit = away.trades[away.trades.length - 1]
  assert.equal(exit.price, price, 'closed at the liquidation price, not at the bottom')
  assert.equal(exit.liquidity, 'taker')
  assert.equal(exit.liquidated, true)
  // The loss and both fees are all that came out of it: the posted margin went back.
  assert.ok(Math.abs(away.balance - (100_000 + away.realized - away.feesPaid)) < 0.01)
  assert.ok(away.realized < 0)
})

test('a position that survived the time away is still open, and marked to now', () => {
  const account = placeOrder(
    funded(),
    { side: 'buy', kind: 'market', size: 0.1, leverage: 5, marginMode: 'isolated' },
    T0,
    flat,
  )
  const away = advanceTo(account, T0 + HOUR, ramp(FLAT, 92_000))
  assert.equal(away.positions.length, 1)
  assert.equal(away.liquidations, 0)
  assert.equal(away.savedAt, T0 + HOUR)
  assert.equal(viewAccount(away, 92_000).positions[0].pnl, -800)
})

test('an order left resting fills at the price it asked for, for the maker fee', () => {
  const account = placeOrder(
    funded(),
    { side: 'buy', kind: 'limit', size: 0.1, price: 90_000, leverage: 10 },
    T0,
    flat,
  )
  assert.equal(account.orders.length, 1)

  const away = advanceTo(account, T0 + HOUR, ramp(FLAT, 80_000))
  assert.equal(away.orders.length, 0)
  assert.equal(away.positions.length, 1)
  assert.equal(away.positions[0].entry, 90_000, 'filled at its own price, not at the market')
  assert.equal(away.trades[0].liquidity, 'maker')
  assert.ok(away.trades[0].mark < 90_000, 'the market was lower than its own fill')
  assert.equal(away.feesPaid, 5.4)
})

test('an order the market never reached is still waiting when the reader returns', () => {
  const account = placeOrder(
    funded(),
    { side: 'sell', kind: 'limit', size: 0.1, price: 120_000, leverage: 10 },
    T0,
    flat,
  )
  const away = advanceTo(account, T0 + HOUR, ramp(FLAT, 80_000))
  assert.equal(away.orders.length, 1)
  assert.equal(away.positions.length, 0)
  assert.equal(away.feesPaid, 0)
})

test('a fill and a liquidation in the same gap are applied in the order they happened', () => {
  let account = placeOrder(
    funded(),
    { side: 'buy', kind: 'market', size: 0.1, leverage: 20, marginMode: 'isolated' },
    T0,
    flat,
  )
  // Rests above the market, and the same hour takes the market up through it.
  account = placeOrder(
    account,
    { side: 'sell', kind: 'limit', size: 0.1, price: 118_000, leverage: 20, marginMode: 'isolated' },
    T0,
    flat,
  )
  const away = advanceTo(account, T0 + HOUR, hump)
  const times = away.trades.map((trade) => trade.at)
  assert.equal(times.length, 3, 'opened, filled, liquidated')
  for (let index = 1; index < times.length; index += 1) {
    assert.ok(times[index] >= times[index - 1], 'the record reads forwards')
  }
  assert.equal(away.trades[1].price, 118_000)
  assert.equal(away.trades[1].liquidity, 'maker')
  assert.equal(away.liquidations, 1)
})

test('the same gap replayed twice gives the same account', () => {
  const build = () =>
    placeOrder(
      placeOrder(
        funded(),
        { side: 'buy', kind: 'market', size: 0.1, leverage: 20, marginMode: 'isolated' },
        T0,
        flat,
      ),
      { side: 'sell', kind: 'limit', size: 0.1, price: 118_000 },
      T0,
      flat,
    )
  const once = advanceTo(build(), T0 + HOUR, hump)
  const twice = advanceTo(build(), T0 + HOUR, hump)
  assert.deepEqual(once, twice)
  // And a snapshot that is already up to date has nothing left to do.
  assert.deepEqual(advanceTo(once, T0 + HOUR, hump), once)
})

test('an order the account cannot afford is refused rather than shrunk', () => {
  const account = deposit(createAccount(), 100)
  const sent = placeOrder(account, { side: 'buy', kind: 'market', size: 1, leverage: 1 }, T0, flat)
  assert.equal(sent, account, 'nothing changed')
  assert.equal(sent.positions.length, 0)
  assert.ok(viewAccount(account, FLAT).available < 1_000)
})

test('the snapshot carries the money and the log carries the whole history', () => {
  let account = funded()
  for (let index = 0; index < 200; index += 1) {
    account = placeOrder(
      account,
      { side: 'buy', kind: 'market', size: 0.001, leverage: 10 },
      T0 + index * 1000,
      flat,
    )
  }
  assert.equal(account.trades.length, 200)

  const snapshot = saveAccount(account, T0 + 200_000)
  const restored = loadAccount(snapshot)
  assert.ok(restored)
  assert.equal(restored.positions.length, 200)
  assert.equal(restored.balance, account.balance)
  assert.equal(restored.deposited, 100_000)
  assert.equal(restored.feesPaid, account.feesPaid)
  assert.equal(restored.trades.length, 0, 'the log travels on its own')

  const withLog = loadHistory(saveHistory(account), restored)
  assert.equal(withLog.trades.length, 200, 'all two hundred kept')
  assert.equal(withLog.trades[0].id, account.trades[0].id)
  assert.equal(withLog.deposits.length, 1, 'and the deposit they started with')
  assert.equal(withLog.deposits[0].amount, 100_000)

  // The snapshot is small enough to always fit, however long the log gets.
  assert.ok(snapshot.length < 40_000, `snapshot was ${snapshot.length} bytes`)
})

test('the seed travels with the history, so a trade can be reproduced', () => {
  const account = placeOrder(funded(), { side: 'buy', kind: 'market', size: 0.05 }, T0, flat)
  const stored = saveHistory(account)
  const header = JSON.parse(stored)
  assert.equal(header.seed, account.seed)
  assert.equal(header.startPrice, account.startPrice)
  assert.equal(header.createdAt, account.createdAt)
  assert.ok(header.seed.length > 0, 'a history without a seed cannot be reproduced')

  const reloaded = loadHistory(stored, loadAccount(saveAccount(account)) ?? account)
  assert.equal(reloaded.seed, header.seed)
  assert.equal(reloaded.startPrice, header.startPrice)
  assert.equal(reloaded.trades.length, 1)
  // The record names the market it happened in, and that market answers for it.
  assert.equal(reloaded.trades[0].mark, 100_000)
  const market = seededMarket(reloaded.seed, reloaded.startPrice)
  const at = reloaded.trades[0].at
  assert.equal(market.priceAt(at), market.priceAt(at), 'the named market is reproducible')
  assert.equal(reloaded.sequence, account.sequence, 'ids can be rebuilt identically')
})

test('a snapshot that cannot be understood is refused', () => {
  assert.equal(loadAccount(null), null)
  assert.equal(loadAccount('not json'), null)
  assert.equal(loadAccount(JSON.stringify({ version: 99, savedAt: T0, account: {} })), null)
  assert.equal(loadAccount(JSON.stringify({ version: 1, savedAt: T0, account: { balance: 0 } })), null)
  assert.equal(loadHistory('not json', createAccount()).trades.length, 0)
})

test('the deposit is a plain sum that the account reports back', () => {
  const account = deposit(createAccount(), 12_345.678, T0)
  assert.equal(account.balance, 12_345.68)
  assert.equal(account.deposited, 12_345.68)
  assert.equal(deposit(account, 10, T0 + 1).balance, 12_355.68)
  assert.equal(deposit(createAccount(), -50).balance, 50)
  assert.equal(account.deposits[0].balance, 12_345.68, 'the balance it produced')
})

test('the seeded market answers from the seed, not from the clock', () => {
  const market = seededMarket()
  const first = market.priceAt(T0 + HOUR)
  assert.equal(market.priceAt(T0 + HOUR), first)
  assert.ok(first > 0)

  const range = priceExtremesBetween(T0 + HOUR, T0 + HOUR + 600_000)
  assert.ok(range.low <= range.high)
  assert.ok(range.high / range.low - 1 > 0, 'a ten minute stretch should have moved')
  assert.ok(range.lowAt >= T0 + HOUR && range.highAt <= T0 + HOUR + 600_000)
  assert.equal(maintenanceRateFor(10), 0.005)
  assert.equal(maintenanceRateFor(400), 0.002)
  // Every tier must leave a position able to outlive its own entry.
  for (const leverage of [1, 10, 50, 100, 200, 400]) {
    assert.ok(maintenanceRateFor(leverage) < 1 / leverage, `tier at ${leverage}x is survivable`)
  }
})

test('a long absence replays against the real market without losing the account', () => {
  const market = seededMarket()
  const from = Date.UTC(2026, 0, 2, 8, 0, 0)
  let account = deposit(createAccount({ savedAt: from, createdAt: from }), 50_000, from)
  account = placeOrder(
    account,
    { side: 'buy', kind: 'limit', size: 0.05, price: 60_000, leverage: 20, marginMode: 'isolated' },
    from,
    market
  )
  assert.equal(account.orders.length, 1)
  assert.equal(account.positions.length, 0)

  // Two days later, with the tab shut the whole time.
  const away = advanceTo(account, from + 2 * 86_400_000, market)
  // Whether the market came down to sixty thousand or not, the account is whole
  // and its books add up.
  assert.equal(away.deposited, 50_000)
  assert.ok(Math.abs(away.balance - (50_000 + away.realized - away.feesPaid)) < 0.01)
  assert.ok(away.orders.length + away.positions.length >= 1, 'the order is either resting or filled')
  if (away.orders.length === 0) {
    assert.equal(away.trades.at(-1).price, 60_000, 'it filled at its own price')
    assert.equal(away.trades.at(-1).liquidity, 'maker')
  }
  // And asking again changes nothing.
  assert.deepEqual(advanceTo(away, from + 2 * 86_400_000, market), away)
})

test('a position left open over a weekend is either standing or closed out', () => {
  const market = seededMarket()
  const from = Date.UTC(2026, 0, 2, 9, 0, 0)
  let account = deposit(createAccount({ savedAt: from, createdAt: from }), 20_000, from)
  account = placeOrder(
    account,
    { side: 'buy', kind: 'market', size: 0.05, leverage: 400, marginMode: 'isolated' },
    from,
    market
  )
  const entry = account.positions[0].entry
  const price = liquidationPriceFor(account.positions[0], account)
  assert.ok(price !== null && price < entry)

  const away = advanceTo(account, from + 3 * 86_400_000, market)
  assert.ok(Math.abs(away.balance - (20_000 + away.realized - away.feesPaid)) < 0.01)
  if (away.positions.length === 0) {
    assert.equal(away.liquidations, 1)
    const exit = away.trades.at(-1)
    assert.equal(exit.liquidated, true)
    // The exit price is the liquidation price, which cannot have moved: an isolated
    // position's depends only on what it was opened at.
    assert.equal(exit.price, price)
    assert.ok(away.realized < 0, 'and it was a loss')
  }
})

test('the fee is decided by what the order does to the book, not by its label', () => {
  const market = seededMarket()
  const at = Date.UTC(2026, 0, 2, 10, 0, 0)
  const price = market.priceAt(at)
  const account = deposit(createAccount({ savedAt: at, createdAt: at }), 100_000, at)
  const size = 0.01

  const feeAt = (request) => {
    const quote = quoteOrder(account, { ...request, leverage: 10, marginMode: 'cross' }, price, at)
    return { quote, expected: feeFor(size, quote.price, quote.liquidity) }
  }
  const market1 = feeAt({ side: 'buy', kind: 'market', size })
  assert.equal(market1.quote.liquidity, 'taker', 'a market order takes, always')
  assert.equal(market1.quote.fee, market1.expected)
  assert.ok(Math.abs(market1.quote.fee - size * price * takerFeeRate) < 0.01, 'paid the taker rate')

  const resting = feeAt({ side: 'buy', kind: 'limit', size, price: price * 0.9 })
  assert.equal(resting.quote.liquidity, 'maker', 'a limit behind the price waits')
  assert.ok(Math.abs(resting.quote.fee - size * price * 0.9 * makerFeeRate) < 0.01)

  const through = feeAt({ side: 'buy', kind: 'limit', size, price: price * 1.1 })
  assert.equal(through.quote.liquidity, 'taker', 'a limit through the price is a taker wearing a limit price')
  assert.ok(Math.abs(through.quote.fee - size * price * 1.1 * takerFeeRate) < 0.01)

  const sellThrough = feeAt({ side: 'sell', kind: 'limit', size, price: price * 0.9 })
  assert.equal(sellThrough.quote.liquidity, 'taker', 'a sell limit under the price is taken as well')

  // And the number quoted is the number charged.
  const filled = placeOrder(account, { side: 'buy', kind: 'market', size, leverage: 10, marginMode: 'cross' }, at, market)
  // The account keeps money at the cent, the quote at the ten-thousandth, so the
  // two agree to a cent rather than to the last digit.
  assert.ok(Math.abs(filled.feesPaid - market1.quote.fee) < 0.01)
  assert.equal(filled.trades.at(-1).liquidity, 'taker')
})

test('the largest openable size is the free margin less the fee it owes', () => {
  // A size the account can pay the margin for but not the fee on leaves it short,
  // so the ceiling has to leave room for both. The naive answer, free margin times
  // the leverage, always overshoots by exactly the fee.
  const available = 1_000
  const leverage = 10
  const max = maxNotionalFor(available, leverage)
  assert.ok(max < available * leverage, 'the fee comes out of the leverage, not on top of it')
  const margin = max / leverage
  const fee = max * takerFeeRate
  // The algebra is exact, binary floating point is not: at the maximum the two
  // come to 1000.0000000000002, so this is a budget to the cent rather than to the
  // last bit.
  assert.ok(margin + fee <= available + 1e-9, 'margin and fee together must fit the free margin')
  // It is tight, which is what makes it a ceiling: more than this will not open.
  const justOver = (max + 0.01) / leverage + (max + 0.01) * takerFeeRate
  assert.ok(justOver > available, 'a hair more than the maximum must not fit')
  // A resting order pays the lower fee, so it can carry a little more notional.
  assert.ok(maxNotionalFor(available, leverage, 'maker') > max)
  assert.equal(maxNotionalFor(0, leverage), 0)
  assert.equal(maxNotionalFor(available, 0), 0)
  // The higher the leverage, the larger the notional for the same margin, and so
  // the more of the budget the fee takes: at 2x it is a rounding error, at 400x it
  // is a quarter of what is left after the margin.
  const feeShare = (lev) => (maxNotionalFor(available, lev) * takerFeeRate) / available
  assert.ok(feeShare(400) > feeShare(2), 'the fee takes more of the budget as the leverage rises')
  assert.ok(feeShare(400) > 0.2, 'and at 400x it is a large share of it')
})

test('a market order fills at a price that allows for slippage, and always the worse one', () => {
  assert.equal(slippedPrice(100, 'buy'), 100 * (1 + slippageRate))
  assert.equal(slippedPrice(100, 'sell'), 100 * (1 - slippageRate))
  // Buying costs more than the mark and selling gets less: slippage is never a gift.
  assert.ok(slippedPrice(100, 'buy') > 100)
  assert.ok(slippedPrice(100, 'sell') < 100)
  // A reader shown the mark should not be promised the mark.
  assert.notEqual(slippedPrice(64_800, 'buy'), 64_800)
})

test('free margin is the balance less the margin lent out, and is never a loss twice', () => {
  // Putting the whole balance into a position must leave nothing free, not a
  // negative number. Maintenance margin is a floor inside the initial margin
  // already lent, so deducting it a second time takes the account below zero the
  // moment an order fills.
  const available = 1_000
  const leverage = 10
  // The size the panel calls full scale, which is the most that fits once the fee
  // is paid — and not the naive balance times the leverage, which cannot be opened.
  const size = maxNotionalFor(available, leverage) / FLAT
  const wallet = deposit(createAccount({ savedAt: T0, createdAt: T0 }), available, T0)
  const account = placeOrder(wallet, { side: 'buy', kind: 'market', size, leverage, marginMode: 'cross' }, T0, stub(() => FLAT))
  const view = viewAccount(account, FLAT)
  // Full scale is exactly full scale: everything but the fee is lent, and nothing
  // is borrowed from nowhere.
  assert.ok(view.available >= 0, `full scale must not go negative, got ${view.available}`)
  // It lands on nothing left free, to within the arithmetic rather than exactly:
  // the requirement is 1000 and the fee is rounded to a cent, so the remainder is
  // dust either side of zero and never a shortfall.
  assert.ok(Math.abs(view.available) < 0.01, `full scale should land on zero, got ${view.available}`)
  // The floor a liquidation would be measured against is a small share of what is
  // lent, which is why a fully lent position is not a liquidatable one: at ten
  // times the maintenance margin is half a percent of the notional against ten
  // percent of initial margin, so the price has a long way to travel.
  assert.ok(view.maintenance > 0)
  assert.ok(view.maintenance < view.marginUsed / 10, 'maintenance is a floor inside the margin, not a cost on it')
  assert.ok(liquidationPriceFor(account.positions[0], account) < FLAT, 'a long at the mark is above its own liquidation price')
})

test('free margin falls as the position loses and recovers as it wins', () => {
  const available = 1_000
  const leverage = 10
  const size = maxNotionalFor(available, leverage) / FLAT
  const wallet = deposit(createAccount({ savedAt: T0, createdAt: T0 }), available, T0)
  const account = placeOrder(wallet, { side: 'buy', kind: 'market', size, leverage, marginMode: 'cross' }, T0, stub(() => FLAT))
  const at = (price) => viewAccount(account, price).available
  assert.ok(at(FLAT * 0.98) < at(FLAT), 'a losing long has less free margin')
  assert.ok(at(FLAT * 1.02) > at(FLAT), 'a winning long has more')
  // Going negative here is a real state and not an arithmetic slip: it is what a
  // reader is being told when the account cannot cover what it is holding.
  assert.ok(at(FLAT * 0.9) < 0, 'a 10% adverse move on an all-in 10x position is over the line')
})

test('an isolated position takes its margin out of the balance once, not twice', () => {
  const available = 1_000
  const leverage = 10
  const size = maxNotionalFor(available, leverage) / FLAT
  let account = deposit(createAccount({ savedAt: T0, createdAt: T0 }), available, T0)
  account = placeOrder(account, { side: 'buy', kind: 'market', size, leverage, marginMode: 'isolated' }, T0, stub(() => FLAT))
  const view = viewAccount(account, FLAT)
  // The margin left the wallet when the position opened, so the balance is already
  // down by it and the free margin is what is left over the fee.
  assert.ok(view.balance < available, 'isolated margin leaves the balance')
  assert.ok(view.available >= 0, `available must not go negative, got ${view.available}`)
  assert.ok(view.available < 5, 'an all-in isolated position leaves nothing free')
  // Closing it hands the unused margin back, so the balance returns to where it
  // was less the fees paid on the way in and out.
  const opened = account.positions[0]
  account = placeOrder(
    account,
    { side: 'sell', kind: 'market', size, leverage, marginMode: 'isolated', purpose: 'close', positionId: opened.id },
    T0,
    stub(() => FLAT)
  )
  const closed = viewAccount(account, FLAT)
  assert.equal(closed.positions.length, 0)
  // The margin comes back whole, so all that is missing is the fee on the way in
  // and the fee on the way out.
  const paid = 2 * feeFor(size, FLAT, 'taker')
  assert.ok(Math.abs(closed.available - (available - paid)) < 0.01, `expected about ${available - paid}, got ${closed.available}`)
})

test('free margin is a money figure, so it never reads as a negative zero', () => {
  // A fully lent account is at exactly zero, and the arithmetic that gets it
  // there leaves a remainder a hair below it. Formatted as a currency that reads
  // as "-$0.00", which tells a reader their order is unaffordable when it fits.
  const available = 1_000
  for (const leverage of [1, 2, 10, 50, 100, 200, 400]) {
    const size = maxNotionalFor(available, leverage) / FLAT
    const account = placeOrder(
      deposit(createAccount({ savedAt: T0, createdAt: T0 }), available, T0),
      { side: 'buy', kind: 'market', size, leverage, marginMode: 'cross' },
      T0,
      stub(() => FLAT)
    )
    const free = viewAccount(account, FLAT).available
    assert.ok(free >= 0, `${leverage}x must not go negative, got ${free}`)
    assert.equal(Object.is(free, -0), false, `${leverage}x must not be negative zero`)
    assert.equal(free, 0, `${leverage}x should land on exactly zero, got ${free}`)
  }
})
