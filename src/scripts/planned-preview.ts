import { advancePreviewClicks, newSequence, takePreviewRun, type ClickSequence } from '../lib/planned-preview'
import { localePath } from '../i18n/config'
import type { Locale } from '../i18n/config'

/**
 * The "开发中" badge opens the tool behind it when it is clicked three times in
 * a row. The badge is not a link, so this is the only way in, and a preview that
 * is not finished should not be one click away by accident.
 */
function initPlannedPreview() {
  for (const badge of document.querySelectorAll<HTMLElement>('[data-planned-preview]')) {
    const toolId = badge.dataset.plannedPreview
    if (!toolId) continue
    let sequence: ClickSequence = newSequence()

    const open = () => {
      sequence = newSequence()
      const locale = (document.documentElement.dataset.locale ?? 'zh-CN') as Locale
      window.location.href = localePath(locale, `/tools/${toolId}/`)
    }

    const tap = (event: Event) => {
      event.preventDefault()
      const run = takePreviewRun(advancePreviewClicks(sequence, event.timeStamp))
      sequence = run.sequence
      if (run.reached) {
        open()
        return
      }
      // One quiet acknowledgement per click, so a reader who is trying does not
      // have to guess whether the badge noticed.
      badge.classList.remove('is-tapped')
      void badge.offsetWidth
      badge.classList.add('is-tapped')
    }

    badge.addEventListener('click', tap)
    badge.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      tap(event)
    })
  }
}

document.addEventListener('astro:page-load', initPlannedPreview)
initPlannedPreview()
