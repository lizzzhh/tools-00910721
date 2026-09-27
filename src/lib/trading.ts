/**
 * A simulated futures account: deposits, long and short positions, leverage up to
 * 400x, cross or isolated margin, and orders that rest until the market trades
 * through them.
 *
 * Nothing here touches the DOM or the clock. Every function takes the moment it
 * should believe in, which is what lets the whole account be rebuilt from a
 * snapshot: the market is fixed by its seed, so reopening the page means asking
 * what has happened since the snapshot was written and applying it, rather than
 * hoping the tab was still open to watch.
 *
 * The trade record is kept in full, forever, and it is self-describing: a trade
 * read back months later still says what it was, what it cost, where it would have
 * been liquidated and what the wallet looked like afterwards. The seed travels with
 * it, so any row can be reproduced rather than merely believed.
 */
import { defaultSeed, defaultStartPrice, generateCandles, marketEpoch, minuteExtremesBetween } from './candles.ts'
import { marketKeys } from './storage-schema.ts'

export type Liquidity = 'maker' | 'taker'

/** Taker fee, charged when an order crosses the spread to be filled. */
export const takerFeeRate = 0.0009
/** Maker fee, charged when a resting order is filled by someone else. */
export const makerFeeRate = 0.0006
/**
 * How far a market order's fill can land from the mark it was quoted at.
 *
 * The mark is the last traded price, which is what a market order is quoted
 * against but not necessarily what it gets: buying pushes the price up a little
 * and selling pushes it down a little. Every order in this market is against the
 * book, so a market order is never certain to fill at the mark.
 *
 * This is the size of that move rather than a rule for it. The market here is a
 * function of the seed, so a fill is decided by the seed and not by luck, and the
 * slippage is what a reader is told to expect the fill to be worth away from the
 * number they can see.
 */
export const slippageRate = 0.0005
/** The price a market order is likely to get, which is always the worse one. */
export const slippedPrice = (price: number, side: Side): number =>
  price * (side === 'buy' ? 1 + slippageRate : 1 - slippageRate)
export const maxLeverage = 400
/**
 * Smallest position the market will take, in units of the asset.
 *
 * A hundred-millionth of TMZB. This is the floor under the panel's size boxes, so
 * it is set where they are rather than above them: a smaller step here would let
 * a size through that the boxes could not express, and a larger one would reject
 * a position the reader can plainly see themselves holding.
 */
export const sizeStep = 0.0000001
/**
 * Maintenance margin, tiered by leverage: the share of a position's notional that
 * has to be left behind as equity for the position to survive.
 *
 * A position only lives past its own entry while the margin it posted exceeds the
 * maintenance margin on its notional, so the rate puts a ceiling on usable leverage
 * of one over itself. A flat half percent would therefore liquidate a 400x position
 * the moment it was opened — it never gets a chance to work. The rate steps down as
 * leverage climbs, which is the same reason the highest tiers are offered on fewer
 * markets than the low ones.
 */
export const maintenanceTiers = [
  { leverage: 50, rate: 0.005 },
  { leverage: 100, rate: 0.004 },
  { leverage: 200, rate: 0.003 },
  { leverage: maxLeverage, rate: 0.002 },
] as const

export function maintenanceRateFor(leverage: number): number {
  const wanted = clamp(leverage, 1, maxLeverage)
  for (const tier of maintenanceTiers) {
    if (wanted <= tier.leverage) return tier.rate
  }
  return maintenanceTiers[maintenanceTiers.length - 1].rate
}


export type Side = 'buy' | 'sell'
export type OrderKind = 'market' | 'limit'
export type MarginMode = 'cross' | 'isolated'
/** `open` adds exposure, `close` takes it away again. */
export type OrderPurpose = 'open' | 'close'

/** What closed a position, when the market closed it rather than the reader. */
export type ProtectionTrigger = 'stopLoss' | 'takeProfit' | 'liquidation'

export type Position = {
  id: string
  side: Side
  size: number
  entry: number
  leverage: number
  marginMode: MarginMode
  /** Margin posted into an isolated position, already taken out of the balance. */
  margin: number
  /**
   * The maintenance rate this position was opened under, kept so that a record read
   * back later is judged by the tier rules that applied to it, not by today's.
   */
  maintenanceRate: number
  openedAt: number
  /** Fee paid to get in, kept on the position so closing can report the round trip. */
  fee: number
  /** Price that closes this position out against the reader, or null for none. */
  stopLoss: number | null
  /** Price that banks the move, or null for none. */
  takeProfit: number | null
}

export type Order = {
  id: string
  side: Side
  kind: OrderKind
  purpose: OrderPurpose
  /** The position an order reduces, when it is a closing order. */
  positionId?: string
  size: number
  /** The price a limit order waits for. Market orders are filled on arrival. */
  price?: number
  leverage: number
  marginMode: MarginMode
  placedAt: number
  /** Protection asked for with the order, handed to the position it opens. */
  stopLoss?: number | null
  takeProfit?: number | null
}

/**
 * One line of history. Everything here is what the reader needs to understand the
 * trade later without having to reconstruct it: the market it filled into, the
 * leverage and margin mode it was placed under, the liquidation price it carried,
 * and the balance it left behind.
 */
export type Trade = {
  id: string
  orderId: string
  side: Side
  purpose: OrderPurpose
  positionId?: string
  size: number
  /** The price this order was actually filled at. */
  price: number
  /** Where the market was, which for a maker is not the same as the fill. */
  mark: number
  fee: number
  at: number
  /** `taker` paid to cross the spread, `maker` waited to be filled. */
  liquidity: 'maker' | 'taker'
  leverage: number
  marginMode: MarginMode
  /** Profit or loss banked by this fill, and zero when opening. */
  realized: number
  /** The liquidation price of the position as this fill left it. */
  liquidation: number | null
  /** The wallet immediately afterwards. */
  balance: number
  /** Set when the fill was a forced close rather than a request. */
  liquidated?: boolean
  /** Set when the market closed the position rather than the reader. */
  trigger?: ProtectionTrigger
}

export type Deposit = {
  id: string
  at: number
  amount: number
  balance: number
}

export type Account = {
  version: number
  /** The seed the market is generated from, and the price it opened at. */
  seed: string
  startPrice: number
  /** Cash in the wallet, in the quote currency. Isolated margin is not in here. */
  balance: number
  deposited: number
  realized: number
  feesPaid: number
  leverage: number
  marginMode: MarginMode
  positions: Position[]
  orders: Order[]
  trades: Trade[]
  deposits: Deposit[]
  /** When this snapshot was written, which is where a replay starts. */
  savedAt: number
  /** When the account was opened, which is the start of the history. */
  createdAt: number
  /** Counts every id ever handed out, so a rebuild is identical. */
  sequence: number
  /** How many times the account has been liquidated. A number, not a probability. */
  liquidations: number
}

export type PositionView = Position & {
  mark: number
  pnl: number
  /** What the position would be worth if it closed now, fees included. */
  equity: number
  notional: number
  initialMargin: number
  maintenance: number
  liquidation: number | null
}

export type AccountView = {
  balance: number
  equity: number
  available: number
  used: number
  unrealized: number
  marginUsed: number
  maintenance: number
  positions: PositionView[]
  orders: Order[]
  trades: Trade[]
  deposits: Deposit[]
  seed: string
  startPrice: number
  /** The price the account is being judged at. */
  price: number
  at: number
  atRisk: boolean
}

/** What the market has to be able to answer for a replay. */
export type Market = {
  priceAt(timeMs: number): number
  extremesBetween(fromMs: number, toMs: number): { low: number; high: number; lowAt: number; highAt: number }
}

export type OrderRequest = {
  side: Side
  kind: OrderKind
  purpose?: OrderPurpose
  positionId?: string
  size: number
  price?: number
  leverage?: number
  marginMode?: MarginMode
  stopLoss?: number | null
  takeProfit?: number | null
}

export type Quote = {
  ok: boolean
  /** An i18n key when the order cannot be sent, which the panel turns into words. */
  reason?: 'size' | 'price' | 'margin' | 'position' | 'stopLossSide' | 'takeProfitSide'
  size: number
  price: number
  notional: number
  margin: number
  fee: number
  total: number
  /** Whether this order waits or takes, and so which fee it pays. */
  liquidity: Liquidity
  /** Where this order would put the position, if it were filled now. */
  liquidation: number | null
}

const accountVersion = 1
const quote = (value: number, places = 2): number => {
  const scale = 10 ** places
  const rounded = Math.round(value * scale) / scale
  // Rounding a small negative to two places lands on negative zero, which is
  // equal to zero and formats as "-$0.00" all the same. Every figure that reaches
  // the panel goes through here, so the sign is dropped once rather than at each
  // place a reader might see it.
  return rounded === 0 ? 0 : rounded
}
const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value))

/**
 * Ids are counted on the account rather than in the module, so that replaying the
 * same history twice produces the same ids. A record that could not be rebuilt
 * identically would not be a record worth keeping.
 */
const nextId = (account: Account, prefix: string): [string, Account] => {
  const sequence = account.sequence + 1
  return [`${prefix}${sequence.toString(36)}`, { ...account, sequence }]
}

export function createAccount(overrides: Partial<Account> = {}): Account {
  const now = overrides.savedAt ?? Date.now()
  return {
    version: accountVersion,
    seed: defaultSeed,
    startPrice: defaultStartPrice,
    balance: 0,
    deposited: 0,
    realized: 0,
    feesPaid: 0,
    leverage: 10,
    marginMode: 'cross',
    positions: [],
    orders: [],
    trades: [],
    deposits: [],
    savedAt: now,
    createdAt: now,
    sequence: 0,
    liquidations: 0,
    ...overrides,
  }
}

/**
 * The market, as the account sees it. Every price question is answered from the
 * seed, so a snapshot plus a moment in time is the whole of the account's history.
 */
export function seededMarket(seed = defaultSeed, startPrice = defaultStartPrice): Market {
  return {
    priceAt(timeMs) {
      const bars = generateCandles({ timeframe: '1s', count: 1, until: timeMs, live: true, seed, startPrice })
      const last = bars[bars.length - 1]
      return last ? last.close : startPrice
    },
    extremesBetween(fromMs, toMs) {
      return priceExtremesBetween(fromMs, toMs, seed, startPrice)
    },
  }
}

/**
 * The lowest and highest price between two moments, which is all a resting order
 * needs to know about the time it was away.
 *
 * The last hour is read tick by tick, so an order that would have been filled
 * inside a minute is filled. Older stretches are read from the minute grid, where
 * a price between a minute's opening and closing is known to have been touched but
 * one outside it may not have been. Missing a fill is the safe direction to be
 * wrong in: the order waits, and the reader can see that it is still waiting.
 */
export function priceExtremesBetween(fromMs: number, toMs: number, seed = defaultSeed, startPrice = defaultStartPrice) {
  const start = Math.max(fromMs, marketEpoch)
  const end = Math.max(start, toMs)
  const tickWindowMs = 60 * 60 * 1000
  const fine = Math.max(start, end - tickWindowMs)
  let low = Number.POSITIVE_INFINITY
  let high = Number.NEGATIVE_INFINITY
  let lowAt = start
  let highAt = start

  const consider = (bars: { time: number; low: number; high: number }[]) => {
    for (const bar of bars) {
      if (bar.time < start || bar.time > end) continue
      if (bar.low < low) {
        low = bar.low
        lowAt = bar.time
      }
      if (bar.high > high) {
        high = bar.high
        highAt = bar.time
      }
    }
  }

  // The last hour is read one second at a time, so an order that would have been
  // filled inside a minute is filled. It is a single request: the seconds are
  // cheap once their minute has been walked.
  if (end > fine) {
    const seconds = Math.max(1, Math.ceil((end - fine) / 1000) + 1)
    consider(generateCandles({ timeframe: '1s', count: seconds, until: end, seed, startPrice }))
  }

  // Everything older is read on the minute grid, straight off the day paths, a
  // whole day at a time. The candles could answer this too, but a minute candle
  // is drawn from ticks, and asking for ticks for three days means rebuilding
  // forty thousand minute paths on the main thread before the page is usable.
  if (fine > start) {
    const coarse = minuteExtremesBetween(start, fine, seed, startPrice)
    if (coarse.low < low) {
      low = coarse.low
      lowAt = coarse.lowAt
    }
    if (coarse.high > high) {
      high = coarse.high
      highAt = coarse.highAt
    }
  }

  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    const price = seededMarket(seed, startPrice).priceAt(start)
    return { low: price, high: price, lowAt: start, highAt: start }
  }
  return { low, high, lowAt, highAt }
}

const sideSign = (side: Side): number => (side === 'buy' ? 1 : -1)

/**
 * The fee for filling this size at this price. It does not depend on the side: a
 * buy and a sell of the same size are charged the same to cross the spread.
 */
export function feeFor(size: number, price: number, liquidity: Liquidity): number {
  return quote(Math.abs(size * price) * (liquidity === 'maker' ? makerFeeRate : takerFeeRate), 4)
}

/**
 * The most notional this much free margin can open, leaving the fee payable.
 *
 * A levered position does not only post its share of the notional, it also pays a
 * fee on all of it, so a slider that divides the free margin by the leverage and
 * stops there promises a size the account will then refuse to open. Solving
 * `notional / leverage + notional * feeRate <= available` for the notional gives
 * the size that actually fits, which is `available * leverage / (1 + feeRate *
 * leverage)` — the fee eats into the leverage instead of being paid on top of it.
 */
export function maxNotionalFor(available: number, leverage: number, liquidity: Liquidity = 'taker'): number {
  if (available <= 0 || leverage <= 0) return 0
  const rate = liquidity === 'maker' ? makerFeeRate : takerFeeRate
  const exact = (available * leverage) / (1 + rate * leverage)
  // The algebra is exact and binary floating point is not: charged straight from
  // the quotient, a full-scale order needs 1000.0000000000002 of a thousand and
  // leaves the account a fraction of a cent short of the free margin it was
  // measured against. Rounding down to a cent of notional costs nothing any order
  // could notice — it is far finer than the size step — and makes the answer mean
  // what it says: open this, and the free margin lands on zero rather than on a
  // rounding error below it.
  return Math.floor(exact * 100) / 100
}

export function unrealizedFor(position: Position, mark: number): number {
  return (mark - position.entry) * position.size * sideSign(position.side)
}

/** Margin a position of this size and price needs at this leverage. */
export function marginFor(size: number, price: number, leverage: number): number {
  return (Math.abs(size) * price) / clamp(leverage, 1, maxLeverage)
}

export function maintenanceFor(size: number, price: number, rate: number): number {
  return Math.abs(size) * price * rate
}

/**
 * Where a position is wiped out.
 *
 * An isolated position is on its own: it is closed when its own margin, less the
 * maintenance margin, can no longer carry the loss. A cross position is carried by
 * the whole wallet, so its price depends on everything else that is open — the
 * long notional and the short notional on both sides of the equation, which is why
 * hedging one position with another pushes the other's liquidation price further
 * away rather than cancelling it out.
 */
/**
 * Where a position is liquidated when its own margin is all that stands behind it.
 *
 * This is the same arithmetic for any five numbers, so it is kept apart from the
 * cross case, which has to look at the whole account. That separation is what lets
 * a resting isolated order be shown the level it would be liquidated at, even
 * though the position it would open does not exist yet.
 */
export function isolatedLiquidationFor(
  size: number,
  entry: number,
  side: Side,
  margin: number,
  maintenance = maintenanceRateFor(10)
): number | null {
  if (!(size > 0)) return null
  const price =
    sideSign(side) > 0
      ? (entry * size - margin) / (size * (1 - maintenance))
      : (entry * size + margin) / (size * (1 + maintenance))
  return price > 0 ? quote(price, 2) : null
}

export function liquidationPriceFor(position: Position, account: Account): number | null {
  const size = position.size
  if (position.marginMode === 'isolated') {
    const own = position.maintenanceRate ?? maintenanceRateFor(position.leverage)
    const margin = position.margin > 0 ? position.margin : marginFor(size, position.entry, position.leverage)
    return isolatedLiquidationFor(size, position.entry, position.side, margin, own)
  }

  const cross = account.positions.filter((held) => held.marginMode === 'cross')
  const locked = account.positions
    .filter((held) => held.marginMode === 'isolated')
    .reduce((sum, held) => sum + held.margin, 0)
  const wallet = account.balance - locked
  let longSize = 0
  let shortSize = 0
  let longCost = 0
  let shortCost = 0
  let weighted = 0
  for (const held of cross) {
    const held_rate = held.maintenanceRate ?? maintenanceRateFor(held.leverage)
    weighted += held.size * held_rate
    if (held.side === 'buy') {
      longSize += held.size
      longCost += held.entry * held.size
    } else {
      shortSize += held.size
      shortCost += held.entry * held.size
    }
  }
  if (longSize === 0 && shortSize === 0) return null
  // The cross wallet backs every position, so one rate has to stand for all of
  // them: the size weighted average of the tiers they were opened under.
  const blended = weighted / (longSize + shortSize)
  const denominator = longSize - shortSize - blended * (longSize + shortSize)
  if (denominator === 0) return null
  const price = (longCost - shortCost - wallet) / denominator
  if (!Number.isFinite(price) || price <= 0) return null
  return quote(price, 2)
}

/** The wallet, marked to `price`, with every position resolved. */
export function viewAccount(account: Account, price: number, at: number = Date.now()): AccountView {
  const positions = account.positions.map((position) => {
    const notional = Math.abs(position.size * price)
    const initialMargin =
      position.marginMode === 'isolated' && position.margin > 0
        ? position.margin
        : marginFor(position.size, position.entry, position.leverage)
    const maintenance = maintenanceFor(position.size, price, position.maintenanceRate ?? maintenanceRateFor(position.leverage))
    const pnl = unrealizedFor(position, price)
    const closeFee = feeFor(position.size, price, 'taker')
    return {
      ...position,
      mark: price,
      pnl,
      notional,
      initialMargin,
      maintenance,
      equity: pnl + (position.marginMode === 'isolated' ? position.margin : 0) - closeFee,
      liquidation: liquidationPriceFor(position, account),
    }
  })
  const unrealized = positions.reduce((sum, position) => sum + position.pnl, 0)
  // Cross margin is lent out of the wallet, so it is not free any more. Isolated
  // margin has already left the balance when the position opened, so it is counted
  // in the figure reported below but never subtracted here: taking it out twice is
  // what made an all-in position show negative free margin the moment it filled.
  //
  // Maintenance margin is a floor *inside* the initial margin — a tenth at 10x, a
  // fiftieth at 50x — so it is never deducted as well. It decides when a position
  // is liquidated, not what is left in the wallet, and `liquidationPriceFor` is
  // where it belongs.
  const crossMargin = positions
    .filter((position) => position.marginMode === 'cross')
    .reduce((sum, position) => sum + position.initialMargin, 0)
  const isolatedMargin = positions
    .filter((position) => position.marginMode === 'isolated')
    .reduce((sum, position) => sum + position.margin, 0)
  const marginUsed = crossMargin + isolatedMargin
  const maintenance = positions.reduce((sum, position) => sum + position.maintenance, 0)
  const equity = account.balance + unrealized
  // Rounded, because this is the number a reader aims an order at and the one the
  // size slider is measured against. Subtracting a lent margin from an equity that
  // was itself built out of rounded figures leaves dust either side of zero, and
  // formatted as a currency that dust reads as "-$0.00" — a shortfall that is not
  // there, on a panel whose whole job is to say what a reader can afford.
  const available = quote(equity - crossMargin)
  return {
    balance: account.balance,
    equity,
    available,
    used: marginUsed,
    unrealized,
    marginUsed,
    maintenance,
    positions,
    orders: account.orders,
    trades: account.trades,
    deposits: account.deposits,
    seed: account.seed,
    startPrice: account.startPrice,
    price,
    at,
    atRisk: available < 0 && account.positions.length > 0,
  }
}

export function deposit(account: Account, amount: number, at: number = Date.now()): Account {
  const value = quote(Math.abs(amount))
  const balance = quote(account.balance + value)
  const [id, counted] = nextId(account, 'd')
  return {
    ...counted,
    balance,
    deposited: quote(account.deposited + value),
    deposits: [...account.deposits, { id, at, amount: value, balance }],
    savedAt: Math.max(account.savedAt, at),
  }
}

/**
 * Which side of the book an order takes, which is what decides its fee.
 *
 * A market order always takes: there is no price to wait for, so it is filled
 * against whatever is there. A limit order waits only while it is behind the
 * price, and a limit order at or through the price is filled straight away, which
 * makes it a taker wearing a limit price. The panel labels the fee from this too,
 * so the words and the number are the same decision read twice.
 */
export function liquidityFor(request: OrderRequest, price: number): Liquidity {
  if (request.kind === 'market') return 'taker'
  const limit = request.price ?? 0
  if (!Number.isFinite(limit) || limit <= 0) return 'taker'
  return request.side === 'buy' ? (limit >= price ? 'taker' : 'maker') : limit <= price ? 'taker' : 'maker'
}

/**
 * What an order would cost, and where it would leave the position, before it is
 * sent. The panel shows these numbers as they are typed, so this is the same code
 * that will decide whether the order is allowed.
 */
export function quoteOrder(account: Account, request: OrderRequest, price: number, at: number = Date.now()): Quote {
  const leverage = clamp(Math.trunc(request.leverage ?? account.leverage), 1, maxLeverage)
  const marginMode = request.marginMode ?? account.marginMode
  const purpose = request.purpose ?? 'open'
  const size = Math.abs(request.size)
  const empty: Quote = {
    ok: false,
    size: 0,
    price,
    notional: 0,
    margin: 0,
    fee: 0,
    total: 0,
    liquidation: null,
    liquidity: liquidityFor(request, price),
  }
  // The floor is on opening, not on closing. A position is allowed to be as small
  // as the smallest order, and a reader who holds one of those has to be able to
  // halve it: refusing a close below the floor would leave them holding something
  // they can neither add to nor take half of.
  if (!Number.isFinite(size) || size <= 0) return { ...empty, reason: 'size' }
  if (purpose === 'open' && size < sizeStep) return { ...empty, reason: 'size' }
  if (request.kind === 'limit' && (!Number.isFinite(request.price) || (request.price ?? 0) <= 0)) {
    return { ...empty, reason: 'price' }
  }

  const liquidity = liquidityFor(request, price)
  const entry = request.kind === 'limit' ? (request.price ?? price) : price
  const notional = size * entry
  const fee = feeFor(size, entry, liquidity)

  if (purpose === 'close') {
    const position = account.positions.find((held) => held.id === request.positionId)
    if (!position) return { ...empty, reason: 'position' }
    const closed = Math.min(size, position.size)
    return {
      ok: closed > 0,
      reason: closed > 0 ? undefined : 'size',
      size: closed,
      price: entry,
      notional: closed * entry,
      margin: 0,
      fee: feeFor(closed, entry, liquidity),
      total: feeFor(closed, entry, liquidity),
      liquidation: null,
      liquidity,
    }
  }

  const margin = marginFor(size, entry, leverage)
  // Protection asked for on the way in is checked against the price it will be
  // opened at, on the same rule as a level set later: a stop on the wrong side of
  // the entry is one that has already been reached.
  const wantedLoss = normaliseLevel(request.stopLoss ?? null)
  const wantedProfit = normaliseLevel(request.takeProfit ?? null)
  const opening = { side: request.side, entry } as Position
  if (wantedLoss !== null && !isBeyond(opening, wantedLoss, 'stopLoss')) {
    return { ...empty, reason: 'stopLossSide' }
  }
  if (wantedProfit !== null && !isBeyond(opening, wantedProfit, 'takeProfit')) {
    return { ...empty, reason: 'takeProfitSide' }
  }
  const view = viewAccount(account, price, at)
  const position: Position = {
    id: 'quote',
    side: request.side,
    size,
    entry,
    leverage,
    marginMode,
    margin: marginMode === 'isolated' ? margin : 0,
    maintenanceRate: maintenanceRateFor(leverage),
    openedAt: at,
    fee: 0,
    stopLoss: null,
    takeProfit: null,
  }
  const probe: Account = { ...account, positions: [...account.positions, position] }
  const enough =
    marginMode === 'isolated' ? view.balance - view.maintenance >= margin : view.available >= margin
  return {
    ok: enough,
    reason: enough ? undefined : 'margin',
    size,
    price: entry,
    notional,
    margin: quote(margin, 2),
    fee,
    total: quote(margin + fee, 2),
    liquidation: liquidationPriceFor(position, probe),
    liquidity,
  }
}

function closeRealized(account: Account, order: Order, fillPrice: number): number {
  const position = account.positions.find((held) => held.id === order.positionId)
  if (!position) return 0
  return (fillPrice - position.entry) * order.size * sideSign(position.side)
}

/**
 * Applies a fill and writes it to the record. The record is written with the
 * account as it stood immediately afterwards, so the liquidation price and the
 * balance in the history are the ones that were true at that moment rather than
 * ones reconstructed later.
 */
function applyFill(
  account: Account,
  order: Order,
  fillPrice: number,
  at: number,
  liquidity: Liquidity,
  mark: number = fillPrice,
  trigger?: ProtectionTrigger,
): Account {
  const forced = trigger !== undefined
  const closing = order.purpose === 'close' ? account.positions.find((held) => held.id === order.positionId) : undefined
  // A liquidation is not a close, and the two margin modes are not the same case
  // here. Isolated margin left the wallet when the position opened, so it is
  // already gone: a liquidation simply forfeits whatever was left of it and the
  // balance does not move again. Cross margin was only lent, so the loss is
  // settled against the wallet, and the maintenance margin is the penalty in place
  // of a taker fee — charging a fee as well would take the account below the
  // margin that was already spent, and leave a balance after a total loss.
  const isolatedLiquidation = forced && closing?.marginMode === 'isolated'
  const penalty =
    forced && !isolatedLiquidation
      ? maintenanceFor(order.size, fillPrice, closing?.maintenanceRate ?? maintenanceRateFor(order.leverage))
      : 0
  const fee = forced ? penalty : feeFor(order.size, fillPrice, liquidity)
  const realized = order.purpose === 'close' && !isolatedLiquidation ? closeRealized(account, order, fillPrice) : 0
  let balance = quote(account.balance + realized - fee)
  // Whatever a liquidation could not cover is not the reader's debt: the position
  // is gone, and an exchange writes the shortfall off against its insurance fund
  // rather than showing a negative wallet.
  if (forced) balance = Math.max(0, balance)
  let positions = account.positions
  let opened: Position | undefined

  if (order.purpose === 'close' && order.positionId) {
    const position = closing
    if (position) {
      // What is left is floored to a whole tick, and a floor is the safe direction
      // to round in here: rounding up would hand the reader a sliver they never
      // held, and a sliver under one tick is not a position the market could keep
      // anyway. So it is closed out and the margin given back, rather than carried
      // as something the reader can see but not act on.
      const left = Math.floor((position.size - order.size) / sizeStep + 1e-9) * sizeStep
      positions = left >= sizeStep ? [{ ...position, size: quote(left, 7) }] : []
      // An isolated position hands its unused margin back with the profit — unless
      // it was liquidated, in which case the margin is what was lost.
      if (position.marginMode === 'isolated' && positions.length === 0 && !isolatedLiquidation) {
        balance = quote(balance + position.margin)
      }
    }
  } else {
    const [id, counted] = nextId(account, 'p')
    account = counted
    opened = {
      id,
      side: order.side,
      size: order.size,
      entry: fillPrice,
      leverage: order.leverage,
      marginMode: order.marginMode,
      margin: order.marginMode === 'isolated' ? marginFor(order.size, fillPrice, order.leverage) : 0,
      maintenanceRate: maintenanceRateFor(order.leverage),
      openedAt: at,
      fee,
      // Asked for on the order, and kept on the position so the level survives
      // being written to storage and read back long after the order is gone.
      stopLoss: order.stopLoss ?? null,
      takeProfit: order.takeProfit ?? null,
    }
    positions = [...positions, opened]
    // Opening an isolated position takes its margin out of the wallet, which is
    // what makes that margin unavailable to anything else.
    if (order.marginMode === 'isolated') balance = quote(balance - opened.margin)
  }

  const [tradeId, counted] = nextId(account, 'f')
  const next: Account = {
    ...counted,
    balance,
    positions,
    realized: quote(account.realized + realized),
    feesPaid: quote(account.feesPaid + fee),
  }
  const subject = opened ?? (order.positionId ? next.positions.find((held) => held.id === order.positionId) : undefined)
  const trade: Trade = {
    id: tradeId,
    orderId: order.id,
    side: order.side,
    purpose: order.purpose,
    positionId: subject?.id,
    size: order.size,
    price: fillPrice,
    mark,
    fee,
    at,
    liquidity,
    leverage: order.leverage,
    marginMode: order.marginMode,
    realized,
    liquidation: subject ? liquidationPriceFor(subject, next) : null,
    balance: next.balance,
    // Only a liquidation is a liquidation. A stop and a target are the reader's
    // own exit, and filing them under the same word would say the market took
    // the position when it did not.
    ...(trigger === 'liquidation' ? { liquidated: true } : {}),
    ...(trigger ? { trigger } : {})
  }
  return { ...next, trades: [...next.trades, trade] }
}

/**
 * Sends an order. A market order, or a limit order that crosses the spread, is
 * filled at once; anything else rests until the market comes to it.
 */
export function placeOrder(account: Account, request: OrderRequest, at: number, market: Market): Account {
  const price = market.priceAt(at)
  const quote = quoteOrder(account, request, price, at)
  if (!quote.ok) return account
  const [id, counted] = nextId(account, 'o')
  const order: Order = {
    id,
    side: request.side,
    kind: request.kind,
    purpose: request.purpose ?? 'open',
    positionId: request.positionId,
    size: quote.size,
    price: request.kind === 'limit' ? request.price : undefined,
    leverage: clamp(Math.trunc(request.leverage ?? account.leverage), 1, maxLeverage),
    marginMode: request.marginMode ?? account.marginMode,
    placedAt: at,
    stopLoss: normaliseLevel(request.stopLoss ?? null),
    takeProfit: normaliseLevel(request.takeProfit ?? null),
  }
  const stamped = { ...counted, savedAt: Math.max(counted.savedAt, at) }
  if (quote.liquidity === 'taker') {
    return applyFill({ ...stamped, orders: stamped.orders }, order, quote.price, at, 'taker', price)
  }
  return { ...stamped, orders: [...stamped.orders, order] }
}

export function cancelOrder(account: Account, id: string, at: number = Date.now()): Account {
  return {
    ...account,
    orders: account.orders.filter((order) => order.id !== id),
    savedAt: Math.max(account.savedAt, at),
  }
}

/**
 * Puts protection on a position that is already open, or takes it off again.
 *
 * The side is checked against the entry, because a stop on the wrong side of the
 * price is not a stop that waits: it is one that has already happened. A reader who
 * types a stop above a long's entry has made a mistake, not a request, so it is
 * refused rather than filled on the spot.
 */
export function setProtection(
  account: Account,
  positionId: string,
  patch: { stopLoss?: number | null; takeProfit?: number | null },
  at: number = Date.now(),
  mark?: number
): { account: Account; reason?: 'position' | 'stopLossSide' | 'takeProfitSide' | 'stopLossPassed' | 'takeProfitPassed' } {
  const position = account.positions.find((held) => held.id === positionId)
  if (!position) return { account, reason: 'position' }

  const wantsLoss = patch.stopLoss !== undefined
  const wantsProfit = patch.takeProfit !== undefined
  const stopLoss = wantsLoss ? normaliseLevel(patch.stopLoss ?? null) : position.stopLoss
  const takeProfit = wantsProfit ? normaliseLevel(patch.takeProfit ?? null) : position.takeProfit

  // A long is stopped out below its entry and banked above it; a short is the
  // other way round.
  if (wantsLoss && stopLoss !== null && !isBeyond(position, stopLoss, 'stopLoss')) {
    return { account, reason: 'stopLossSide' }
  }
  if (wantsProfit && takeProfit !== null && !isBeyond(position, takeProfit, 'takeProfit')) {
    return { account, reason: 'takeProfitSide' }
  }

  // Being on the right side of the entry is not enough once the market has moved.
  // A stop set at or above the mark of a long, or a target set at or below it, is a
  // price the market has already been through: the level is saved, the order is
  // never triggered, and the reader is left believing a stop is standing when none
  // is. So the level has to be somewhere the market can still reach, which is the
  // side of the price it is at now.
  if (mark !== undefined && Number.isFinite(mark) && mark > 0) {
    const reference = { ...position, entry: mark, stopLoss: null, takeProfit: null } as Position
    if (wantsLoss && stopLoss !== null && !isBeyond(reference, stopLoss, 'stopLoss')) {
      return { account, reason: 'stopLossPassed' }
    }
    if (wantsProfit && takeProfit !== null && !isBeyond(reference, takeProfit, 'takeProfit')) {
      return { account, reason: 'takeProfitPassed' }
    }
  }

  const positions = account.positions.map((held) =>
    held.id === positionId ? { ...held, stopLoss, takeProfit } : held
  )
  return { account: { ...account, positions, savedAt: Math.max(account.savedAt, at) } }
}

function normaliseLevel(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null
  return quote(value, 2)
}

function isBeyond(position: Position, level: number, kind: 'stopLoss' | 'takeProfit'): boolean {
  if (position.side === 'buy') return kind === 'stopLoss' ? level < position.entry : level > position.entry
  return kind === 'stopLoss' ? level > position.entry : level < position.entry
}

/**
 * Brings the account up to `now` from wherever the snapshot left it.
 *
 * This is the part that makes closing the tab harmless. The market is a function
 * of its seed, so the hours the user was away are not a mystery to be papered over
 * — they are a path that can be walked. Every resting order the price traded
 * through gets filled at the price it asked for, and every position the market
 * reached its liquidation price gets liquidated, both at the moment they happened.
 *
 * The two kinds of event are applied in the order they occurred rather than one
 * pass after the other. It matters: an order filled at 09:05 changes the margin
 * behind a position, which moves that position's liquidation price, which decides
 * whether the 09:20 move was fatal.
 */
export function advanceTo(account: Account, now: number, market: Market): Account {
  if (now <= account.savedAt) return account
  let next = account
  const floor = account.savedAt

  type Event =
    | { at: number; orderId: string }
    | {
        at: number
        positionId: string
        trigger: ProtectionTrigger
        /** Where the market actually got to, which is where the fill happens. */
        fill: number
      }
  const events: Event[] = []

  // One range per distinct starting point, since every order and every position
  // that was already open at the snapshot shares the same one.
  const ranges = new Map<number, ReturnType<Market['extremesBetween']>>()
  const rangeFrom = (from: number) => {
    const key = Math.max(from, floor)
    let found = ranges.get(key)
    if (!found) {
      found = market.extremesBetween(key, now)
      ranges.set(key, found)
    }
    return found
  }

  for (const order of account.orders) {
    if (order.kind !== 'limit' || order.price === undefined) continue
    const extremes = rangeFrom(order.placedAt)
    // A buy waits for the market to come down to it, a sell for it to come up.
    const touched = order.side === 'buy' ? extremes.low <= order.price : extremes.high >= order.price
    if (!touched) continue
    const at = order.side === 'buy' ? extremes.lowAt : extremes.highAt
    events.push({ at: Math.min(Math.max(at, order.placedAt), now), orderId: order.id })
  }

  /**
   * What a position's own levels did over the stretch that began at `from`.
   *
   * A level is reached from a side, and the side says which extreme reached it.
   * The fill is then that extreme rather than the level itself: a market that
   * gapped through a stop never traded at the stop, and reading the fill off the
   * level would quietly hand back a better price than the market gave. The engine
   * only knows the extremes of the gap, not the path through it, so the extreme is
   * the closest honest answer — and it is the one that shows up on the fill as
   * slippage rather than hiding inside the level.
   */
  const protectionEvents = (
    position: Position,
    from: number,
    current: Account
  ): { at: number; positionId: string; trigger: ProtectionTrigger; fill: number }[] => {
    const extremes = rangeFrom(from)
    const candidates: { level: number; trigger: ProtectionTrigger; lowSide: boolean }[] = [
      { level: position.stopLoss ?? Number.NaN, trigger: 'stopLoss', lowSide: position.side === 'buy' },
      { level: position.takeProfit ?? Number.NaN, trigger: 'takeProfit', lowSide: position.side === 'sell' },
      {
        level: liquidationPriceFor(position, current) ?? Number.NaN,
        trigger: 'liquidation',
        lowSide: position.side === 'buy'
      }
    ]
    const found: { at: number; positionId: string; trigger: ProtectionTrigger; fill: number }[] = []
    for (const candidate of candidates) {
      if (!Number.isFinite(candidate.level)) continue
      const reached = candidate.lowSide ? extremes.low <= candidate.level : extremes.high >= candidate.level
      if (!reached) continue
      const at = candidate.lowSide ? extremes.lowAt : extremes.highAt
      found.push({
        at: Math.min(Math.max(at, position.openedAt), now),
        positionId: position.id,
        trigger: candidate.trigger,
        fill: candidate.lowSide ? extremes.low : extremes.high
      })
    }
    return found
  }

  for (const position of account.positions) {
    for (const event of protectionEvents(position, position.openedAt, next)) events.push(event)
  }

  // Whatever happened first in the gap happened first, so a stop that ran before a
  // take-profit is banked as a stop even though the same extremes crossed both.
  events.sort((left, right) => left.at - right.at)
  // The queue grows as it is worked. A resting order that fills part way through
  // the window brings a position with it, and the levels that came in on that
  // order have to be watched over what is left of the window rather than from the
  // next tick onwards — the market that took the entry may well carry on and take
  // the target in the same breath.
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]
    if ('orderId' in event) {
      const order = next.orders.find((held) => held.id === event.orderId)
      if (!order || order.price === undefined) continue
      next = { ...next, orders: next.orders.filter((held) => held.id !== order.id) }
      const before = next.positions.length
      next = applyFill(next, order, order.price, event.at, 'maker', market.priceAt(event.at))
      const opened = next.positions.length > before ? next.positions[next.positions.length - 1] : undefined
      if (opened) events.splice(index + 1, 0, ...protectionEvents(opened, event.at, next))
      continue
    }
    const position = next.positions.find((held) => held.id === event.positionId)
    if (!position) continue
    // A liquidation is repriced against the account as it stood at this moment,
    // not as it was when the snapshot was written, so a position the account can
    // no longer carry is not closed at all.
    if (event.trigger === 'liquidation' && liquidationPriceFor(position, next) === null) continue
    const [id, counted] = nextId(next, 'o')
    next = counted
    const order: Order = {
      id,
      side: position.side === 'buy' ? 'sell' : 'buy',
      kind: 'market',
      purpose: 'close',
      positionId: position.id,
      size: position.size,
      leverage: position.leverage,
      marginMode: position.marginMode,
      placedAt: event.at
    }
    next = applyFill(next, order, event.fill, event.at, 'taker', event.fill, event.trigger)
    if (event.trigger === 'liquidation') next = { ...next, liquidations: next.liquidations + 1 }
  }
  return { ...next, savedAt: now }
}

export type Snapshot = {
  version: number
  savedAt: number
  account: Account
}

/**
 * The history, kept whole and kept apart from the snapshot.
 *
 * Every trade and every deposit since the account was opened stays here, never
 * trimmed, because a history that quietly drops its oldest entries is not a
 * history. It lives separately so that a browser which has run out of room writes
 * the position and reports that the log did not fit, rather than losing both.
 *
 * The seed travels in the header: a trade is only reproducible if the market it
 * happened in can be named, and the start price is half of naming it.
 */
export type History = {
  version: number
  seed: string
  startPrice: number
  createdAt: number
  trades: Trade[]
  deposits: Deposit[]
}

// The keys live with the rest of the site's storage map, so the table owns them
// and a backup carries an account with it.
export const accountStorageKey = marketKeys.account
export const historyStorageKey = marketKeys.history

/** The account without its log: small, and the part that has to always be saved. */
export function saveAccount(account: Account, at: number = Date.now()): string {
  const snapshot: Snapshot = {
    version: accountVersion,
    savedAt: at,
    account: { ...account, trades: [], deposits: [], savedAt: at },
  }
  return JSON.stringify(snapshot)
}

export function saveHistory(account: Account): string {
  const history: History = {
    version: accountVersion,
    seed: account.seed,
    startPrice: account.startPrice,
    createdAt: account.createdAt,
    trades: account.trades,
    deposits: account.deposits,
  }
  return JSON.stringify(history)
}

const isTrade = (value: unknown): value is Trade => {
  const trade = value as Trade
  return Boolean(trade) && Number.isFinite(trade.at) && Number.isFinite(trade.price) && Number.isFinite(trade.size)
}
const isDeposit = (value: unknown): value is Deposit => {
  const entry = value as Deposit
  return Boolean(entry) && Number.isFinite(entry.at) && Number.isFinite(entry.amount)
}

/**
 * Reads a snapshot back, and refuses anything it does not understand. A stored
 * account is the user's money, so a shape that has changed is discarded rather
 * than guessed at, and the reader starts from a clean wallet instead of a broken
 * one.
 */
export function loadAccount(stored: string | null): Account | null {
  if (!stored) return null
  try {
    const parsed = JSON.parse(stored) as Snapshot
    if (!parsed || parsed.version !== accountVersion || !parsed.account) return null
    const account = parsed.account
    if (typeof account.balance !== 'number' || !Array.isArray(account.positions) || !Array.isArray(account.orders)) {
      return null
    }
    return {
      ...createAccount(),
      ...account,
      positions: account.positions
        .filter((position) => position && Number.isFinite(position.size) && position.size > 0)
        // A position written before protection existed carries no level at all, so
        // the two fields are filled in as none rather than left undefined and read
        // as a level of zero by everything downstream.
        .map((position) => ({
          ...position,
          stopLoss: normaliseLevel(position.stopLoss ?? null),
          takeProfit: normaliseLevel(position.takeProfit ?? null)
        })),
      orders: (Array.isArray(account.orders) ? account.orders : []).filter(
        (order) => order && (order.kind === 'market' || Number.isFinite(order.price)),
      ),
      trades: [],
      deposits: [],
      savedAt: Math.max(parsed.savedAt, marketEpoch),
    }
  } catch {
    return null
  }
}

/** Puts the record back on top of a freshly loaded snapshot, whole. */
export function loadHistory(stored: string | null, account: Account): Account {
  if (!stored) return account
  try {
    const parsed = JSON.parse(stored) as Partial<History>
    if (!parsed || parsed.version !== accountVersion) return account
    return {
      ...account,
      // A log recorded against a different market belongs to a different account.
      seed: typeof parsed.seed === 'string' ? parsed.seed : account.seed,
      startPrice: Number.isFinite(parsed.startPrice) ? (parsed.startPrice as number) : account.startPrice,
      createdAt: Number.isFinite(parsed.createdAt) ? (parsed.createdAt as number) : account.createdAt,
      trades: Array.isArray(parsed.trades) ? parsed.trades.filter(isTrade) : [],
      deposits: Array.isArray(parsed.deposits) ? parsed.deposits.filter(isDeposit) : [],
    }
  } catch {
    return account
  }
}
