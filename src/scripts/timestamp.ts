import { describeDate, parseDateInput, parseTimestamp, type DateDirection, type DateParts, type TimestampUnit } from '../lib/datetime'
import { recordToolUsage } from './usage'
import { currentTranslator } from '../i18n/client'
import { clearError, copyText, showError, toggleHidden } from './tool-panel'

const mountedRoots = new WeakSet<HTMLElement>()

const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

/** Weekday names follow the page locale rather than the browser default. */
function formatWeekday(index: number) {
  return currentTranslator()(`common.weekdays.${WEEKDAY_KEYS[index]}`)
}

function renderDetails(container: HTMLElement, rows: [string, string][]) {
  const t = currentTranslator()
  container.replaceChildren(
    ...rows.map(([label, value]) => {
      const element = document.createElement('button')
      element.className = 'tool-row tool-row-copy'
      element.type = 'button'
      element.title = t('toolUi.timestamp-converter.runtime.copyTitle', { label })
      const name = document.createElement('span')
      name.textContent = label
      const content = document.createElement('span')
      content.textContent = value
      element.append(name, content)
      element.addEventListener('click', () => void copyText(value, t('toolUi.timestamp-converter.runtime.copied', { label })))
      return element
    })
  )
}

function toRows(parts: DateParts, detectedUnit: string | null): [string, string][] {
  const t = currentTranslator()
  const rows: [string, string][] = [
    ['ISO 8601', parts.iso],
    ['UTC', parts.utc],
    [t('toolUi.timestamp-converter.runtime.rowLocalTime'), `${parts.local} (${formatWeekday(parts.weekdayIndex)})`],
    [t('toolUi.timestamp-converter.runtime.rowLocalDate'), parts.date],
    [t('toolUi.timestamp-converter.runtime.rowLocalClock'), parts.time],
    [t('toolUi.timestamp-converter.runtime.rowTimezone'), `${parts.timezone} ${parts.offset}`]
  ]

  if (detectedUnit) rows.push([t('toolUi.timestamp-converter.runtime.rowDetectedUnit'), detectedUnit])

  rows.push(
    [t('toolUi.timestamp-converter.runtime.rowUnixSeconds'), parts.unixSeconds],
    [t('toolUi.timestamp-converter.runtime.rowUnixMilliseconds'), parts.unixMilliseconds]
  )
  return rows
}

function init() {
  const root = document.querySelector<HTMLElement>('.timestamp-workspace')
  if (!root || mountedRoots.has(root)) return
  mountedRoots.add(root)

  const input = root?.querySelector<HTMLTextAreaElement>('#timestamp-input')
  const inputLabel = root?.querySelector<HTMLElement>('#timestamp-input-label')
  const runButton = root?.querySelector<HTMLButtonElement>('#timestamp-run')
  const nowButton = root?.querySelector<HTMLButtonElement>('#timestamp-now')
  const clearButton = root?.querySelector<HTMLButtonElement>('#timestamp-clear')
  const errorBox = root?.querySelector<HTMLElement>('#timestamp-error')
  const resultCard = root?.querySelector<HTMLElement>('#timestamp-result')
  const resultStatus = root?.querySelector<HTMLElement>('#timestamp-result-status')
  const rows = root?.querySelector<HTMLElement>('#timestamp-rows')
  const unitRow = root?.querySelector<HTMLElement>('#timestamp-unit-row')
  const utcRow = root?.querySelector<HTMLElement>('#timestamp-utc-row')
  const hint = root?.querySelector<HTMLElement>('#timestamp-hint')
  const panel = root?.querySelector<HTMLElement>('#timestamp-panel')
  const modeButtons = Array.from(root?.querySelectorAll<HTMLButtonElement>('[data-mode]'))
  let direction: DateDirection = 'from-timestamp'

  function resetResult() {
    toggleHidden(resultCard, true)
    rows?.replaceChildren()
    if (resultStatus) resultStatus.textContent = currentTranslator()('workspace.waiting')
  }

  function showResult(date: Date, unit: string, status: string) {
    const parts = describeDate(date)
    const t = currentTranslator()
    const detected = direction === 'from-timestamp' ? t(unit === 'milliseconds' ? 'toolUi.timestamp-converter.unitMilliseconds' : 'toolUi.timestamp-converter.unitSeconds') : null
    if (rows) renderDetails(rows, toRows(parts, detected))
    toggleHidden(resultCard, false)
    if (resultStatus) resultStatus.textContent = status
  }

  function run() {
    clearError(errorBox)
    const value = input?.value ?? ''
    if (!value.trim()) {
      resetResult()
      showError(errorBox, currentTranslator()(direction === 'from-timestamp' ? 'toolUi.timestamp-converter.runtime.needTimestamp' : 'toolUi.timestamp-converter.runtime.needDateTime'))
      return
    }

    const result =
      direction === 'from-timestamp'
        ? parseTimestamp(value, (root?.querySelector<HTMLInputElement>('#timestamp-unit')?.value ?? 'auto') as TimestampUnit)
        : parseDateInput(value, root?.querySelector<HTMLInputElement>('#timestamp-assume-utc')?.checked ?? false)

    if (!result.ok) {
      resetResult()
      showError(errorBox, currentTranslator()(`toolUi.timestamp-converter.errors.${result.code}`))
      return
    }

    showResult(
      result.date,
      result.unit,
      currentTranslator()(
        direction === 'from-timestamp'
          ? result.unit === 'milliseconds'
            ? 'toolUi.timestamp-converter.runtime.parsedMilliseconds'
            : 'toolUi.timestamp-converter.runtime.parsedSeconds'
          : 'toolUi.timestamp-converter.runtime.parsedDate'
      )
    )
    recordToolUsage('timestamp-converter')
  }

  function setDirection(next: DateDirection) {
    if (direction === next) return
    direction = next
    modeButtons.forEach((button) => {
      const active = button.dataset.mode === direction
      button.classList.toggle('active', active)
      button.setAttribute('aria-selected', String(active))
    })
    panel?.setAttribute('aria-labelledby', direction === 'from-timestamp' ? 'timestamp-from-tab' : 'timestamp-date-tab')
    toggleHidden(unitRow, direction !== 'from-timestamp')
    toggleHidden(utcRow, direction !== 'from-date')
    const t = currentTranslator()
    if (inputLabel) inputLabel.textContent = direction === 'from-timestamp' ? t('toolUi.timestamp-converter.runtime.labelTimestamp') : t('toolUi.timestamp-converter.runtime.labelDateTime')
    if (hint) hint.textContent = direction === 'from-timestamp' ? t('toolUi.timestamp-converter.runtime.hintTimestamp') : t('toolUi.timestamp-converter.runtime.hintDateTime')
    if (input) input.placeholder = direction === 'from-timestamp' ? '1767225600' : '2026-01-31 08:30:00'
    clearError(errorBox)
    resetResult()
  }

  modeButtons.forEach((button) => button.addEventListener('click', () => setDirection(button.dataset.mode as DateDirection)))
  input?.addEventListener('input', () => {
    clearError(errorBox)
    resetResult()
  })
  root?.querySelectorAll<HTMLElement>('.tool-options input, .tool-options button').forEach((control) => {
    control.addEventListener('change', () => {
      clearError(errorBox)
      resetResult()
    })
  })
  runButton?.addEventListener('click', run)
  nowButton?.addEventListener('click', () => {
    const now = Date.now()
    if (input) {
      if (direction !== 'from-timestamp') {
        input.value = new Date(now).toISOString()
      } else {
        const unit = (root?.querySelector<HTMLInputElement>('#timestamp-unit')?.value ?? 'auto') as TimestampUnit
        input.value = String(unit === 'milliseconds' ? now : Math.floor(now / 1000))
      }
    }
    run()
  })
  clearButton?.addEventListener('click', () => {
    if (input) input.value = ''
    clearError(errorBox)
    resetResult()
    input?.focus()
  })
  root?.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      run()
    }
  })

  resetResult()
}

document.addEventListener('astro:page-load', init)
init()
