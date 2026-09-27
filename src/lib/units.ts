/**
 * What is traded, and what the margin is held in.
 *
 * These are tickers, not words, so they are the same in every language and are
 * deliberately not translated: a market is quoted in one currency whichever
 * language you read it in. Everything the panel shows is either a number of the
 * traded asset or a number of dollars, and the two are never mixed up in a
 * column — a size is TMZB, a margin is USD, and a price is the dollars one TMZB
 * costs.
 */
export const tradedAsset = 'TMZB'
export const marginAsset = 'USD'

/** How a price is quoted: margin currency per unit of the traded asset. */
export const priceUnit = `${marginAsset}/${tradedAsset}`

/**
 * The three ways a size can be typed.
 *
 * A position can be described three ways, and which one is in the box is the
 * reader's to choose: how much of the asset it holds, what that is worth in
 * dollars, or what it costs in margin to open. They are not three scales of one
 * number — the first is the asset, and the other two are the same dollars at two
 * moments, either side of the leverage. A reader who knows they want ten thousand
 * dollars of risk should be able to type ten thousand dollars.
 */
export const sizeUnits = [
  // How much of the asset.
  { id: 'tmzb', kind: 'asset', factor: 1 },
  // What the position is worth: the dollars the size would be worth at the mark.
  { id: 'value', kind: 'value', factor: 1 },
  // What it costs to open: the margin the position would take, which is the value
  // divided by the leverage. This is the unit that stays still when the price
  // moves, so it is the one a reader watching their risk can aim at.
  { id: 'cost', kind: 'cost', factor: 1 }
] as const

export type SizeUnit = (typeof sizeUnits)[number]['id']

export const defaultSizeUnit: SizeUnit = 'tmzb'

const unitFor = (unit: SizeUnit) => sizeUnits.find((found) => found.id === unit) ?? sizeUnits[0]

/** What the box counts in, which only the asset is named after. */
export const sizeTicker = (unit: SizeUnit): string => (unit === 'tmzb' ? tradedAsset : marginAsset)

/** How many steps the box moves by. */
export const sizeStepFor = (unit: SizeUnit): string => (unit === 'tmzb' ? '0.001' : '1')

/** The decimals a size needs, so a box never shows a digit it cannot send. */
export const sizePlacesFor = (unit: SizeUnit): number => (unit === 'tmzb' ? 3 : 2)

/**
 * A number in the reader's unit, as TMZB, which is the only unit the market
 * deals in.
 *
 * The two dollar units are the same dollars at two moments: what the position is
 * worth now, and what it takes to open it. Between them sit the price and the
 * leverage, which is why this needs both and the asset unit needs neither.
 */
export const sizeFromUnits = (value: number, unit: SizeUnit, price: number, leverage = 1): number => {
  if (price <= 0) return 0
  if (unit === 'value') return value / price
  if (unit === 'cost') return (value * Math.max(1, leverage)) / price
  return value * unitFor(unit).factor
}

/** And back again. */
export const sizeToUnits = (size: number, unit: SizeUnit, price: number, leverage = 1): number => {
  if (unit === 'value') return size * price
  if (unit === 'cost') return (size * price) / Math.max(1, leverage)
  return size / unitFor(unit).factor
}
