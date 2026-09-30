import {
  advanceClicks,
  doubleClickWindowMs,
  doubleClicks,
  newSequence,
  takeRun,
  type ClickSequence
} from '../lib/click-sequence.ts'
import { localePath } from '../i18n/config'
import type { Locale } from '../i18n/config'

/**
 * The way into the market lab.
 *
 * The lab is not linked from anywhere, because a page nobody asked for should not
 * be in the catalog. The fingerprint under the account is the one place a reader
 * who wants to see how the candles are made would look, so a double-click on it
 * opens the lab and nothing else does.
 */

function openLab() {
  const locale = (document.documentElement.dataset.locale ?? 'zh-CN') as Locale
  window.location.href = localePath(locale, '/lab/market/')
}

function initMarketLabDoor(scope: ParentNode = document) {
  for (const fingerprint of scope.querySelectorAll<HTMLElement>('[data-market-lab]')) {
    let sequence: ClickSequence = newSequence()
    fingerprint.addEventListener('click', (event) => {
      const run = takeRun(advanceClicks(sequence, event.timeStamp, doubleClickWindowMs), doubleClicks)
      sequence = run.sequence
      if (run.reached) {
        event.preventDefault()
        openLab()
      }
    })
  }
}

document.addEventListener('astro:page-load', () => initMarketLabDoor())
initMarketLabDoor()
