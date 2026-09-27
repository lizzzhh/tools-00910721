import {
  accountStorageKey,
  advanceTo,
  cancelOrder,
  createAccount,
  deposit,
  historyStorageKey,
  loadAccount,
  loadHistory,
  liquidityFor,
  makerFeeRate,
  maxLeverage,
  maxNotionalFor,
  slippedPrice,
  placeOrder,
  quoteOrder,
  saveAccount,
  saveHistory,
  seededMarket,
  viewAccount,
  type Account,
  type AccountView,
  type MarginMode,
  type OrderKind,
  type OrderRequest,
  type Side,
  type Trade
} from '../lib/trading.ts'
import { defaultSeed } from '../lib/candles.ts'
import {
  defaultSizeUnit,
  marginAsset,
  sizeFromUnits,
  sizePlacesFor,
  sizeStepFor,
  sizeTicker,
  sizeToUnits,
  sizeUnits,
  tradedAsset
} from '../lib/units.ts'
import type { SizeUnit } from '../lib/units.ts'
import { currentIntlLocale, translateNow } from '../i18n/client'
import type { MessageKey } from '../i18n'
import { actionLabel, closeLabel } from '../lib/wording.ts'
import type { ChartLevels } from './candle-chart.ts'

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
const upColourStorageKey = 'market-up-colour-v1'
const sizeUnitStorageKey = 'market-size-unit-v1'

const readSizeUnit = (): SizeUnit => {
  try {
    const stored = localStorage.getItem(sizeUnitStorageKey)
    return sizeUnits.some((unit) => unit.id === stored) ? (stored as SizeUnit) : defaultSizeUnit
  } catch {
    return defaultSizeUnit
  }
}

const writeSizeUnit = (value: SizeUnit): void => {
  try {
    localStorage.setItem(sizeUnitStorageKey, value)
  } catch {
    // A browser that will not remember the choice can still use it for now.
  }
}

type UpColour = 'success' | 'danger'

const readUpColour = (): UpColour => {
  try {
    return localStorage.getItem(upColourStorageKey) === 'danger' ? 'danger' : 'success'
  } catch {
    return 'success'
  }
}

const writeUpColour = (value: UpColour): void => {
  try {
    localStorage.setItem(upColourStorageKey, value)
  } catch {
    // A browser that will not remember the choice can still use it for now.
  }
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
const units = (value: number) => number({ minimumFractionDigits: 0, maximumFractionDigits: 3 }).format(value)
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
  return {
    side: form.side,
    kind: form.kind,
    size,
    ...(form.kind === 'limit' ? { price: limit } : {}),
    leverage: form.leverage,
    marginMode: form.marginMode
  }
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
  let state = true
  try {
    localStorage.setItem(accountStorageKey, saveAccount(account))
  } catch {
    state = false
  }
  let history = true
  try {
    localStorage.setItem(historyStorageKey, saveHistory(account))
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
    return `<article class="trade-card ${long ? 'is-long' : 'is-short'}" data-tone="${won ? 'up' : 'down'}">
      <header class="trade-card-head">
        <span class="trade-tag ${long ? 'is-long' : 'is-short'}">${escape(say(long ? 'long' : 'short'))}</span>
        <b class="trade-card-pnl" data-tone="${won ? 'up' : 'down'}">${signed(position.pnl)}</b>
      </header>
      <dl class="trade-card-grid">
        <div><dt>${escape(say('size'))}</dt><dd>${units(position.size)}</dd></div>
        <div><dt>${escape(say('notional'))}</dt><dd>${money(position.notional)}</dd></div>
        <div><dt>${escape(say('entry'))}</dt><dd>${money(position.entry)}</dd></div>
        <div><dt>${escape(say('mark'))}</dt><dd>${money(position.mark)}</dd></div>
        <div class="is-warn"><dt>${escape(say('liquidation'))}</dt><dd>${
          position.liquidation === null ? escape(say('noLiquidation')) : money(position.liquidation)
        }</dd></div>
        <div><dt>${escape(say('margin'))}</dt><dd>${money(margin)}</dd></div>
      </dl>
      <footer class="trade-card-foot">
        <span class="trade-card-settings">${position.leverage}x ${escape(position.marginMode === 'cross' ? say('cross') : say('isolated'))}</span>
        <button type="button" class="trade-close" data-close="${position.id}">${escape(say(closeLabel(long)))}</button>
      </footer>
    </article>`
  }
  host.innerHTML = view.positions.map(card).join('')
}

function renderOrders(panel: Panel, view: AccountView): void {
  const host = find(panel, '[data-orders]')
  const count = find(panel, '[data-order-count]')
  if (count) count.textContent = String(view.orders.length)
  if (!host) return
  if (view.orders.length === 0) {
    host.innerHTML = `<p class="trade-empty">${escape(say('noOrders'))}</p>`
    return
  }
  // A resting order is a question waiting for an answer, so the card leads with
  // what it is waiting for and shows what it will cost to find out.
  host.innerHTML = view.orders
    .map((order) => {
      const long = order.side === 'buy'
      const price = order.price ?? 0
      const waiting = long ? price < view.price : price > view.price
      return `<article class="trade-card is-order ${long ? 'is-long' : 'is-short'}">
        <header class="trade-card-head">
          <span class="trade-tag ${long ? 'is-long' : 'is-short'}">${escape(say(long ? 'long' : 'short'))}</span>
          <b class="trade-card-price">${money(price)}</b>
        </header>
        <dl class="trade-card-grid">
          <div><dt>${escape(say('size'))}</dt><dd>${units(order.size)}</dd></div>
          <div><dt>${escape(say('notional'))}</dt><dd>${money(order.size * price)}</dd></div>
          <div><dt>${escape(say('fee'))}</dt><dd>${money(order.size * price * makerFeeRate, 4)}</dd></div>
          <div><dt>${escape(say('placedAt'))}</dt><dd class="trade-card-time">${stamp(order.placedAt)}</dd></div>
        </dl>
        <footer class="trade-card-foot">
          <span class="trade-card-settings">${waiting ? escape(say('waiting')) : escape(say('crossing'))}</span>
          <button type="button" class="trade-close is-cancel" data-cancel="${order.id}">${escape(say('cancel'))}</button>
        </footer>
      </article>`
    })
    .join('')
}

/**
 * One line of history, carrying its own context. Everything shown is read out of
 * the record rather than recomputed, because the record is what the trade was: a
 * later change to the fees or the tiers must not rewrite what it says.
 */
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
  renderFigures(panel, view, account)
  renderPositions(panel, view)
  renderOrders(panel, view)
  renderHistory(panel, view)
  renderQuote(panel, account, form, price)
  paintSizeFacts(panel, account, form, price)
  drawLevels(panel, view, price)
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
      paintLeverage(panel, account, price)
    })
  }

  // The margin settings live in a dialog of their own, because a leverage slider
  // sitting beside the size slider is read as one control with two meanings.
  const dialog = find<HTMLDialogElement>(panel, '[data-margin-dialog]')
  find(panel, '[data-margin-open]')?.addEventListener('click', () => dialog?.showModal())
  find(panel, '[data-margin-done]')?.addEventListener('click', () => dialog?.close())
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
      const size = maxSize(panel, account, price, form) * (share / 100)
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
  find(panel, '[data-deposit-form]')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const input = find<HTMLInputElement>(panel, '[data-deposit-amount]')
    const amount = Number(input?.value ?? 0)
    if (!Number.isFinite(amount) || amount <= 0) return
    commit(deposit(account, amount))
    if (input) input.value = ''
    message(panel)
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
    const close = target?.closest<HTMLElement>('[data-close]')
    if (close?.dataset.close) {
      const position = account.positions.find((held) => held.id === close.dataset.close)
      if (!position) return
      commit(
        placeOrder(
          account,
          {
            // Closing buys back a short and sells a long.
            side: position.side === 'buy' ? 'sell' : 'buy',
            kind: 'market',
            purpose: 'close',
            positionId: position.id,
            size: position.size
          },
          Date.now(),
          market
        )
      )
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
    account = loadAccount(localStorage.getItem(accountStorageKey))
    if (account) {
      try {
        account = loadHistory(localStorage.getItem(historyStorageKey), account)
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

export function initTradingPanels(scope: ParentNode = document): void {
  for (const element of scope.querySelectorAll<HTMLElement>('[data-trade-panel]')) {
    const panel = element as Panel
    if (panel.dataset.ready === 'true') continue
    panel.dataset.ready = 'true'
    try {
      // The remembered choice goes on before anything is drawn, so the first
      // frame is already in the colours and the unit the reader last asked for.
      applyUpColour(panel, chartFor(panel), readUpColour())
      sizeUnit = readSizeUnit()
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
  }
}

initTradingPanels()
document.addEventListener('astro:page-load', () => initTradingPanels())
document.addEventListener('astro:before-swap', () => {
  for (const panel of panels) panel.dispose?.()
  panels.clear()
})
