import { strict as assert } from 'node:assert'
import test from 'node:test'
// An order is named by the side that does the work and the position it acts on.
// These check that rule against the records the engine actually writes, because
// the wording is the part a reader trusts and the part easiest to break.
import { createAccount, deposit, placeOrder } from '../src/lib/trading.ts'
import { actionLabel, closeLabel } from '../src/lib/wording.ts'

const T0 = Date.UTC(2024, 3, 1, 0, 0, 0)
const FLAT = 100_000
const market = {
  priceAt: () => FLAT,
  extremesBetween: (a, b) => ({ low: FLAT, high: FLAT, lowAt: a, highAt: b })
}

test('every trade the engine writes gets the words an exchange would give it', () => {
  let account = deposit(createAccount({ savedAt: T0, createdAt: T0 }), 1_000_000, T0)
  // One position at a time, because the account nets: a short opened against a
  // long closes the long rather than sitting beside it.
  const open = (side) =>
    placeOrder(account, { side, kind: 'market', size: 0.1, leverage: 10, marginMode: 'cross' }, T0, market)
  const close = (side) =>
    placeOrder(
      account,
      { side, kind: 'market', size: 0.1, leverage: 10, marginMode: 'cross', purpose: 'close', positionId: account.positions[0]?.id },
      T0,
      market
    )
  account = open('buy')
  account = close('sell')
  account = open('sell')
  account = close('buy')

  const words = account.trades.map((trade) => actionLabel(trade.side, trade.purpose, trade.liquidated === true))
  assert.deepEqual(words, [
    'buyOpenLong', // 买入开多
    'sellCloseLong', // 卖出平多
    'sellOpenShort', // 卖出开空
    'buyCloseShort' // 买入平空
  ])
  // Naming the order after its side rather than after the position it touches is
  // the whole point: a long close is a sell, and reading it as anything else is
  // how a record ends up saying a short was flattened.
  const longClose = account.trades[1]
  assert.equal(longClose.side, 'sell')
  assert.equal(actionLabel(longClose.side, longClose.purpose, false), 'sellCloseLong')
})

test('a forced close is named for the order that did it, not the position it killed', () => {
  // A long is closed by a sell, so its liquidation reads 卖出强平.
  assert.equal(actionLabel('sell', 'close', true), 'sellLiquidate')
  // A short is closed by a buy, so its liquidation reads 买入强平.
  assert.equal(actionLabel('buy', 'close', true), 'buyLiquidate')
  // And a liquidation says so even when the record would otherwise read as an open.
  assert.equal(actionLabel('sell', 'open', true), 'sellLiquidate')
})

test('the button that flattens a position says which side of the book it hits', () => {
  assert.equal(closeLabel(true), 'sellCloseLong')
  assert.equal(closeLabel(false), 'buyCloseShort')
})
