import type { Dictionary } from '../i18n'
import type { Side, Trade } from './trading.ts'

type TradingKeys = Dictionary['toolUi']['market']['trading']

/**
 * Read off the dictionary rather than written out, so renaming or losing one of
 * these keys is a type error here instead of a blank label in four languages.
 */
export type ActionKey = Extract<
  keyof TradingKeys,
  'buyOpenLong' | 'sellOpenShort' | 'sellCloseLong' | 'buyCloseShort' | 'sellLiquidate' | 'buyLiquidate'
>

/**
 * What an exchange would call this order.
 *
 * The words are the side that does the work and the position it acts on: a long
 * is opened by a buy and closed by a sell, so 平多 is a sell and not a buy. Naming
 * an order after its side rather than after the position it touches is what stops
 * a close being labelled as though it opened something.
 *
 * A forced close is named for the order that did it, which is the other side of
 * the position it finished off, so a long that gets liquidated reads 卖出强平.
 */
export function actionLabel(side: Side, purpose: Trade['purpose'], liquidated = false): ActionKey {
  if (liquidated) return side === 'sell' ? 'sellLiquidate' : 'buyLiquidate'
  if (purpose === 'close') return side === 'sell' ? 'sellCloseLong' : 'buyCloseShort'
  return side === 'sell' ? 'sellOpenShort' : 'buyOpenLong'
}

/** The words for flattening one particular position, which depend on which it is. */
export const closeLabel = (long: boolean): ActionKey => (long ? 'sellCloseLong' : 'buyCloseShort')
