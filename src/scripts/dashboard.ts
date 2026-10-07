import { localizeTools, tools } from '../data/tools'
import { storage, whenStorageReady } from '../lib/storage'
import { storageKeys } from '../lib/storage-schema'
import { pickFavoriteTool, rankByUsage } from '../lib/usage-ranking'
import { getUsageSnapshot, type UsageSnapshot } from './usage'
import { renderTrend } from './trend-chart'
import { renderFortuneChart } from './fortune-chart'
import { readFortuneSeed } from '../lib/fortune-seed'
import { fortuneToday, isFortuneUnlocked, isTodayUnlocked, unlockFortune } from '../lib/fortune-unlock'
import {
  fortuneAt,
  fortuneDailyChange,
  fortuneDecimals,
  fortuneMax,
  fortuneRefreshMs,
  fortuneTone,
  type FortuneTone
} from '../lib/fortune'
import { currentIntlLocale, currentTranslator } from '../i18n/client'
import type { MessageKey } from '../i18n'

/**
 * The dashboard's own two halves: a fortune that is already running, and the
 * count of what the reader has actually used.
 *
 * The fortune is not drawn and nothing about it is decided at the moment it is
 * read. It is derived from a seed this reader keeps and the clock, so it is the
 * same number for this reader on every visit, a different number from everyone
 * else's, and a reload does not move it.
 *
 * What does change is who is allowed to read it. The card ships sealed and
 * opens on one click a day, which is the only thing on this page that asks for
 * anything: a number that is simply on screen is worth exactly what looking at
 * it costs, and this way it costs a click and stays shut until midnight. The
 * number and the bars underneath the seal are the real ones, blurred rather
 * than withheld, so opening the card never swaps one fortune for another.
 */

/** The list is assembled as markup, so everything read from the store goes in escaped. */
const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** How long a change of direction stays coloured, which is the whole of the flash. */
const flashMs = 620

const mountedRoots = new WeakSet<HTMLElement>()

/** The live card's own teardown, so a swap can stop the one that is running. */
let stopTicking: (() => void) | undefined

/** The number as the card prints it, which is what the meter and the tone read. */
function formatScore(value: number): string {
  return value.toFixed(fortuneDecimals)
}

/** A change of direction always carries its sign, so `+0.00` is not read as a blank. */
function formatDelta(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value).toFixed(fortuneDecimals)}`
}

function toneKeys(tone: FortuneTone): { labelKey: MessageKey; messageKey: MessageKey } {
  return { labelKey: `fortunes.${tone}.label` as MessageKey, messageKey: `fortunes.${tone}.message` as MessageKey }
}

function initDashboard() {
  const root = document.querySelector<HTMLElement>('.dashboard-workspace')
  if (!root || mountedRoots.has(root)) return
  mountedRoots.add(root)

  const score = document.querySelector<HTMLElement>('#fortune-score')
  const meter = document.querySelector<HTMLElement>('#fortune-meter')
  const label = document.querySelector<HTMLElement>('#fortune-label')
  const message = document.querySelector<HTMLElement>('#fortune-message')
  const totalUsage = document.querySelector<HTMLElement>('#total-usage')
  const todayUsage = document.querySelector<HTMLElement>('#today-usage')
  const favoriteTool = document.querySelector<HTMLElement>('#favorite-tool')
  const favoriteCount = document.querySelector<HTMLElement>('#favorite-count')
  const activityCount = document.querySelector<HTMLElement>('#activity-count')
  const activityEmpty = document.querySelector<HTMLElement>('#activity-empty')
  const activityList = document.querySelector<HTMLOListElement>('#activity-list')
  const usageBars = document.querySelector<HTMLElement>('#usage-bars')
  const usageEmpty = document.querySelector<HTMLElement>('#usage-empty')
  const fortuneChart = document.querySelector<HTMLElement>('#fortune-candles')
  const fortuneDelta = document.querySelector<HTMLElement>('#fortune-delta')
  const fortuneBody = document.querySelector<HTMLElement>('[data-fortune-body]')
  const fortuneReveal = document.querySelector<HTMLElement>('[data-fortune-reveal]')
  const fortuneGate = document.querySelector<HTMLElement>('[data-fortune-gate]')
  const fortuneUnlock = document.querySelector<HTMLElement>('[data-fortune-unlock]')
  const fortuneLive = document.querySelector<HTMLElement>('[data-fortune-live]')
  const fortuneSealed = document.querySelector<HTMLElement>('[data-fortune-sealed]')
  const fortuneScoreRow = document.querySelector<HTMLElement>('.fortune-score-row')
  const topLimit = 5

  let previous = Number.NaN
  let tone: FortuneTone | undefined
  let flashTimer: number | undefined
  /**
   * Whether the card is sealed, and the reader's day the answer was decided
   * for.
   *
   * The markup ships sealed, and `undefined` means this script has not written
   * the state down at all yet. That is what makes the first call apply even when
   * it agrees with the value it started from: the card is sealed on arrival, and
   * a reader who has already paid for today is the case where nothing about the
   * markup was right.
   */
  let sealed: boolean | undefined
  let sealedDay = ''
  /**
   * This reader's seed, and the moment the card starts reading. The number comes
   * out of a seed and a clock, so there is nothing to show until the seed is in
   * hand: the table is still opening, and printing a number first and replacing
   * it a moment later would be showing a fortune that is not the reader's.
   */
  let seed: string | undefined

  /**
   * Seals or opens the card.
   *
   * One function owns every piece of the seal's visible state, because the seal
   * is one fact wearing five hats: the blur, the tab order, the gate, the badge
   * and whether the chart is allowed to hand out a number on hover. Leaving any
   * one of them out is how a sealed card ends up still reporting its peak in a
   * tooltip, so they are written together or not at all.
   *
   * The gate is centred on the whole card rather than on either half, because
   * the card is the thing being sealed: the number above and the bars below are
   * one fortune, and the one click belongs to both of them. It is also the only
   * part of the card left in the tab order.
   */
  function setSealed(next: boolean) {
    if (sealed === next) return
    sealed = next
    if (fortuneBody) fortuneBody.dataset.sealed = String(next)
    // `inert` rather than a class: it takes the sealed card out of the tab order
    // and out of what assistive technology is offered, which a blur cannot do.
    fortuneReveal?.toggleAttribute('inert', next)
    fortuneChart?.toggleAttribute('inert', next)
    if (fortuneGate) fortuneGate.hidden = !next
    if (fortuneLive) fortuneLive.hidden = next
    if (fortuneSealed) fortuneSealed.hidden = !next
  }

  /**
   * One click of the day. The write goes through the table, so the reader's
   * other tabs hear it and seal themselves rather than staying open on a day
   * this one has just spent.
   */
  function openToday() {
    if (!sealed) return
    unlockFortune()
    setSealed(false)
    // The click that opened the card removed the button it was on, so focus goes
    // to the number it opened rather than falling back onto the body, where a
    // keyboard reader would have to start looking for the card all over again.
    fortuneScoreRow?.focus()
    tickFortune(Date.now())
  }

  /**
   * Colours a change of direction once and then lets the number fall back to
   * its own colour.
   *
   * The class is written back on every tick, so an animation that is already
   * running has to be restarted: removing the class and reading a box is what
   * makes the browser treat the next write as a new animation rather than as
   * no change at all.
   */
  function flash(direction: 1 | -1) {
    const up = direction > 0
    const classes = ['fortune-flash-up', 'fortune-flash-down', 'fortune-meter-flash-up', 'fortune-meter-flash-down']
    const marks: [HTMLElement | null, string][] = [
      [score, up ? 'fortune-flash-up' : 'fortune-flash-down'],
      [meter, up ? 'fortune-meter-flash-up' : 'fortune-meter-flash-down']
    ]
    for (const [element, className] of marks) {
      if (!element) continue
      element.classList.remove(...classes)
      void element.offsetWidth
      element.classList.add(className)
    }
    if (flashTimer !== undefined) window.clearTimeout(flashTimer)
    flashTimer = window.setTimeout(() => {
      for (const element of marks) element[0]?.classList.remove(...classes)
    }, flashMs)
  }

  /**
   * One tick of the card: the score, how far it sits from yesterday, the meter,
   * the wording the score earns and the bar it is standing in.
   *
   * The wording only changes when the score crosses into a different band, so a
   * card ticking every fifty seconds does not rewrite the same sentence over and
   * over. The chart is redrawn on the same tick, which is what keeps the forming
   * candle and the number on it inside each other.
   *
   * The tick does the same work sealed as it does open. The sealed card is the
   * real number behind a blur rather than a placeholder, so that opening it is a
   * change of legibility and not a swap of one fortune for another — and it has
   * to be the same number, because the reader is about to be shown that this is
   * the fortune that was waiting for them.
   */
  function tickFortune(now: number) {
    if (seed === undefined) return
    // The seal is a day and not a duration, so a card left open across midnight
    // seals itself on the next tick instead of keeping yesterday's number up
    // until the reader reloads.
    const today = fortuneToday(new Date(now))
    if (today !== sealedDay) {
      sealedDay = today
      setSealed(!isTodayUnlocked(storage(), new Date(now)))
    }
    const value = fortuneAt(now, { seed })
    if (score) score.textContent = formatScore(value)
    if (meter) meter.style.width = `${Math.min(Math.max(value, 0), fortuneMax)}%`
    if (fortuneDelta) {
      const change = fortuneDailyChange(now, { seed })
      fortuneDelta.textContent = currentTranslator()('home.fortune.delta', { value: formatDelta(change) })
      fortuneDelta.dataset.tone = change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
      fortuneDelta.hidden = false
    }

    const next = fortuneTone(value)
    if (next !== tone) {
      tone = next
      const t = currentTranslator()
      const keys = toneKeys(next)
      if (label) label.textContent = t(keys.labelKey)
      if (message) message.textContent = t(keys.messageKey)
    }

    // The first tick of a seed has no direction to report: the number was not
    // there a moment ago, so it has not gone up or down.
    if (Number.isFinite(previous) && value !== previous) flash(value > previous ? 1 : -1)
    previous = value
    if (fortuneChart) renderFortuneChart(fortuneChart, now, seed, sealed === true)
  }

  function renderUsageTrend(usage: UsageSnapshot) {
    const figure = document.querySelector<HTMLElement>('#usage-trend')
    if (figure) renderTrend(figure, usage.daily)
  }

  function renderUsage(usage: UsageSnapshot) {
    const t = currentTranslator()
    const localized = localizeTools(tools, t)
    const top = rankByUsage(tools, usage.byTool, topLimit)
    const maxCount = Math.max(...top.map((item) => item.count), 1)
    const favorite = pickFavoriteTool(tools, usage.byTool) ?? tools[0]
    const favoriteName = localized.find((item) => item.id === favorite.id)?.name ?? favorite.id

    if (totalUsage) totalUsage.textContent = String(usage.total)
    if (todayUsage) todayUsage.textContent = String(usage.today)
    if (favoriteTool) favoriteTool.textContent = usage.total ? favoriteName : t('home.usage.none')
    if (favoriteCount) favoriteCount.textContent = t('home.usage.times', { count: usage.byTool[favorite.id] ?? 0 })

    const topIds = new Set(top.map((item) => item.tool.id))
    document.querySelectorAll<HTMLElement>('.usage-bar-row').forEach((row) => {
      const toolId = row.dataset.toolId ?? ''
      const entry = top.find((item) => item.tool.id === toolId)
      row.hidden = !topIds.has(toolId)
      if (!entry) return
      const rowCount = row.querySelector<HTMLElement>('[data-tool-count]')
      const bar = row.querySelector<HTMLElement>('[data-tool-bar]')
      if (rowCount) rowCount.textContent = String(entry.count)
      if (bar) bar.style.width = `${(entry.count / maxCount) * 100}%`
    })

    if (usageBars) {
      for (const item of top) {
        const row = usageBars.querySelector<HTMLElement>(`.usage-bar-row[data-tool-id="${item.tool.id}"]`)
        if (row) usageBars.append(row)
      }
      usageBars.hidden = top.every((item) => item.count === 0)
    }
    if (usageEmpty) usageEmpty.hidden = top.some((item) => item.count > 0)

    if (activityCount) activityCount.textContent = t('home.activity.count', { count: usage.recent.length })
    if (activityEmpty) activityEmpty.hidden = usage.recent.length > 0
    if (activityList) {
      activityList.hidden = usage.recent.length === 0
      activityList.innerHTML = usage.recent.map((item) => {
        const tool = localized.find((candidate) => candidate.id === item.id)
        const time = new Intl.DateTimeFormat(currentIntlLocale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(item.at))
        return `<li><span class="activity-icon"><svg><use href="#icon-hash"></use></svg></span><span><strong>${escapeHtml(tool?.name ?? item.id)}</strong><small>${escapeHtml(t('home.activity.usedAt', { time }))}</small></span></li>`
      }).join('')
    }
  }

  let timer: number | undefined
  let unsubscribe: (() => void) | undefined

  // A tab that was in the background has missed updates it is not going to see,
  // and a card that jumps straight to a stale number would be lying. The clock
  // is read again the moment the tab comes back.
  const resync = () => {
    if (document.visibilityState === 'visible') tickFortune(Date.now())
  }
  // Another tab minted a seed first, or opened today first, and the table
  // announced it. Adopting what the reader's other tabs settled on is what keeps
  // them on one fortune and one seal instead of quietly disagreeing for as long
  // as both are open. A cleared seed is not a change of seed: the card goes on
  // showing the fortune it has, and a later visit mints whatever comes next. A
  // cleared unlock is the opposite — a day nobody opened is a sealed card.
  const adopt = (key: string, value: string | undefined) => {
    if (key === storageKeys.fortuneUnlock) {
      setSealed(!isFortuneUnlocked(value, new Date()))
      return
    }
    if (key !== storageKeys.fortuneSeed || !value || value === seed) return
    seed = value
    // A different seed is a different fortune, so the number is read from the top
    // rather than corrected in place: the flash compares against nothing, and the
    // wording is re-read because the score may now earn a different band.
    previous = Number.NaN
    tone = undefined
    tickFortune(Date.now())
  }
  // A client side navigation takes this card off the page without ever firing
  // `pagehide`, and an interval left behind would go on asking the model for a
  // moment nobody is looking at, redrawing a chart on a detached node.
  const stop = () => {
    if (timer !== undefined) window.clearInterval(timer)
    timer = undefined
    unsubscribe?.()
    unsubscribe = undefined
    fortuneUnlock?.removeEventListener('click', openToday)
    document.removeEventListener('visibilitychange', resync)
    if (stopTicking === stop) stopTicking = undefined
  }
  document.addEventListener('astro:before-swap', stop)
  window.addEventListener('pagehide', stop)
  stopTicking = stop
  fortuneUnlock?.addEventListener('click', openToday)

  // The fortune needs a seed and the usage figures need the table, and the table
  // is still opening at this point, so the first paint waits for it rather than
  // showing an empty dashboard, or a fortune that belongs to somebody else.
  whenStorageReady(() => {
    seed = readFortuneSeed()
    unsubscribe = storage().subscribe(adopt)
    const usage = getUsageSnapshot()
    renderUsage(usage)
    renderUsageTrend(usage)
    tickFortune(Date.now())
    timer = window.setInterval(() => tickFortune(Date.now()), fortuneRefreshMs)
  })
}

document.addEventListener('astro:page-load', initDashboard)
document.addEventListener('astro:before-swap', () => stopTicking?.())
initDashboard()