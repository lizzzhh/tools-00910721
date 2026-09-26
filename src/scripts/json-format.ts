import { formatJson, minifyJson, type JsonFormatOptions, type JsonFormatResult, type JsonIndent, type JsonQuote } from '../lib/json'
import { currentTranslator } from '../i18n/client'
import { showToast } from './site'
import { recordToolUsage } from './usage'

const mountedRoots = new WeakSet<HTMLElement>()

function init() {
  const root = document.querySelector<HTMLElement>('.json-workspace')
  if (!root || mountedRoots.has(root)) return
  mountedRoots.add(root)

  const input = root.querySelector<HTMLTextAreaElement>('#json-input')
  const charCount = root.querySelector<HTMLElement>('#json-char-count')
  const indentInput = root.querySelector<HTMLInputElement>('#json-indent')
  const quoteInput = root.querySelector<HTMLInputElement>('#json-quote')
  const relaxedInput = root.querySelector<HTMLInputElement>('#json-relaxed')
  const commentsInput = root.querySelector<HTMLInputElement>('#json-allow-comments')
  const singleQuotesInput = root.querySelector<HTMLInputElement>('#json-allow-single-quotes')
  const unquotedKeysInput = root.querySelector<HTMLInputElement>('#json-allow-unquoted-keys')
  const inputTrailingCommasInput = root.querySelector<HTMLInputElement>('#json-allow-trailing-commas')
  const missingCommasInput = root.querySelector<HTMLInputElement>('#json-allow-missing-commas')
  const missingColonsInput = root.querySelector<HTMLInputElement>('#json-allow-missing-colons')
  const undefinedInput = root.querySelector<HTMLInputElement>('#json-allow-undefined')
  const sortKeys = root.querySelector<HTMLInputElement>('#json-sort-keys')
  const escapeUnicode = root.querySelector<HTMLInputElement>('#json-escape-unicode')
  const outputTrailingCommas = root.querySelector<HTMLInputElement>('#json-trailing-commas')
  const arrayLineBreaks = root.querySelector<HTMLInputElement>('#json-array-line-breaks')
  const errorBox = root.querySelector<HTMLElement>('#json-error')
  const resultCard = root.querySelector<HTMLElement>('#json-result')
  const resultStatus = root.querySelector<HTMLElement>('#json-result-status')
  const repairSummary = root.querySelector<HTMLElement>('#json-repairs')
  const output = root.querySelector<HTMLTextAreaElement>('#json-output')
  const copyButton = root.querySelector<HTMLButtonElement>('#json-copy')
  const downloadButton = root.querySelector<HTMLButtonElement>('#json-download')
  const statType = root.querySelector<HTMLElement>('#json-stat-type')
  const statDepth = root.querySelector<HTMLElement>('#json-stat-depth')
  const statKeys = root.querySelector<HTMLElement>('#json-stat-keys')
  const statArrays = root.querySelector<HTMLElement>('#json-stat-arrays')
  const statValues = root.querySelector<HTMLElement>('#json-stat-values')
  const statBytes = root.querySelector<HTMLElement>('#json-stat-bytes')
  const formatButton = root.querySelector<HTMLButtonElement>('#json-format')
  const minifyButton = root.querySelector<HTMLButtonElement>('#json-minify')
  const clearButton = root.querySelector<HTMLButtonElement>('#json-clear')
  let formattedOutput = ''

  function getIndent(): JsonIndent {
    if (indentInput?.value === '4') return 4
    if (indentInput?.value === 'tab') return '\t'
    return 2
  }

  function getQuote(): JsonQuote {
    return quoteInput?.value === 'single' ? "'" : '"'
  }

  function getFormatOptions(): JsonFormatOptions {
    return {
      indent: getIndent(),
      sortKeys: sortKeys?.checked ?? false,
      quote: getQuote(),
      escapeUnicode: escapeUnicode?.checked ?? false,
      trailingCommas: outputTrailingCommas?.checked ?? false,
      arrayLineBreaks: arrayLineBreaks?.checked ?? true,
      relaxed: relaxedInput?.checked ?? true,
      allowComments: commentsInput?.checked ?? true,
      allowSingleQuotes: singleQuotesInput?.checked ?? true,
      allowUnquotedKeys: unquotedKeysInput?.checked ?? true,
      allowTrailingCommas: inputTrailingCommasInput?.checked ?? true,
      allowMissingCommas: missingCommasInput?.checked ?? true,
      allowMissingColons: missingColonsInput?.checked ?? true,
      allowUndefined: undefinedInput?.checked ?? true
    }
  }

  function clearError() {
    if (!errorBox) return
    errorBox.textContent = ''
    errorBox.hidden = true
  }

  function showError(result: Extract<JsonFormatResult, { ok: false }>) {
    if (!errorBox) return
    const t = currentTranslator()
    const message = t(`toolUi.json-format.errors.${result.code}`, result.params)
    errorBox.textContent = t('toolUi.json-format.runtime.position', { line: result.line, column: result.column, message })
    errorBox.hidden = false
  }

  function resetResult() {
    formattedOutput = ''
    if (resultCard) resultCard.hidden = true
    if (output) {
      output.value = ''
      output.dataset.empty = 'true'
    }
    if (copyButton) copyButton.disabled = true
    if (downloadButton) downloadButton.disabled = true
    if (resultStatus) resultStatus.textContent = currentTranslator()('toolUi.json-format.runtime.waiting')
    if (repairSummary) {
      repairSummary.textContent = ''
      repairSummary.hidden = true
    }
    if (statType) statType.textContent = '—'
    if (statDepth) statDepth.textContent = '—'
    if (statKeys) statKeys.textContent = '—'
    if (statArrays) statArrays.textContent = '—'
    if (statValues) statValues.textContent = '—'
    if (statBytes) statBytes.textContent = '—'
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KB`
    return `${(bytes / 1024 ** 2).toFixed(2)} MB`
  }

  function renderResult(result: Extract<JsonFormatResult, { ok: true }>) {
    formattedOutput = result.output
    if (resultCard) resultCard.hidden = false
    const t = currentTranslator()
    const notes = result.repairs.map((repair) => t(`toolUi.json-format.repairs.${repair.code}`, repair.params))
    if (result.commentCount) notes.push(t('toolUi.json-format.runtime.commentsRemoved', { count: result.commentCount }))
    if (resultStatus) resultStatus.textContent = notes.length ? t('toolUi.json-format.runtime.autoFixed') : t('toolUi.json-format.runtime.valid')
    if (repairSummary) {
      repairSummary.textContent = notes.length
        ? t('toolUi.json-format.runtime.autoFixedNotes', { notes: notes.join(t('toolUi.json-format.runtime.separator')) })
        : ''
      repairSummary.hidden = notes.length === 0
    }
    if (output) {
      output.value = result.output
      output.dataset.empty = 'false'
    }
    if (copyButton) copyButton.disabled = false
    if (downloadButton) downloadButton.disabled = false
    if (statType) statType.textContent = result.stats.type
    if (statDepth) statDepth.textContent = String(result.stats.depth)
    if (statKeys) statKeys.textContent = String(result.stats.keys)
    if (statArrays) statArrays.textContent = String(result.stats.arrays)
    if (statValues) statValues.textContent = String(result.stats.values)
    if (statBytes) statBytes.textContent = formatBytes(result.stats.bytes)
  }

  function process(compact: boolean) {
    clearError()
    const result = compact
      ? minifyJson(input?.value ?? '', getFormatOptions())
      : formatJson(input?.value ?? '', getFormatOptions())
    if (!result.ok) {
      resetResult()
      showError(result)
      return
    }
    renderResult(result)
    recordToolUsage('json-format')
  }

  async function copyOutput() {
    if (!formattedOutput) return
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(formattedOutput)
      showToast(currentTranslator()('toolUi.json-format.runtime.copied'))
    } catch {
      showToast(currentTranslator()('toolUi.json-format.runtime.copyUnsupported'))
    }
  }

  function downloadOutput() {
    if (!formattedOutput) return
    const url = URL.createObjectURL(new Blob([formattedOutput], { type: 'application/json;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'formatted.json'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    showToast(currentTranslator()('toolUi.json-format.runtime.downloaded'))
  }

  function clearAll() {
    if (input) input.value = ''
    if (charCount) charCount.textContent = '0'
    clearError()
    resetResult()
    input?.focus()
  }

  input?.addEventListener('input', () => {
    if (charCount) charCount.textContent = String(Array.from(input.value).length)
    clearError()
    resetResult()
  })
  formatButton?.addEventListener('click', () => process(false))
  minifyButton?.addEventListener('click', () => process(true))
  clearButton?.addEventListener('click', clearAll)
  copyButton?.addEventListener('click', () => void copyOutput())
  downloadButton?.addEventListener('click', downloadOutput)
  root.addEventListener('change', (event) => {
    if (event.target instanceof HTMLInputElement) {
      clearError()
      resetResult()
    }
  })
  root.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      process(false)
    }
  })

  resetResult()
}

document.addEventListener('astro:page-load', init)
init()
