import { baseNameId, basePrefix, commonBases, convertNumber, detectBase, isNumberBase, numberBases, type NumberBase, type NumberResult } from '../lib/number-base'
import { currentTranslator } from '../i18n/client'
import { recordToolUsage } from './usage'
import { clearError, copyText, downloadText, formatNumber, setDisabled, setStat, setText, showError, toggleHidden } from './tool-panel'

const sample = '0x4d2'

function baseName(base: number) {
  const t = currentTranslator()
  const id = baseNameId(base)
  return id ? t(`toolUi.number-base.bases.${id}`) : t('toolUi.number-base.bases.suffix', { base })
}

function baseErrorText(result: Extract<NumberResult, { ok: false }>) {
  const t = currentTranslator()
  switch (result.code) {
    case 'emptyInput':
      return t('toolUi.number-base.errors.emptyInput')
    case 'prefixOnly':
      return t('toolUi.number-base.errors.prefixOnly', { base: result.base ?? 10 })
    case 'decimalNotSupported':
      return t('toolUi.number-base.errors.decimalNotSupported')
    case 'invalidDigit':
      return t('toolUi.number-base.errors.invalidDigit', { char: result.char ?? '', base: result.base ?? 10 })
    case 'unsupportedBase':
      return t('toolUi.number-base.errors.unsupportedBase', { base: result.base ?? 0 })
  }
}

const mountedRoots = new WeakSet<HTMLElement>()

function init() {
  const root = document.querySelector<HTMLElement>('.number-base-workspace')
  if (!root || mountedRoots.has(root)) return
  mountedRoots.add(root)

  const input = root.querySelector<HTMLInputElement>('#number-base-input')
  const fromSelect = root.querySelector<HTMLInputElement>('#number-base-from')
  const sampleButton = root.querySelector<HTMLButtonElement>('#number-base-sample')
  const clearButton = root.querySelector<HTMLButtonElement>('#number-base-clear')
  const errorBox = root.querySelector<HTMLElement>('#number-base-error')
  const resultStatus = root.querySelector<HTMLElement>('#number-base-result-status')
  const rows = root.querySelector<HTMLElement>('#number-base-rows')
  const emptyState = root.querySelector<HTMLElement>('#number-base-empty')
  const copyButton = root.querySelector<HTMLButtonElement>('#number-base-copy')
  const downloadButton = root.querySelector<HTMLButtonElement>('#number-base-download')
  const filterInput = root.querySelector<HTMLInputElement>('#number-base-filter')

  let processed = ''
  let digits: Record<number, string> | null = null
  let convertTimer: number | undefined
  let usageRecorded = false

  function resolveBase(): NumberBase {
    const selected = fromSelect?.value ?? 'auto'
    if (selected === 'auto') return detectBase(input?.value ?? '')
    return isNumberBase(selected) ? Number(selected) : 10
  }

  function shownBases() {
    const needle = (filterInput?.value ?? '').trim().toLowerCase()
    return numberBases.filter((base) => {
      if (!needle) return commonBases.includes(base)
      return String(base).includes(needle) || baseName(base).toLowerCase().includes(needle)
    })
  }

  function renderRows() {
    const values = digits
    if (!rows || !values) return
    const visible = shownBases()
    const needle = (filterInput?.value ?? '').trim()
    toggleHidden(emptyState, visible.length > 0)
    if (visible.length === 0 && emptyState) {
      emptyState.textContent = currentTranslator()('toolUi.number-base.copy.filterNoMatch', { needle })
    }
    rows.replaceChildren(
      ...visible.map((base) => {
        const text = `${basePrefix(base)}${values[base]}`
        const element = document.createElement('div')
        element.className = 'tool-row tool-row-copy'
        const label = document.createElement('span')
        label.textContent = `${baseName(base)} ${base}`
        const value = document.createElement('span')
        value.textContent = text
        element.append(label, value)
        element.setAttribute('role', 'button')
        element.setAttribute('tabindex', '0')
        const copied = () => currentTranslator()('toolUi.number-base.copy.rowCopied', { base: baseName(base) })
        element.addEventListener('click', () => void copyText(text, copied()))
        element.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            void copyText(text, copied())
          }
        })
        return element
      })
    )
  }

  function resetResult() {
    processed = ''
    digits = null
    rows?.replaceChildren()
    toggleHidden(emptyState, false)
    if (emptyState) emptyState.textContent = currentTranslator()('toolUi.number-base.emptyHint')
    setText(resultStatus, currentTranslator()('workspace.waitingInput'))
    setDisabled(copyButton, true)
    setDisabled(downloadButton, true)
    setStat(root, 'number-base-stat-decimal', '—')
    setStat(root, 'number-base-stat-input', '—')
    setStat(root, 'number-base-stat-bits', '—')
    setStat(root, 'number-base-stat-sign', '—')
  }

  function convert() {
    const raw = input?.value ?? ''
    if (!raw.trim()) {
      resetResult()
      clearError(errorBox)
      return
    }

    const from = resolveBase()
    const result = convertNumber(raw, from)
    if (!result.ok) {
      processed = ''
      digits = null
      rows?.replaceChildren()
      toggleHidden(emptyState, false)
      setDisabled(copyButton, true)
      setDisabled(downloadButton, true)
      showError(errorBox, baseErrorText(result), result.position)
      return
    }

    clearError(errorBox)
    processed = numberBases.map((base) => `${baseName(base)}(${base})\t${basePrefix(base)}${result.digits[base]}`).join('\n')
    digits = result.digits
    renderRows()
    setText(
      resultStatus,
      fromSelect?.value === 'auto'
        ? currentTranslator()('toolUi.number-base.status.detected', { base: baseName(from) })
        : currentTranslator()('toolUi.number-base.status.done')
    )
    setDisabled(copyButton, false)
    setDisabled(downloadButton, false)
    setStat(root, 'number-base-stat-decimal', result.digits[10])
    setStat(root, 'number-base-stat-input', formatNumber(result.inputLength))
    setStat(root, 'number-base-stat-bits', currentTranslator()('toolUi.number-base.statBitsValue', { bits: formatNumber(result.digits[2].length) }))
    setStat(
      root,
      'number-base-stat-sign',
      currentTranslator()(result.negative ? 'toolUi.number-base.signNegative' : 'toolUi.number-base.signNonNegative')
    )

    if (!usageRecorded) {
      usageRecorded = true
      recordToolUsage('number-base')
    }
  }

  function scheduleConvert() {
    window.clearTimeout(convertTimer)
    convertTimer = window.setTimeout(convert, 120)
  }

  input?.addEventListener('input', scheduleConvert)
  fromSelect?.addEventListener('change', () => {
    clearError(errorBox)
    convert()
  })
  filterInput?.addEventListener('input', renderRows)
  sampleButton?.addEventListener('click', () => {
    if (input) input.value = sample
    convert()
  })
  clearButton?.addEventListener('click', () => {
    window.clearTimeout(convertTimer)
    if (input) input.value = ''
    if (filterInput) filterInput.value = ''
    clearError(errorBox)
    usageRecorded = false
    resetResult()
    input?.focus()
  })
  copyButton?.addEventListener('click', () => void copyText(processed))
  downloadButton?.addEventListener('click', () => downloadText(processed, 'number-base.txt'))

  resetResult()
}

document.addEventListener('astro:page-load', init)
init()
