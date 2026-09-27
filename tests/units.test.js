import { strict as assert } from 'node:assert'
import test from 'node:test'
import {
  defaultSizeUnit,
  marginAsset,
  priceUnit,
  sizeFromUnits,
  sizePlacesFor,
  sizeStepFor,
  sizeTicker,
  sizeToUnits,
  sizeUnits,
  tradedAsset
} from '../src/lib/units.ts'

const PRICE = 64_800
const LEVERAGE = 40

test('the two currencies are never confused for one another', () => {
  // The margin is dollars and the thing being traded is TMZB. A price is the
  // dollars one TMZB costs, which is the only sense in which the two meet.
  assert.equal(marginAsset, 'USD')
  assert.equal(tradedAsset, 'TMZB')
  assert.equal(priceUnit, 'USD/TMZB')
})

test('a size can be typed in the asset, what it is worth, or what it costs to open', () => {
  assert.deepEqual(
    sizeUnits.map((unit) => unit.id),
    ['tmzb', 'value', 'cost']
  )
  assert.deepEqual(
    sizeUnits.map((unit) => unit.kind),
    ['asset', 'value', 'cost']
  )
  assert.equal(defaultSizeUnit, 'tmzb')
})

test('the dollars in the box are the dollars of the market, not a fourth scale', () => {
  // Worth about $X is X divided by the price, because that is what buying X worth
  // of the asset costs at the mark.
  assert.equal(sizeFromUnits(1_000, 'value', PRICE), 1_000 / PRICE)
  assert.equal(sizeToUnits(1_000 / PRICE, 'value', PRICE), 1_000)
  for (const size of [0.001, 0.1, 1, 12.345, 25_000]) {
    assert.equal(sizeToUnits(size, 'value', PRICE), size * PRICE)
    assert.equal(sizeFromUnits(size * PRICE, 'value', PRICE), size)
  }
  // Cost is the same dollars after the leverage has taken its share, so the box
  // holds the margin and the notional is that margin levered back up.
  const margin = 500
  const size = sizeFromUnits(margin, 'cost', PRICE, LEVERAGE)
  assert.equal(size, (margin * LEVERAGE) / PRICE)
  assert.equal(sizeToUnits(size, 'cost', PRICE, LEVERAGE), margin)
  // One position, three descriptions, one answer.
  const notional = 12_345
  const asValue = sizeFromUnits(notional, 'value', PRICE)
  assert.equal(sizeToUnits(asValue, 'cost', PRICE, LEVERAGE), notional / LEVERAGE)
  assert.equal(sizeToUnits(sizeFromUnits(0.5, 'tmzb', PRICE), 'value', PRICE), 0.5 * PRICE)
  // A market at no price cannot say what a dollar of it is worth, and must not
  // answer with a size of its own invention.
  assert.equal(sizeFromUnits(1_000, 'value', 0), 0)
  assert.equal(sizeFromUnits(1_000, 'cost', 0, LEVERAGE), 0)
})

test('cost moves with the leverage, and the asset unit does not', () => {
  // The same dollars of margin buy more of the asset the higher the leverage, which
  // is the whole reason the two units answer differently.
  const at = (leverage) => sizeFromUnits(1_000, 'cost', PRICE, leverage)
  assert.ok(at(40) > at(10))
  assert.equal(sizeFromUnits(1, 'tmzb', PRICE), 1)
  // A leverage of zero is not a position, so it must not be read as one.
  assert.equal(sizeToUnits(1, 'cost', PRICE, 0), 1 * PRICE)
})

test('the box says which unit is in it, and how finely it can be typed', () => {
  // Only the asset has a name; the two dollar units are the same currency and are
  // told apart by the label on the button rather than by a ticker.
  assert.equal(sizeTicker('tmzb'), 'TMZB')
  assert.equal(sizeTicker('value'), 'USD')
  assert.equal(sizeTicker('cost'), 'USD')
  assert.equal(sizeStepFor('tmzb'), '0.001')
  assert.equal(sizeStepFor('value'), '1')
  assert.equal(sizeStepFor('cost'), '1')
  assert.equal(sizePlacesFor('tmzb'), 3)
  assert.equal(sizePlacesFor('value'), 2)
})

test('rounding a size down to a step does not quietly lose one', () => {
  // 0.0003 / 0.001 is 2.9999999999999996 in binary floating point, and a plain
  // floor of that drops a step the reader never asked to lose.
  const step = Number(sizeStepFor('tmzb'))
  const places = sizePlacesFor('tmzb')
  const floorToStep = (shown) => (Math.floor(shown / step + 1e-9) * step).toFixed(places)
  assert.equal(floorToStep(0.003), '0.003')
  assert.equal(floorToStep(0.035), '0.035')
  // And it still rounds down rather than up, which is the safe direction to be
  // wrong in when the number is an order size.
  assert.equal(floorToStep(0.0039), '0.003')
  assert.equal(floorToStep(0.0034), '0.003')
})
