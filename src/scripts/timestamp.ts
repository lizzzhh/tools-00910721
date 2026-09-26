import { describeDate, parseDateInput, parseTimestamp, type DateDirection, type DateParts, type TimestampUnit } from '../lib/datetime'
import { recordToolUsage } from './usage'
import { clearError, copyText, showError, toggleHidden } from './tool-panel'

const mountedRoots = new WeakSet<HTMLElement>()

function renderDetails(container: HTMLElement, rows: [string, string][]) {
  container.replaceChildren(
    ...rows.map(([label, value]) => {
      const element = document.createElement('button')
      element.className = 'tool-row tool-row-copy'
      element.type = 'button'
      element.title = `点击复制${label}`
      const name = document.createElement('span')
      name.textContent = label
      const content = document.createElement('span')
      content.textContent = value
      element.append(name, content)
      element.addEventListener('click', () => void copyText(value, `${label}已复制`))
      return element
    })
  )
}

function toRows(parts: DateParts, detectedUnit: string | null): [string, string][] {
  const rows: [string, string][] = [
    ['ISO 8601', parts.iso],
    ['UTC', parts.utc],
    ['本地时间', `${parts.local} (${parts.weekday})`],
    ['本地日期', parts.date],
    ['本地时刻', parts.time],
    ['时区', `${parts.timezone} ${parts.offset}`]
  ]

  if (detectedUnit) rows.push(['识别单位', detectedUnit])

  rows.push(['Unix 秒', parts.unixSeconds], ['Unix 毫秒', parts.unixMilliseconds])
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
    if (resultStatus) resultStatus.textContent = '等待处理'
  }

  function showResult(date: Date, unit: string, status: string) {
    const parts = describeDate(date)
    const detected = direction === 'from-timestamp' ? (unit === 'milliseconds' ? '毫秒（13 位）' : '秒（10 位）') : null
    if (rows) renderDetails(rows, toRows(parts, detected))
    toggleHidden(resultCard, false)
    if (resultStatus) resultStatus.textContent = status
  }

  function run() {
    clearError(errorBox)
    const value = input?.value ?? ''
    if (!value.trim()) {
      resetResult()
      showError(errorBox, direction === 'from-timestamp' ? '请输入时间戳' : '请输入日期或时间')
      return
    }

    const result =
      direction === 'from-timestamp'
        ? parseTimestamp(value, (root?.querySelector<HTMLInputElement>('#timestamp-unit')?.value ?? 'auto') as TimestampUnit)
        : parseDateInput(value, root?.querySelector<HTMLInputElement>('#timestamp-assume-utc')?.checked ?? false)

    if (!result.ok) {
      resetResult()
      showError(errorBox, result.message)
      return
    }

    showResult(
      result.date,
      result.unit,
      direction === 'from-timestamp' ? (result.unit === 'milliseconds' ? '已按毫秒解析' : '已按秒解析') : '已解析日期'
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
    if (inputLabel) inputLabel.textContent = direction === 'from-timestamp' ? '时间戳' : '日期时间'
    if (hint) hint.textContent = direction === 'from-timestamp' ? '自动识别秒与毫秒，10 位以下按秒处理。' : '支持 2026-01-31 08:30:00、2026-01-31T08:30:00Z 与纯时间戳。'
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
