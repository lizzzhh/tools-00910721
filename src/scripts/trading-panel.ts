import {
  accountStorageKey,
  advanceTo,
  cancelOrder,
  createAccount,
  deposit,
  historyStorageKey,
  loadAccount,
  loadHistory,
  makerFeeRate,
  maxLeverage,
  maxNotionalFor,
  slippedPrice,
  isolatedLiquidationFor,
  maintenanceRateFor,
  marginFor,
  placeOrder,
  quoteOrder,
  saveAccount,
  saveHistory,
  seededMarket,
  setProtection,
  viewAccount,
  type Account,
  type AccountView,
  type MarginMode,
  type Position,
  type OrderKind,
  type OrderRequest,
  type Side,
  type Trade
} from '../lib/trading.ts'
import { defaultSeed } from '../lib/candles.ts'
import { readValue, whenStorageReady, writeValue } from '../lib/storage.ts'
import { marketKeys } from '../lib/storage-schema.ts'

import {
  defaultSizeUnit,
  marginAsset,
  sizeFromUnits,
  sizePlacesFor,
  sizeStepFor,
  sizeTicker,
  sizeToUnits,
  sizeUnits,
} from '../lib/units.ts'
import type { SizeUnit } from '../lib/units.ts'
import { currentIntlLocale, translateNow } from '../i18n/client'
import type { MessageKey } from '../i18n'
import { actionLabel, closeLabel } from '../lib/wording.ts'
import type { ChartLevels } from './candle-chart.ts'
/** What the orders that are working: the ones waiting to be filled, and the stops and
 * targets waiting to be triggered.
 *
 * A stop is an order like any other, and it is listed with the limit orders
 * because that is what it is. The market has not touched it yet, it is holding a
 * position, and it can be taken off just as a resting order can. Leaving it to
 * live on the position card alone would hide a working order from the one place
 * the reader goes to see what is outstanding.
 */
function renderOrders(panel: Panel, view: AccountView): void {
  const host = find(panel, '[data-orders]')
  const count = find(panel, '[data-order-count]')
  const triggers = view.positions.flatMap((position) =>
    ([
      { key: 'stopLoss', level: position.stopLoss },
      { key: 'takeProfit', level: position.takeProfit }
    ] as const)
      .filter((row): row is { key: 'stopLoss' | 'takeProfit'; level: number } => row.level !== null)
      .map((row) => ({ ...row, position }))
  )
  if (count) count.textContent = String(view.orders.length + triggers.length)
  if (!host) return
  if (view.orders.length === 0 && triggers.length === 0) {
    host.innerHTML = `<p class="trade-empty">${escape(say('noOrders'))}</p>`
    return
  }
  // A resting order is a question waiting for an answer, so the card leads with
  // what it is waiting for and shows what it will cost to find out.
  const cards = view.orders.map((order) => {
    const long = order.side === 'buy'
    const price = order.price ?? 0
    const waiting = long ? price < view.price : price > view.price
    // What the order would leave behind, if it is a close: the profit or loss at
    // its own price. This is the number a reader deciding whether to wait for a
    // fill is actually looking for, and the engine will book it as it stands.
    const held = order.purpose === 'close' ? view.positions.find((row) => row.id === order.positionId) : undefined
    const outcome = held ? (long ? held.entry - price : price - held.entry) * order.size : null
    const opening = order.purpose === 'open'
    const rows: string[] = [
      `<div><dt>${escape(say('size'))}</dt><dd>${units(order.size)}</dd></div>`,
      `<div><dt>${escape(say('notional'))}</dt><dd>${money(order.size * price)}</dd></div>`,
      `<div><dt>${escape(say('fee'))}</dt><dd>${money(order.size * price * makerFeeRate, 4)}</dd></div>`,
      `<div><dt>${escape(say('placedAt'))}</dt><dd class="trade-card-time">${stamp(order.placedAt)}</dd></div>`
    ]
    let expected: string | null = null
    if (opening) {
      // An order that opens has no profit to promise, but it does have a target:
      // the one that came in with it. What that target is worth at this order's
      // own size and price is the return the reader is waiting for, and the stop
      // beside it is what the same trade costs if it is wrong. Between them they
      // are the reason to keep the order or to cancel it, so they are shown
      // together and a reader can see one without the other.
      const margin = marginFor(order.size, price, order.leverage)
      rows.push(`<div><dt>${escape(say('margin'))}</dt><dd>${money(margin)}</dd></div>`)
      if (order.takeProfit != null) {
        const reward = (long ? order.takeProfit - price : price - order.takeProfit) * order.size
        expected = `<i class="trade-card-return" data-tone="${reward >= 0 ? 'up' : 'down'}">${escape(
          say('expectedReturn')
        )} ${signed(reward)}</i>`
      } else {
        expected = `<i class="trade-card-return is-dim">${escape(say('noExpectedReturn'))}</i>`
      }
      if (order.stopLoss != null) {
        // Signed the other way from the return, because a stop is what the trade
        // costs when it is wrong: showing it as a gain would be a number that
        // reads well and means the opposite of what it is.
        const risk = -(long ? price - order.stopLoss : order.stopLoss - price) * order.size
        rows.push(`<div class="is-down"><dt>${escape(say('riskAtStop'))}</dt><dd>${signed(risk)}</dd></div>`)
      }
      // The liquidation line is only knowable for an isolated order, because a
      // cross one sits behind the whole account's equity and no resting order can
      // promise what that will be on the day it fills.
      if (order.marginMode === 'isolated') {
        const liq = isolatedLiquidationFor(order.size, price, order.side, margin, maintenanceRateFor(order.leverage))
        if (liq !== null) {
          rows.push(`<div><dt>${escape(say('liquidation'))}</dt><dd>${money(liq)}</dd></div>`)
        }
      }
    } else if (held && outcome !== null) {
      rows.push(
        `<div><dt>${escape(say('entry'))}</dt><dd>${money(held.entry)}</dd></div>`,
        `<div class="${outcome >= 0 ? 'is-up' : 'is-down'}"><dt>${escape(say(order.purpose === 'close' ? 'pnl' : 'pnlIfFilled'))}</dt><dd>${signed(outcome)}</dd></div>`
      )
    }
    // Levels a resting order will carry to the position it opens are part of the
    // order itself, so they are read on the order rather than left to be a
    // surprise on a position that does not exist yet.
    const levels = [
      { key: 'stopLoss', value: order.stopLoss },
      { key: 'takeProfit', value: order.takeProfit }
    ].filter((row) => row.value !== null && row.value !== undefined)
    return `<article class="trade-card is-order ${long ? 'is-long' : 'is-short'}">
        <header class="trade-card-head">
          <span class="trade-tag ${long ? 'is-long' : 'is-short'}">${escape(say(long ? 'long' : 'short'))}</span>
          <b class="trade-card-price">${money(price)}</b>
        </header>
        ${expected ?? ''}
        <dl class="trade-card-grid">${rows.join('')}</dl>
        ${
          levels.length === 0
            ? ''
            : `<p class="trade-card-levels">${levels
                .map(
                  (row) =>
                    `<span class="trade-level-tag is-${row.key}">${escape(say(`reason.${row.key}`))} ${money(row.value as number)}</span>`
                )
                .join('')}</p>`
        }
        <footer class="trade-card-foot">
          <span class="trade-card-settings">${escape(say(order.purpose === 'close' ? 'closeTicket' : waiting ? 'waiting' : 'crossing'))}</span>
          <button type="button" class="trade-close is-cancel" data-cancel="${order.id}">${escape(say('cancel'))}</button>
        </footer>
      </article>`
  })
  const triggerCards = triggers.map(({ position, key, level }) => {
    const long = position.side === 'buy'
    return `<article class="trade-card is-order is-trigger ${long ? 'is-long' : 'is-short'}">
        <header class="trade-card-head">
          <span class="trade-tag is-trigger">${escape(say(`reason.${key}`))}</span>
          <b class="trade-card-price">${money(level)}</b>
        </header>
        <dl class="trade-card-grid">
          <div><dt>${escape(say('size'))}</dt><dd>${units(position.size)}</dd></div>
          <div><dt>${escape(say(long ? 'long' : 'short'))}</dt><dd>${money(position.entry)}</dd></div>
          <div><dt>${escape(say('notional'))}</dt><dd>${money(position.size * level)}</dd></div>
          <div><dt>${escape(say('orderKind'))}</dt><dd>${escape(say(key === 'stopLoss' ? 'stopOrder' : 'targetOrder'))}</dd></div>
        </dl>
        <footer class="trade-card-foot">
          <span class="trade-card-settings">${escape(say(key === 'stopLoss' ? 'stopWaiting' : 'targetWaiting'))}</span>
          <button type="button" class="trade-close is-cancel" data-clear-level="${key}" data-position="${position.id}">${escape(say('cancel'))}</button>
        </footer>
      </article>`
  })
  host.innerHTML = [...cards, ...triggerCards].join('')
}


/**
 * How often the account is brought up to the present. Long enough that a long
 * session does no work it does not have to, short enough that a resting order
 * fills while the reader is watching rather than only when they come back.
 */
const settleMs = 15_000

type Panel = HTMLElement & {
  dataset: DOMStringMap & { seed?: string; ready?: string }
  dispose?: () => void
}
type Entry = { kind: 'trade'; at: number; trade: Trade } | { kind: 'deposit'; at: number; amount: number; balance: number }

/** The one part of the ticket the reader chooses rather than inherits. */
type Form = { side: Side; kind: OrderKind; leverage: number; marginMode: MarginMode }

/** What the size box is in, and therefore what the number in it means. */
let sizeUnit: SizeUnit = defaultSizeUnit

/**
 * Which colour means a gain.
 *
 * A green candle and a red one is the western convention; in much of the east a
 * rising market is red and a falling one is green, and a reader who reads a
 * profit in the wrong colour reads the whole account backwards. So it is a
 * choice, it is remembered, and the panel and the candles take the same one
 * rather than each having their own idea.
 */
const upColourStorageKey = marketKeys.upColour
const sizeUnitStorageKey = marketKeys.sizeUnit

const readSizeUnit = (): SizeUnit => {
  const stored = readValue(sizeUnitStorageKey)
  return sizeUnits.some((unit) => unit.id === stored) ? (stored as SizeUnit) : defaultSizeUnit
}

const writeSizeUnit = (value: SizeUnit): void => {
  writeValue(sizeUnitStorageKey, value)
}

type UpColour = 'success' | 'danger'

const readUpColour = (): UpColour => (readValue(upColourStorageKey) === 'danger' ? 'danger' : 'success')

const writeUpColour = (value: UpColour): void => {
  writeValue(upColourStorageKey, value)
}

/** Puts the choice on the panel and tells the chart, so the two never disagree. */
function applyUpColour(panel: Panel, plot: HTMLElement | null | undefined, value: UpColour): void {
  panel.dataset.up = value
  setPressed(panel, '[data-up-colour]', 'upColour', value)
  if (plot) plot.dispatchEvent(new CustomEvent('candle:up', { bubbles: true, detail: { up: value } }))
}

const number = (options: Intl.NumberFormatOptions) => new Intl.NumberFormat(currentIntlLocale(), options)
/** Dollars: the margin, the balance and every profit and loss are all in this. */
const money = (value: number, places = 2) =>
  number({ style: 'currency', currency: marginAsset, currencyDisplay: 'narrowSymbol', minimumFractionDigits: places, maximumFractionDigits: places }).format(value)
const signed = (value: number) =>
  number({ style: 'currency', currency: marginAsset, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'always' }).format(value)
/** TMZB: how much of the asset, never a price and never a dollar. */
const units = (value: number) => number({ minimumFractionDigits: 0, maximumFractionDigits: sizePlacesFor('tmzb') }).format(value)
/** A size in the unit the reader chose to type in. */
const sizeIn = (value: number, unit: SizeUnit) =>
  number({ minimumFractionDigits: 0, maximumFractionDigits: sizePlacesFor(unit) }).format(value)
const stamp = (at: number) =>
  new Intl.DateTimeFormat(currentIntlLocale(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'UTC'
  }).format(new Date(at))

const say = (key: string, vars?: Record<string, string | number>) =>
  translateNow(`toolUi.market.trading.${key}` as MessageKey, vars)

const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Not a real address. The balance on this page is a number in the reader's own
 *  browser, so there is nothing to send anywhere, which is what the joke turns on. */
const WIRE_ADDRESS = 'TRrnmU2GzstmYeUhCpxrzDfTGhrxz9Afgv'

/** Puts the request in front of the reader in a modal, so it has to be dealt with
 *  rather than scrolled past. */
function askForTransfer(panel: Panel, amount: string): void {
  const dialog = find<HTMLDialogElement>(panel, '[data-wire-dialog]')
  if (!dialog) return
  const text = find(panel, '[data-wire-message]')
  if (text) text.textContent = say('wireTransfer', { amount, address: WIRE_ADDRESS })
  if (typeof dialog.showModal === 'function') dialog.showModal()
  else dialog.setAttribute('open', '')
}

/** Closes the same dialog, whichever way it was opened. */
function closeTransfer(panel: Panel): void {
  const dialog = find<HTMLDialogElement>(panel, '[data-wire-dialog]')
  if (!dialog) return
  if (typeof dialog.close === 'function') dialog.close()
  else dialog.removeAttribute('open')
}

/** Every live panel, so a page swap can let go of them. */
const panels = new Set<Panel>()

const find = <T extends HTMLElement>(panel: Panel, selector: string): T | null => panel.querySelector<T>(selector)

function paint(panel: Panel, selector: string, value: string, tone?: 'up' | 'down'): void {
  const element = find(panel, selector)
  if (!element) return
  element.textContent = value
  if (tone) element.dataset.tone = tone
  else delete element.dataset.tone
}

/** The chart this account trades on: the one in the same tool, not another. */
function chartFor(panel: Panel): HTMLElement | null {
  const scope = panel.closest('.market-workspace') ?? document
  return scope.querySelector<HTMLElement>('[data-candle-chart]')
}

function readForm(panel: Panel): Form {
  const side = find(panel, '[data-side][aria-pressed="true"]')
  const kind = find(panel, '[data-kind][aria-pressed="true"]')
  const mode = find(panel, '[data-margin-mode][aria-pressed="true"]')
  const leverage = find<HTMLInputElement>(panel, '[data-leverage]')
  return {
    side: side?.dataset.side === 'sell' ? 'sell' : 'buy',
    kind: kind?.dataset.kind === 'limit' ? 'limit' : 'market',
    leverage: Math.max(1, Math.min(maxLeverage, Math.trunc(Number(leverage?.value ?? 10)))),
    marginMode: mode?.dataset.marginMode === 'isolated' ? 'isolated' : 'cross'
  }
}

function request(panel: Panel, form: Form, price: number): OrderRequest {
  const size = readSize(panel, price, form.leverage)
  const limit = Number(find<HTMLInputElement>(panel, '[data-limit-price]')?.value ?? 0)
  // A blank box is not a level of zero. It is no level, and an empty string here
  // becomes null on the way into the order so the position opens unprotected
  // rather than protected at a price nobody chose.
  const stopLoss = levelIn(panel, '[data-stop-loss]')
  const takeProfit = levelIn(panel, '[data-take-profit]')
  return {
    side: form.side,
    kind: form.kind,
    size,
    ...(form.kind === 'limit' ? { price: limit } : {}),
    leverage: form.leverage,
    marginMode: form.marginMode,
    ...(stopLoss === null ? {} : { stopLoss }),
    ...(takeProfit === null ? {} : { takeProfit })
  }
}

/** A protection box read as a price, or null when it is blank or not a number. */
function levelIn(panel: Panel, selector: string): number | null {
  const raw = (find<HTMLInputElement>(panel, selector)?.value ?? '').trim()
  if (raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

/**
 * A level the ticket is holding but has not sent yet.
 *
 * It is kept in a hidden box rather than in a variable so that everything which
 * builds an order — the quote, the submit, the reset — reads the same one place,
 * and so that a level cannot be quietly forgotten when the form is repainted.
 */
function readPending(panel: Panel, selector: string): string {
  return find<HTMLInputElement>(panel, selector)?.value.trim() ?? ''
}

function writePending(panel: Panel, selector: string, value: number | null): void {
  const input = find<HTMLInputElement>(panel, selector)
  if (input) input.value = value === null ? '' : String(value)
  rememberOrderConfig(panel)
}

/**
 * The ticket as the reader last had it, kept so it is there next time.
 *
 * Setting a stop and choosing isolated margin are both decisions that take a
 * moment to arrive at, and retyping them on every order is the reader doing the
 * tool's work. The levels are remembered as typed and not as accepted: they are
 * still checked against the price of whatever order they are sent with, so a
 * remembered level the market has since run past is refused rather than quietly
 * turned into the wrong side of a position.
 */
function rememberOrderConfig(panel: Panel): void {
  const mode = find(panel, '[data-margin-mode][aria-pressed="true"]')?.dataset.marginMode
  writeValue(
    marketKeys.orderConfig,
    JSON.stringify({
      marginMode: mode === 'isolated' ? 'isolated' : 'cross',
      stopLoss: levelIn(panel, '[data-stop-loss]'),
      takeProfit: levelIn(panel, '[data-take-profit]')
    })
  )
}

/** Puts back what the ticket was last left holding, if it can still be read. */
function restoreOrderConfig(panel: Panel): void {
  const stored = readValue(marketKeys.orderConfig)
  if (!stored) return
  let config: { marginMode?: string; stopLoss?: number | null; takeProfit?: number | null }
  try {
    config = JSON.parse(stored) as typeof config
  } catch {
    // A preference that cannot be read is a preference that is not there, and the
    // ticket opens with nothing set rather than with something invented.
    return
  }
  if (config.marginMode === 'cross' || config.marginMode === 'isolated') {
    setPressed(panel, '[data-margin-mode]', 'marginMode', config.marginMode)
  }
  const put = (selector: string, value: number | null | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return
    const input = find<HTMLInputElement>(panel, selector)
    if (input) input.value = value === null ? '' : String(value)
  }
  put('[data-stop-loss]', config.stopLoss)
  put('[data-take-profit]', config.takeProfit)
}

/**
 * Points the chips the only way that can be right.
 *
 * A chip is a distance from the mark, and which way that distance runs is not the
 * reader's to guess: a stop sits below a long and above a short, a target does the
 * opposite, and a resting order has to be on the far side of the mark from the one
 * that would fill it at once. So each row is given the sign that puts its price
 * where it can do the job it is there for, and a button that would set a price
 * which is already past is a button that is not offered.
 */
function paintPriceChips(panel: Panel, side: Side, kind?: string): void {
  for (const group of panel.querySelectorAll<HTMLElement>('[data-price-chips]')) {
    if (kind && group.dataset.priceKind !== kind) continue
    // A stop is a floor for a long and a ceiling for a short; a target is the
    // other way round. A plain price box has no such role, so it takes the side
    // the order is on: a buy that rests waits below the mark, a sell waits above.
    const sign =
      group.dataset.priceKind === 'stopLoss'
        ? side === 'buy' ? -1 : 1
        : group.dataset.priceKind === 'takeProfit'
          ? side === 'buy' ? 1 : -1
          : side === 'buy' ? -1 : 1
    for (const chip of group.querySelectorAll<HTMLElement>('[data-price-step]')) {
      const step = chip.dataset.priceStep ?? ''
      chip.dataset.sign = String(sign)
      chip.textContent = `${sign < 0 ? '−' : '+'}${step}%`
    }
  }
}

/**
 * Asks how the position should be closed, and closes it that way.
 *
 * A close is either a market order or a limit order, and the difference is worth
 * real money, so the card's close button does not pick one on the reader's behalf:
 * it opens this, where the choice is made and, for a limit order, the price is
 * typed. The size is not offered at all. A close takes what the position holds,
 * and a box that let the reader type a smaller number would be offering to close
 * a fraction of a position the engine has no way to carry.
 */
function askToClose(panel: Panel, position: Position): void {
  const dialog = find<HTMLDialogElement>(panel, '[data-close-dialog]')
  if (!dialog) return
  dialog.dataset.closePosition = position.id
  const long = position.side === 'buy'
  // The price the close is measured from is the mark, and the entry is named too:
  // a limit close has to be on the right side of the mark to be a resting order
  // rather than one that fills the moment it is placed.
  setContext(panel, `${say(long ? 'long' : 'short')} ${units(position.size)} · ${say('entry')} ${money(position.entry)}`)
  setPressed(panel, '[data-close-kind]', 'closeKind', 'market')
  // Closing a long is a sell, so its chips point up: they are there to price a
  // close that waits rather than one that fills at once.
  paintPriceChips(panel, long ? 'sell' : 'buy')
  const limitField = find(panel, '[data-close-limit-field]')
  if (limitField) limitField.hidden = true
  const box = find<HTMLInputElement>(panel, '[data-close-limit]')
  if (box) box.value = ''
  dialog.showModal()
}

/** Tells the reader which price the levels in the dialog are measured against. */
function setContext(panel: Panel, text: string): void {
  const context = find(panel, '[data-close-context]')
  if (context) context.textContent = text
}

/** Tells the reader which price the levels in the dialog are measured against. */
function setProtectionContext(panel: Panel, text: string): void {
  const context = find(panel, '[data-protection-context]')
  if (context) context.textContent = text
}

/**
 * The size in the box, as TMZB, which is the only unit the market deals in.
 *
 * The box may be holding the asset, what the position is worth, or what it costs
 * to open, so this is the one place that has to know both the price and the
 * leverage: the first is a conversion, the second is a division.
 */
function readSize(panel: Panel, price: number, leverage: number): number {
  const value = Number(find<HTMLInputElement>(panel, '[data-size]')?.value ?? 0)
  return Number.isFinite(value) ? sizeFromUnits(value, sizeUnit, price, leverage) : 0
}

/**
 * The largest position this account could open right now.
 *
 * It is the free margin at the leverage on the slider, less the fee the order
 * would owe. That last part is what stops the slider from promising a size the
 * account then refuses: at full scale the margin and the fee together come to
 * exactly the free margin, so pressing 100% opens.
 *
 * This is what the size slider is a share of, which is why the slider is a
 * percentage rather than an amount. Its ends stay put while the account and the
 * market move underneath it, so it never has to be re-scaled under a thumb.
 */
function maxSize(panel: Panel, account: Account, price: number, form: Form): number {
  const available = Math.max(0, viewAccount(account, price).available)
  const notional = maxNotionalFor(available, form.leverage, quoteOrder(account, request(panel, form, price), price).liquidity)
  return price > 0 ? notional / price : 0
}

/**
 * Writes a size into the box, in whatever unit the box is in, and moves the
 * slider and the readout with it.
 *
 * Rounding to the box's own step happens here rather than being discovered by the
 * order being refused. The nudge absorbs the dust that makes 0.0003 / 0.0001 come
 * out as 2.9999999999999996, which would otherwise drop the reader's size by a
 * step they never asked to lose.
 */
function writeSize(panel: Panel, size: number, price: number, account?: Account, form?: Form): void {
  const input = find<HTMLInputElement>(panel, '[data-size]')
  if (!input) return
  paint(panel, '[data-size-readout]', `${units(size)} ${sizeTicker('tmzb')}`)
  if (!(size > 0)) {
    input.value = ''
    paintSlider(panel, 0, price, account, form)
    return
  }
  const leverage = form?.leverage ?? readForm(panel).leverage
  const shown = sizeToUnits(size, sizeUnit, price, leverage)
  const step = Number(input.step || sizeStepFor(sizeUnit))
  const places = sizePlacesFor(sizeUnit)
  input.value = (Math.floor(shown / step + 1e-9) * step).toFixed(places)
  if (account && form) paintSlider(panel, sliderShare(panel, size, price, account, form), price, account, form)
}

/** Where a size sits on the slider, as a percentage of what the account can carry. */
function sliderShare(panel: Panel, size: number, price: number, account: Account, form: Form): number {
  const max = maxSize(panel, account, price, form)
  if (max <= 0) return 0
  return Math.max(0, Math.min(100, (size / max) * 100))
}

/** Puts the slider and its two end labels where the size says they should be. */
function paintSlider(panel: Panel, share: number, price: number, account?: Account, form?: Form): void {
  const slider = find<HTMLInputElement>(panel, '[data-size-slider]')
  if (slider && document.activeElement !== slider) slider.value = String(share)
  if (account && form) {
    const max = maxSize(panel, account, price, form)
    paint(panel, '[data-size-max]', max > 0 ? sizeIn(sizeToUnits(max, sizeUnit, price, form.leverage), sizeUnit) : '—')
  }
  // A shortcut is still the reason for the number if the slider landed on it.
  const hit = [10, 25, 50, 100].find((preset) => Math.abs(share - preset) < 0.05)
  pressChip(panel, '[data-size-preset]', 'sizePreset', hit === undefined ? null : String(hit))
}

/**
 * The three numbers under the size box, which between them answer "is this order
 * one I can afford".
 *
 * The first is what the size is worth, carried to the price the fill is likely to
 * get rather than the mark on the screen, so it moves with the slippage the order
 * will actually meet. The second is the ceiling the account can reach, already
 * reduced by the fee, so a reader can see the maximum before trying it. The third
 * is the free margin that maximum is a share of.
 */
function paintSizeFacts(panel: Panel, account: Account, form: Form, price: number): void {
  const size = readSize(panel, price, form.leverage)
  const side: Side = form.side
  const worth = size * slippedPrice(price, side)
  paint(panel, '[data-size-about]', size > 0 ? money(worth) : '—')
  const max = maxSize(panel, account, price, form)
  paint(panel, '[data-max-open]', max > 0 ? `${sizeIn(sizeToUnits(max, sizeUnit, price, form.leverage), sizeUnit)} ${sizeTicker(sizeUnit)}` : '—')
  paint(panel, '[data-free-margin]', money(Math.max(0, viewAccount(account, price).available)))
}

/**
 * Redraws the leverage, the summary the ticket carries, and the size.
 *
 * Changing the leverage or the margin mode empties the size box, and this is the
 * whole reason it has to. The size is a share of what the account can carry, and
 * what it can carry is the free margin at this leverage less the fee — so a size
 * chosen at 5x is several times the position the same box would open at 50x.
 * Leaving the old number in the box would leave the slider, the "worth about"
 * figure and the maximum all describing a position that is no longer the one the
 * reader asked for, and the order would go out at a size they did not choose after
 * the one thing that decides it had already been changed.
 */
function paintLeverage(panel: Panel, account: Account, price: number): void {
  const form = readForm(panel)
  paint(panel, '[data-leverage-value]', `${form.leverage}x`)
  paint(panel, '[data-margin-summary]', `${say(form.marginMode === 'cross' ? 'cross' : 'isolated')} · ${form.leverage}x`)
  clearSize(panel)
  renderQuote(panel, account, form, price)
  paintSizeFacts(panel, account, form, price)
}

/** Empties the size and every control that was a way of arriving at one. */
function clearSize(panel: Panel): void {
  const input = find<HTMLInputElement>(panel, '[data-size]')
  if (input) input.value = ''
  const slider = find<HTMLInputElement>(panel, '[data-size-slider]')
  if (slider) slider.value = '0'
  paint(panel, '[data-size-readout]', `${units(0)} ${sizeTicker('tmzb')}`)
  pressChip(panel, '[data-size-preset]', 'sizePreset', null)
}

/** Re-reads the same size in the other unit without losing what was typed. */
function switchSizeUnit(panel: Panel, next: SizeUnit, price: number, account: Account): void {
  const was = readSize(panel, price, readForm(panel).leverage)
  sizeUnit = next
  setPressed(panel, '[data-size-unit]', 'sizeUnit', next)
  find<HTMLInputElement>(panel, '[data-size]')?.setAttribute('step', sizeStepFor(sizeUnit))
  if (was > 0) writeSize(panel, was, price, account, readForm(panel))
  else paint(panel, '[data-size-readout]', `${units(0)} ${sizeTicker('tmzb')}`)
}

/**
 * Marks the one chip in a group that was chosen.
 *
 * A shortcut that has already been used has to say so, otherwise the reader is
 * left wondering whether the number in the box came from them or from a click
 * they half-remembered making. Typing in the box clears it, because then it was
 * not the shortcut.
 */
function pressChip(panel: Panel, selector: string, attribute: string, value: string | null): void {
  for (const chip of panel.querySelectorAll<HTMLElement>(selector)) {
    const on = value !== null && chip.dataset[attribute] === value
    chip.setAttribute('aria-pressed', on ? 'true' : 'false')
    chip.classList.toggle('is-on', on)
  }
}

function setPressed(panel: Panel, selector: string, attribute: string, value: string): void {
  for (const button of panel.querySelectorAll<HTMLButtonElement>(selector)) {
    button.setAttribute('aria-pressed', String(button.dataset[attribute] === value))
  }
}

function message(panel: Panel, key?: string): void {
  const element = find(panel, '[data-message]')
  if (!element) return
  element.textContent = key ? say(key) : ''
  if (key) element.dataset.tone = 'down'
  else delete element.dataset.tone
}

/**
 * Writes the account down. The snapshot and the log are stored apart, so a reader
 * whose trade history has outgrown the store still keeps their positions and
 * balance, and is told the log is short rather than losing both.
 */
function persist(panel: Panel, account: Account): void {
  // Serialising is what can fail here — a value the JSON format cannot express —
  // and the two halves are stored separately so that one of them failing does not
  // cost the other. The table itself queues the write and retries it; a store
  // that keeps refusing is reported by the storage layer rather than swallowed.
  let state = true
  try {
    writeValue(accountStorageKey, saveAccount(account))
  } catch {
    state = false
  }
  let history = true
  try {
    writeValue(historyStorageKey, saveHistory(account))
  } catch {
    history = false
  }
  const hint = find(panel, '[data-history-hint]')
  if (hint) {
    hint.dataset.tone = !state ? 'down' : history ? '' : 'warn'
    hint.textContent = state
      ? history
        ? say('historyHint')
        : say('historyFull')
      : say('accountFull')
  }
}

function renderFigures(panel: Panel, view: AccountView, account: Account): void {
  paint(panel, '[data-equity]', money(view.equity))
  paint(panel, '[data-balance]', money(view.balance))
  paint(panel, '[data-available]', money(view.available))
  paint(panel, '[data-unrealized]', signed(view.unrealized), view.unrealized >= 0 ? 'up' : 'down')
  paint(panel, '[data-margin-used]', money(view.marginUsed))
  // Kept as a running cost, so the reader can see what the market has taken.
  paint(panel, '[data-fees]', money(-account.feesPaid))
  paint(panel, '[data-deposited]', money(account.deposited))
}

function renderPositions(panel: Panel, view: AccountView): void {
  const host = find(panel, '[data-positions]')
  const count = find(panel, '[data-position-count]')
  if (count) count.textContent = String(view.positions.length)
  if (!host) return
  if (view.positions.length === 0) {
    host.innerHTML = `<p class="trade-empty">${escape(say('noPositions'))}</p>`
    return
  }
  // A position is a handful of numbers that only mean anything together, so it
  // is a card rather than a row of cells. The things a reader scans for — which way
  // it points, whether it is winning, how far it is from being liquidated — are the
  // ones given the size, and the rest sit under them as the details they are.
  const card = (position: AccountView['positions'][number]) => {
    const long = position.side === 'buy'
    const won = position.pnl >= 0
    const margin = position.marginMode === 'isolated' ? position.margin : position.initialMargin
    // The levels are shown, not typed: they are set in the same dialog the ticket
    // uses, so there is one place in the panel where a stop can be entered and
    // one set of rules about which side of the entry it belongs on.
    const levels = `${position.stopLoss === null ? '—' : money(position.stopLoss)} / ${
      position.takeProfit === null ? '—' : money(position.takeProfit)
    }`
    return `<article class="trade-card ${long ? 'is-long' : 'is-short'}" data-tone="${won ? 'up' : 'down'}">
      <header class="trade-card-head">
        <span class="trade-tag ${long ? 'is-long' : 'is-short'}">${escape(say(long ? 'long' : 'short'))}</span>
        <b class="trade-card-pnl" data-tone="${won ? 'up' : 'down'}">${signed(position.pnl)}</b>
      </header>
      <dl class="trade-card-grid">
        <div><dt>${escape(say('size'))}</dt><dd>${units(position.size)}</dd></div>
        <div><dt>${escape(say('notional'))}</dt><dd>${money(position.notional)}</dd></div>
        <div><dt>${escape(say('entry'))}</dt><dd>${money(position.entry)}</dd></div>
        <div class="is-warn"><dt>${escape(say('liquidation'))}</dt><dd>${
          position.liquidation === null ? escape(say('noLiquidation')) : money(position.liquidation)
        }</dd></div>
        <div><dt>${escape(say('margin'))}</dt><dd>${money(margin)}</dd></div>
      </dl>
      <footer class="trade-card-foot">
        <span class="trade-card-settings">${position.leverage}x ${escape(position.marginMode === 'cross' ? say('cross') : say('isolated'))}</span>
        <button type="button" class="trade-card-protection" data-protection-open="${position.id}">
          <b data-protection-summary="${position.id}">${levels}</b>
        </button>
        <button type="button" class="trade-close" data-close="${position.id}">${escape(say(closeLabel(long)))}</button>
      </footer>
    </article>`
  }
  host.innerHTML = view.positions.map(card).join('')
}

function tradeRow(trade: Trade): string {
  // A liquidation is named for the order that closed it, which is the other side
  // of the position it closed.
  const long = trade.side === 'buy'
  const verb = actionLabel(trade.side, trade.purpose, trade.liquidated === true)
  return `<div class="trade-event" data-trade="${trade.id}" data-at="${trade.at}" tabindex="0" role="button">
    <span class="trade-when">${stamp(trade.at)}</span>
    <span class="trade-tag ${trade.liquidated ? 'is-warn' : long ? 'is-long' : 'is-short'}">${escape(say(verb))}</span>
    <span class="trade-detail">${units(trade.size)} @ ${money(trade.price)}</span>
    <span class="trade-detail is-dim">${escape(say(trade.liquidity))} ${money(trade.fee, 4)}</span>
    <span class="trade-detail is-dim">${trade.leverage}x ${escape(trade.marginMode === 'cross' ? say('cross') : say('isolated'))}</span>
    ${trade.liquidation === null ? '' : `<span class="trade-detail is-dim">${escape(say('liqAt'))} ${money(trade.liquidation)}</span>`}
    ${trade.trigger ? `<span class="trade-detail is-dim">${escape(say(`reason.${trade.trigger}`))}</span>` : ''}
    ${trade.realized === 0 ? '' : `<span class="trade-detail" data-tone="${trade.realized >= 0 ? 'up' : 'down'}">${signed(trade.realized)}</span>`}
    <span class="trade-detail is-dim">${escape(say('balanceAfter'))} ${money(trade.balance)}</span>
  </div>`
}

function renderHistory(panel: Panel, view: AccountView): void {
  const host = find(panel, '[data-history]')
  if (!host) return
  const entries: Entry[] = [
    ...view.trades.map((trade): Entry => ({ kind: 'trade', at: trade.at, trade })),
    ...view.deposits.map((entry): Entry => ({ kind: 'deposit', ...entry }))
  ].sort((left, right) => right.at - left.at)

  paint(panel, '[data-start-price]', money(view.startPrice))
  if (entries.length === 0) {
    host.innerHTML = `<p class="trade-empty">${escape(say('noHistory'))}</p>`
    return
  }
  host.innerHTML = entries
    .map((entry) =>
      entry.kind === 'trade'
        ? tradeRow(entry.trade)
        : `<div class="trade-event" data-at="${entry.at}">
            <span class="trade-when">${stamp(entry.at)}</span>
            <span class="trade-tag is-deposit">${escape(say('deposit'))}</span>
            <span class="trade-detail">+${money(entry.amount)}</span>
            <span class="trade-detail is-dim">${escape(say('balanceAfter'))} ${money(entry.balance)}</span>
          </div>`
    )
    .join('')
}

function renderQuote(panel: Panel, account: Account, form: Form, price: number): void {
  const wanted = request(panel, form, price)
  const quote = quoteOrder(account, wanted, price)
  paint(panel, '[data-size-readout]', units(wanted.size))
  // The slider and the box are two views of one number, so whichever the reader
  // did not touch is moved to match.
  if (document.activeElement !== find(panel, '[data-size-slider]')) {
    paintSlider(panel, sliderShare(panel, wanted.size, price, account, form), price, account, form)
  }
  paint(panel, '[data-quote-notional]', quote.size > 0 ? money(quote.notional) : '—')
  paint(panel, '[data-quote-margin]', quote.size > 0 ? money(quote.margin) : '—')
  paint(panel, '[data-quote-fee]', quote.size > 0 ? money(quote.fee, 4) : '—')
  paint(
    panel,
    '[data-quote-liq]',
    quote.size > 0 ? (quote.liquidation === null ? say('noLiquidation') : money(quote.liquidation)) : '—'
  )
  // The engine has already decided whether this order waits or takes, so the
  // words under the fee are that decision and not a second opinion about it.
  paint(panel, '[data-quote-fee-kind]', say(quote.liquidity === 'taker' ? 'takerFee' : 'makerFee'))
  const submit = find<HTMLButtonElement>(panel, '[data-submit]')
  if (submit) {
    submit.textContent = say(actionLabel(form.side, 'open', false))
    submit.classList.toggle('is-long', form.side === 'buy')
    submit.classList.toggle('is-short', form.side === 'sell')
    submit.disabled = !quote.ok
  }
}

function drawLevels(panel: Panel, view: AccountView, price: number): void {
  const levels: ChartLevels = {
    price,
    levels: view.positions.flatMap((position) => {
      const rows: ChartLevels['levels'] = [
        { value: position.entry, label: position.side === 'buy' ? 'L' : 'S', kind: 'entry' }
      ]
      // The two levels the reader set get the same treatment as the entry and the
      // liquidation line, so all four are read down one edge of the chart.
      if (position.stopLoss !== null) {
        rows.push({ value: position.stopLoss, label: 'SL', kind: 'stopLoss' })
      }
      if (position.takeProfit !== null) {
        rows.push({ value: position.takeProfit, label: 'TP', kind: 'takeProfit' })
      }
      if (position.liquidation !== null) {
        rows.push({ value: position.liquidation, label: 'LIQ', kind: 'liquidation' })
      }
      return rows
    }),
    // The chart marks every fill the record holds, so a reader can find the moment
    // a position was opened instead of reading down a list of timestamps.
    marks: view.trades.map((trade) => ({
      at: trade.at,
      side: trade.side,
      purpose: trade.liquidated ? 'liquidation' : trade.purpose
    }))
  }
  chartFor(panel)?.dispatchEvent(new CustomEvent('candle:levels', { bubbles: true, detail: levels }))
}

function render(panel: Panel, account: Account, price: number): void {
  const view = viewAccount(account, price)
  const form = readForm(panel)
  // The chips are a distance from the mark and the mark moves, so they are pointed
  // on every repaint rather than only when the reader changes side.
  paintPriceChips(panel, form.side)
  renderFigures(panel, view, account)
  renderPositions(panel, view)
  renderOrders(panel, view)
  renderHistory(panel, view)
  renderQuote(panel, account, form, price)
  paintSizeFacts(panel, account, form, price)
  paintProtectionSummary(panel)
  drawLevels(panel, view, price)
}

/** What the ticket's stop and target are, read back the way a reader sees them. */
function paintProtectionSummary(panel: Panel): void {
  const summary = find(panel, '[data-protection-summary]')
  if (!summary) return
  const show = (selector: string) => {
    const value = levelIn(panel, selector)
    return value === null ? '—' : money(value)
  }
  summary.textContent = `${show('[data-stop-loss]')} / ${show('[data-take-profit]')}`
}

/**
 * Reproduces a trade: the same seed, stopped at the moment it happened. The chart
 * is asked for that window, and the account says what the record says about it —
 * which is the price it filled at and what it cost, not a fresh estimate.
 */
function focusOn(panel: Panel, account: Account, at: number): void {
  chartFor(panel)?.dispatchEvent(new CustomEvent('candle:focus', { bubbles: true, detail: { at } }))
  for (const row of panel.querySelectorAll<HTMLElement>('[data-trade]')) {
    row.classList.toggle('is-focus', Number(row.dataset.at) === at)
  }
  const bar = find(panel, '[data-live-bar]')
  if (bar) bar.hidden = false
  const context = find(panel, '[data-live-context]')
  if (!context) return
  const trade = [...account.trades].reverse().find((held) => held.at <= at)
  context.textContent = trade
    ? `${stamp(trade.at)} · ${units(trade.size)} @ ${money(trade.price)} · ${say(trade.liquidity)} ${money(trade.fee, 4)}`
    : stamp(at)
}

function setup(panel: Panel): void {
  const seed = panel.dataset.seed || defaultSeed
  let account = restore(panel, seed)
  const market = seededMarket(account.seed, account.startPrice)
  let price = market.priceAt(Date.now())

  const commit = (next: Account) => {
    account = next
    persist(panel, account)
    render(panel, account, price)
  }

  const settle = () => {
    const before = account.trades.length
    const next = advanceTo(account, Date.now(), market)
    if (next !== account) account = next
    if (account.trades.length !== before) {
      persist(panel, account)
      // Something happened while the reader was away, so it is worth saying so.
      message(panel, 'settled')
    }
    render(panel, account, price)
  }

  panels.add(panel)

  const leverage = find<HTMLInputElement>(panel, '[data-leverage]')
  leverage?.addEventListener('input', () => {
    // Dragged by hand, so no preset is the reason for the number on the slider.
    pressChip(panel, '[data-leverage-preset]', 'leveragePreset', null)
    paintLeverage(panel, account, price)
  })
  for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-leverage-preset]')) {
    button.addEventListener('click', () => {
      pressChip(panel, '[data-leverage-preset]', 'leveragePreset', button.dataset.leveragePreset ?? null)
      if (leverage) leverage.value = button.dataset.leveragePreset ?? '10'
      paintLeverage(panel, account, price)
    })
  }
  for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-side]')) {
    button.addEventListener('click', () => {
      setPressed(panel, '[data-side]', 'side', button.dataset.side ?? 'buy')
      paintPriceChips(panel, button.dataset.side === 'sell' ? 'sell' : 'buy')
      renderQuote(panel, account, readForm(panel), price)
    })
  }
  for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-kind]')) {
    button.addEventListener('click', () => {
      setPressed(panel, '[data-kind]', 'kind', button.dataset.kind ?? 'market')
      const limit = button.dataset.kind === 'limit'
      const field = find(panel, '[data-limit-field]')
      if (field) field.hidden = !limit
      const input = find<HTMLInputElement>(panel, '[data-limit-price]')
      // An empty limit box would send an order for no reason, so it starts at the
      // market and the reader moves it from there.
      if (limit && input && !input.value) input.value = price.toFixed(2)
      renderQuote(panel, account, readForm(panel), price)
    })
  }
  for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-margin-mode]')) {
    button.addEventListener('click', () => {
      setPressed(panel, '[data-margin-mode]', 'marginMode', button.dataset.marginMode ?? 'cross')
      rememberOrderConfig(panel)
      paintLeverage(panel, account, price)
    })
  }

  // The margin settings live in a dialog of their own, because a leverage slider
  // sitting beside the size slider is read as one control with two meanings.
  const dialog = find<HTMLDialogElement>(panel, '[data-margin-dialog]')
  find(panel, '[data-margin-open]')?.addEventListener('click', () => dialog?.showModal())
  find(panel, '[data-margin-done]')?.addEventListener('click', () => dialog?.close())

  // The stop and the target are set in a dialog of their own, on the ticket and on
  // a position alike, for the same reason the margin settings are: a price box
  // lying beside the size box is read as one control with two meanings, and a
  // position card is too small a place to type a price without covering itself.
  const protection = find<HTMLDialogElement>(panel, '[data-protection-dialog]')
  const stopBox = find<HTMLInputElement>(panel, '[data-protection-stop]')
  const targetBox = find<HTMLInputElement>(panel, '[data-protection-target]')
  const blank = (value: number | null) => (value === null ? '' : String(value))

  const editProtection = (target?: string) => {
    if (!protection) return
    protection.dataset.editPosition = target ?? ''
    const held = target ? account.positions.find((position) => position.id === target) : undefined
    const long = held ? held.side === 'buy' : readForm(panel).side === 'buy'
    if (held) {
      if (stopBox) stopBox.value = blank(held.stopLoss)
      if (targetBox) targetBox.value = blank(held.takeProfit)
      // The side rule works off the entry, and the entry does not move, so it is
      // the one price named here. The mark is not: it changes with the market, and
      // a figure printed beside a level is one the reader is right to distrust.
      setProtectionContext(panel, `${say(long ? 'long' : 'short')} · ${say('entry')} ${money(held.entry)}`)
    } else {
      if (stopBox) stopBox.value = readPending(panel, '[data-stop-loss]')
      if (targetBox) targetBox.value = readPending(panel, '[data-take-profit]')
      setProtectionContext(panel, say(long ? 'long' : 'short'))
    }
    paintPriceChips(panel, long ? 'buy' : 'sell')
    protection.showModal()
  }
  for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-close-kind]')) {
    button.addEventListener('click', () => {
      setPressed(panel, '[data-close-kind]', 'closeKind', button.dataset.closeKind ?? 'market')
      const limitField = find(panel, '[data-close-limit-field]')
      if (limitField) limitField.hidden = button.dataset.closeKind !== 'limit'
      find<HTMLInputElement>(panel, '[data-close-limit]')?.focus()
    })
  }
  const closeDialog = find<HTMLDialogElement>(panel, '[data-close-dialog]')
  find(panel, '[data-close-cancel]')?.addEventListener('click', () => closeDialog?.close())
  find(panel, '[data-close-done]')?.addEventListener('click', () => {
    const target = closeDialog?.dataset.closePosition
    const position = account.positions.find((held) => held.id === target)
    if (!position || !closeDialog) return
    const kind = find(panel, '[data-close-kind][aria-pressed="true"]')?.dataset.closeKind === 'limit' ? 'limit' : 'market'
    const limit = Number(find<HTMLInputElement>(panel, '[data-close-limit]')?.value ?? '')
    const wanted: OrderRequest = {
      // Closing buys back a short and sells a long: the side is the other side of
      // the position, so it is derived here rather than asked for.
      side: position.side === 'buy' ? 'sell' : 'buy',
      kind,
      // The engine checks a close against the position it names, so the size is
      // read back from the position rather than taken from anything on screen.
      size: position.size,
      ...(kind === 'limit' ? { price: limit } : {}),
      purpose: 'close',
      positionId: position.id
    }
    const next = placeOrder(account, wanted, Date.now(), market)
    if (next.trades.length === account.trades.length && next.orders.length === account.orders.length) {
      const quote = quoteOrder(account, wanted, price)
      message(panel, quote.reason ? `refused.${quote.reason}` : 'refused')
      return
    }
    closeDialog.close()
    commit(next)
  })
  find(panel, '[data-protection-open]')?.addEventListener('click', () => editProtection(undefined))
  // Delegated, because the rows are the same everywhere and some of them live
  // behind a dialog that is rebuilt rather than one that is bound once.
  panel.addEventListener('click', (event) => {
    const chip = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-price-step]')
    const group = chip?.closest<HTMLElement>('[data-price-chips]')
    const step = Number(chip?.dataset.priceStep)
    const sign = Number(chip?.dataset.sign)
    if (!group?.dataset.target || !Number.isFinite(step) || !Number.isFinite(sign)) return
    // Offset from the mark, not from whatever is already typed, so two presses of
    // the same chip land on the same price and the box never drifts.
    const box = find<HTMLInputElement>(panel, group.dataset.target)
    if (box) box.value = (price * (1 + (sign * step) / 100)).toFixed(2)
  })
  // The shortcut is in the markup, so it is bound here: it takes the price as it
  // stands at the moment of the press, which is the only moment a reader looking
  // for a market price can be asking about.
  find(panel, '[data-at-market]')?.addEventListener('click', () => {
    const box = find<HTMLInputElement>(panel, '[data-limit-price]')
    if (box) box.value = price.toFixed(2)
    render(panel, account, price)
  })
  find(panel, '[data-protection-clear]')?.addEventListener('click', () => {
    if (stopBox) stopBox.value = ''
    if (targetBox) targetBox.value = ''
  })
  find(panel, '[data-protection-done]')?.addEventListener('click', () => {
    const stopLoss = levelIn(panel, '[data-protection-stop]')
    const takeProfit = levelIn(panel, '[data-protection-target]')
    const target = protection?.dataset.editPosition
    if (!target) {
      // On the ticket nothing is sent yet: the levels wait with the order and are
      // checked against its price the moment the reader presses submit.
      writePending(panel, '[data-stop-loss]', stopLoss)
      writePending(panel, '[data-take-profit]', takeProfit)
      render(panel, account, price)
      protection?.close()
      return
    }
    // The mark goes with it, so a level the market has already been through is
    // refused here rather than saved as a stop that can never be triggered.
    const result = setProtection(account, target, { stopLoss, takeProfit }, Date.now(), price)
    if (result.reason) {
      // A level on the wrong side of the entry, or of the price as it is now, is a
      // mistyped price rather than a request, so the position is left as it was.
      message(panel, `refused.${result.reason}`)
      protection?.close()
      return
    }
    commit(result.account)
    protection?.close()
  })
  for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-size-unit]')) {
    button.addEventListener('click', () => {
      const next = (button.dataset.sizeUnit ?? 'tmzb') as SizeUnit
      if (next === sizeUnit) return
      writeSizeUnit(next)
      switchSizeUnit(panel, next, price, account)
      const form = readForm(panel)
      renderQuote(panel, account, form, price)
      paintSizeFacts(panel, account, form, price)
    })
  }
  find<HTMLInputElement>(panel, '[data-size-slider]')?.addEventListener('input', (event) => {
    const slider = event.currentTarget as HTMLInputElement
    const form = readForm(panel)
    const share = Math.max(0, Math.min(100, Number(slider.value) || 0))
    // A slider at zero is a position of no size, which is a blank box rather than
    // a zero the engine would have to be told is allowed.
    if (share > 0) writeSize(panel, (maxSize(panel, account, price, form) * share) / 100, price, account, form)
    else {
      const input = find<HTMLInputElement>(panel, '[data-size]')
      if (input) input.value = ''
      paint(panel, '[data-size-readout]', `${units(0)} ${sizeTicker('tmzb')}`)
      pressChip(panel, '[data-size-preset]', 'sizePreset', null)
    }
    renderQuote(panel, account, form, price)
    paintSizeFacts(panel, account, form, price)
  })
  for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-up-colour]')) {
    button.addEventListener('click', () => {
      const next = (button.dataset.upColour ?? 'success') as UpColour
      writeUpColour(next)
      applyUpColour(panel, chartFor(panel), next)
      // The whole account is redrawn, because every coloured number in it moved.
      render(panel, account, price)
    })
  }
  for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-size-preset]')) {
    button.addEventListener('click', () => {
      const form = readForm(panel)
      const share = Number(button.dataset.sizePreset ?? '25') / 100
      const size = maxSize(panel, account, price, form) * share
      writeSize(panel, size, price, account, form)
      renderQuote(panel, account, form, price)
    })
  }
  for (const input of panel.querySelectorAll<HTMLInputElement>('[data-size], [data-limit-price]')) {
    input.addEventListener('input', () => {
      const form = readForm(panel)
      if (input.hasAttribute('data-size')) {
        // The box was typed into, so no shortcut is the reason for what is in it.
        pressChip(panel, '[data-size-preset]', 'sizePreset', null)
        paintSlider(panel, sliderShare(panel, readSize(panel, price, form.leverage), price, account, form), price, account, form)
        paintSizeFacts(panel, account, form, price)
      }
      renderQuote(panel, account, form, price)
    })
  }
  for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-amount]')) {
    button.addEventListener('click', () => {
      const input = find<HTMLInputElement>(panel, '[data-deposit-amount]')
      if (input) input.value = button.dataset.amount ?? ''
      pressChip(panel, '[data-amount]', 'amount', button.dataset.amount ?? null)
    })
  }
  find<HTMLInputElement>(panel, '[data-deposit-amount]')?.addEventListener('input', () => {
    pressChip(panel, '[data-amount]', 'amount', null)
  })
  let topUps = 0
  find(panel, '[data-wire-done]')?.addEventListener('click', () => closeTransfer(panel))
  find(panel, '[data-deposit-form]')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const input = find<HTMLInputElement>(panel, '[data-deposit-amount]')
    const amount = Number(input?.value ?? 0)
    if (!Number.isFinite(amount) || amount <= 0) return
    commit(deposit(account, amount))
    if (input) input.value = ''
    message(panel)
    topUps += 1
    // Every tenth top-up, and the first, the page asks to be paid by name, and asks
    // it in a modal, because a request for money is not a line of small print under a
    // form. It is a joke, and the numbers make it one: the balance is a figure in the
    // reader's own browser and the address is not a real one, so there is nothing to
    // send it to and nothing at stake in saying so.
    if (topUps === 1 || topUps % 10 === 0) askForTransfer(panel, money(amount))
  })
  find(panel, '[data-submit]')?.addEventListener('click', () => {
    const form = readForm(panel)
    const wanted = request(panel, form, price)
    const before = account.trades.length
    const resting = account.orders.length
    const next = placeOrder(account, wanted, Date.now(), market)
    if (next.trades.length === before && next.orders.length === resting) {
      const quote = quoteOrder(account, wanted, price)
      message(panel, quote.reason ? `refused.${quote.reason}` : 'refused')
      return
    }
    // An order that rested rather than filled has not used the size box.
    if (next.orders.length > resting) {
      const input = find<HTMLInputElement>(panel, '[data-size]')
      if (input) input.value = ''
    }
    commit(next)
    message(panel)
  })
  find(panel, '[data-reset]')?.addEventListener('click', () => {
    if (typeof confirm === 'function' && !confirm(say('resetConfirm'))) return
    // The ticket's levels belong to the account being cleared, so they go with it.
    writePending(panel, '[data-stop-loss]', null)
    writePending(panel, '[data-take-profit]', null)
    commit(createAccount({ seed }))
  })
  find(panel, '[data-back-live]')?.addEventListener('click', () => {
    chartFor(panel)?.dispatchEvent(new CustomEvent('candle:live', { bubbles: true }))
    const bar = find(panel, '[data-live-bar]')
    if (bar) bar.hidden = true
    for (const row of panel.querySelectorAll('[data-trade]')) row.classList.remove('is-focus')
  })

  // Delegated, because the tables are rebuilt on every settle.
  panel.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null
    // The ticket's own opener is in the markup and bound above; the ones on the
    // position cards are not, since those cards arrive after setup.
    const openProtection = target?.closest<HTMLElement>('[data-protection-open]')
    if (openProtection) {
      editProtection(openProtection.dataset.protectionOpen || undefined)
      return
    }
    const close = target?.closest<HTMLElement>('[data-close]')
    if (close?.dataset.close) {
      const position = account.positions.find((held) => held.id === close.dataset.close)
      if (!position) return
      askToClose(panel, position)
      return
    }
    // A stop or target listed among the orders is taken off the same way a
    // resting one is: by naming the level and the position it was on.
    const clearLevel = target?.closest<HTMLElement>('[data-clear-level]')
    if (clearLevel?.dataset.clearLevel && clearLevel.dataset.position) {
      const key = clearLevel.dataset.clearLevel === 'takeProfit' ? 'takeProfit' : 'stopLoss'
      const held = account.positions.find((position) => position.id === clearLevel.dataset.position)
      if (!held) return
      const levels = { stopLoss: held.stopLoss, takeProfit: held.takeProfit, [key]: null }
      const result = setProtection(account, held.id, levels)
      if (result.reason) {
        message(panel, `refused.${result.reason}`)
        return
      }
      commit(result.account)
      return
    }
    const cancel = target?.closest<HTMLElement>('[data-cancel]')
    if (cancel?.dataset.cancel) {
      commit(cancelOrder(account, cancel.dataset.cancel, Date.now()))
      return
    }
    const row = target?.closest<HTMLElement>('[data-trade]')
    if (row?.dataset.at) focusOn(panel, account, Number(row.dataset.at))
  })
  panel.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const row = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-trade]')
    if (!row?.dataset.at) return
    event.preventDefault()
    focusOn(panel, account, Number(row.dataset.at))
  })

  chartFor(panel)?.addEventListener('candle:price', (event) => {
    const detail = (event as CustomEvent<{ price: number; live: boolean }>).detail
    if (!detail) return
    price = detail.price
    // While the reader is looking at a past moment, the account stays as it is:
    // it is not being managed at a price that is not happening.
    if (detail.live) render(panel, account, price)
  })

  render(panel, account, price)
  const timer = window.setInterval(settle, settleMs)
  const onHide = () => {
    // Leaving the tab is not leaving the market: the account is marked and written
    // down now, so the gap that follows is short to walk back.
    account = advanceTo(account, Date.now(), market)
    persist(panel, account)
  }
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('pagehide', onHide)
  panel.dispose = () => {
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', onHide)
    window.removeEventListener('pagehide', onHide)
    panels.delete(panel)
  }
}

/**
 * Reads the account back and brings it up to the present. The market is fixed by
 * its seed, so the time that passed while the tab was shut is not lost: it is
 * replayed, and the account is asked what it would have done.
 */
function restore(panel: Panel, seed: string): Account {
  let account: Account | null = null
  try {
    account = loadAccount(readValue(accountStorageKey) ?? null)
    if (account) {
      try {
        account = loadHistory(readValue(historyStorageKey) ?? null, account)
      } catch {
        // A log that cannot be read is a missing log, not a broken account.
      }
    }
  } catch {
    account = null
  }
  if (!account || account.seed !== seed) {
    // A different market is a different account; the old one is left where it is.
    account = createAccount({ seed })
    panel.dataset.seed = seed
  }
  return advanceTo(account, Date.now(), seededMarket(seed, account.startPrice))
}

/**
 * One tab at a time may run the simulator.
 *
 * Two tabs on one account are not two views of it, they are two of it. Each holds
 * its own copy of the position and writes the whole lot back on every action, so
 * the second tab's click silently undoes the first tab's, and neither reader ever
 * finds out. The lock is taken from the browser rather than written by hand, so a
 * tab that is closed, reloaded or crashes hands it over by itself and nothing here
 * has to notice and clear up after itself.
 */
const SIMULATOR_LOCK = 'tmzb-market-simulator-v1'
const HEARTBEAT_KEY = 'tmzb-market-simulator-tab-v1'
/** Long enough to cover a backgrounded tab's throttled timers, short enough that a
 *  tab killed outright is not locked out for the rest of the session. */
const HEARTBEAT_STALE_MS = 12_000

function claimWithWebLocks(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let answered = false
    const answer = (held: boolean) => {
      if (answered) return
      answered = true
      resolve(held)
    }
    try {
      const held = navigator.locks.request(SIMULATOR_LOCK, { ifAvailable: true }, async (lock) => {
        if (!lock) {
          answer(false)
          return
        }
        // The lock is held for as long as this callback runs, so it is held for as
        // long as this tab is open. A promise that never settles is the whole trick.
        answer(true)
        await new Promise<void>(() => {})
      })
      void held.catch(() => answer(false))
    } catch {
      answer(false)
    }
  })
}

/** The same rule for a browser without the Web Locks API, which cannot be allowed to
 *  mean "two tabs at a time" either. */
function claimWithHeartbeat(): boolean {
  try {
    const held = localStorage.getItem(HEARTBEAT_KEY)
    if (held) {
      const at = Number(JSON.parse(held).at)
      if (Number.isFinite(at) && Date.now() - at < HEARTBEAT_STALE_MS) return false
    }
    localStorage.setItem(HEARTBEAT_KEY, JSON.stringify({ at: Date.now() }))
  } catch {
    return true
  }
  const beat = setInterval(() => {
    try {
      localStorage.setItem(HEARTBEAT_KEY, JSON.stringify({ at: Date.now() }))
    } catch {
      /* a tab that cannot write it cannot renew it, and will be locked out in time */
    }
  }, HEARTBEAT_STALE_MS / 3)
  ;(beat as unknown as { unref?: () => void }).unref?.()
  globalThis.addEventListener?.('pagehide', () => {
    clearInterval(beat)
    try {
      localStorage.removeItem(HEARTBEAT_KEY)
    } catch {
      /* it goes stale on its own */
    }
  })
  return true
}

async function claimSimulatorTab(): Promise<boolean> {
  if (navigator.locks) return claimWithWebLocks()
  return claimWithHeartbeat()
}

function showLockedNotice(panel: Panel): void {
  find<HTMLElement>(panel, '.trade-columns')?.setAttribute('hidden', '')
  const note = document.createElement('p')
  note.className = 'trade-locked'
  note.setAttribute('role', 'status')
  note.textContent = say('tabLocked')
  panel.append(note)
}

export function initTradingPanels(scope: ParentNode = document): void {
  for (const element of scope.querySelectorAll<HTMLElement>('[data-trade-panel]')) {
    const panel = element as Panel
    if (panel.dataset.ready === 'true') continue
    panel.dataset.ready = 'true'
    // The table is filled from IndexedDB after the module has run, so anything
    // that remembers a choice has to wait for it: read too early and every
    // preference comes back as its default and is then written over.
    whenStorageReady(async () => {
      try {
        // Before anything is read: a tab that does not hold the lock must not load
        // the account, let alone write one back.
        if (!(await claimSimulatorTab())) {
          showLockedNotice(panel)
          return
        }
        // The remembered choice goes on before anything is drawn, so the first
        // frame is already in the colours and the unit the reader last asked for.
        applyUpColour(panel, chartFor(panel), readUpColour())
        sizeUnit = readSizeUnit()
        restoreOrderConfig(panel)
        // The remembered unit comes with its own step and its own pressed state, or
        // the first keystroke in the box is rounded by another unit's step.
        find<HTMLInputElement>(panel, '[data-size]')?.setAttribute('step', sizeStepFor(sizeUnit))
        for (const button of panel.querySelectorAll<HTMLElement>('[data-size-unit]')) {
          button.setAttribute('aria-pressed', String(button.dataset.sizeUnit === sizeUnit))
        }
        setup(panel)
      } catch (error) {
        // A broken panel must not take the chart down with it.
        console.error(error)
      }
    })
  }
}

initTradingPanels()
document.addEventListener('astro:page-load', () => initTradingPanels())
document.addEventListener('astro:before-swap', () => {
  for (const panel of panels) panel.dispose?.()
  panels.clear()
})
