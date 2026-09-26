import { convertCase, type CaseStyle } from '../lib/text'
import { currentTranslator } from '../i18n/client'
import { recordToolUsage } from './usage'
import { clearError, copyText, downloadText, formatNumber, setStat, setValue, toggleHidden } from './tool-panel'

const sample = 'getUserNameFromHTTPServer v2'

const mountedRoots = new WeakSet<HTMLElement>()

function init() {
  const root = document.querySelector<HTMLElement>('.text-case-workspace')
  if (!root || mountedRoots.has(root)) return
  mountedRoots.add(root)

  const input = root?.querySelector<HTMLTextAreaElement>('#text-case-input')
  const charCount = root?.querySelector<HTMLElement>('#text-case-char-count')
  const runButton = root?.querySelector<HTMLButtonElement>('#text-case-run')
  const sampleButton = root?.querySelector<HTMLButtonElement>('#text-case-sample')
  const clearButton = root?.querySelector<HTMLButtonElement>('#text-case-clear')
  const errorBox = root?.querySelector<HTMLElement>('#text-case-error')
  const resultCard = root?.querySelector<HTMLElement>('#text-case-result')
  const resultStatus = root?.querySelector<HTMLElement>('#text-case-result-status')
  const output = root?.querySelector<HTMLTextAreaElement>('#text-case-output')
  const copyButton = root?.querySelector<HTMLButtonElement>('#text-case-copy')
  const downloadButton = root?.querySelector<HTMLButtonElement>('#text-case-download')
  const shortcuts = Array.from(root?.querySelectorAll<HTMLButtonElement>('[data-style]'))
  let processed = ''

  function resetResult() {
    processed = ''
    toggleHidden(resultCard, true)
    setValue(output, '')
    if (resultStatus) resultStatus.textContent = currentTranslator()('workspace.waiting')
    if (copyButton) copyButton.disabled = true
    if (downloadButton) downloadButton.disabled = true
    setStat(root, 'text-case-stat-words', '—')
    setStat(root, 'text-case-stat-converted', '—')
    setStat(root, 'text-case-stat-input', '—')
    setStat(root, 'text-case-stat-output', '—')
  }

  function run() {
    clearError(errorBox)
    const value = input?.value ?? ''
    const result = convertCase(value, (root?.querySelector<HTMLInputElement>('#text-case-style')?.value ?? 'camel') as CaseStyle)

    processed = result.output
    setValue(output, result.output)
    toggleHidden(resultCard, false)
    if (resultStatus) resultStatus.textContent = currentTranslator()('toolUi.text-case.runtime.done')
    if (copyButton) copyButton.disabled = false
    if (downloadButton) downloadButton.disabled = false
    setStat(root, 'text-case-stat-words', formatNumber(result.words))
    setStat(root, 'text-case-stat-converted', formatNumber(result.converted))
    setStat(root, 'text-case-stat-input', formatNumber(value.length))
    setStat(root, 'text-case-stat-output', formatNumber(result.output.length))
    recordToolUsage('text-case')
  }

  shortcuts.forEach((button) =>
    button.addEventListener('click', () => {
      const select = root?.querySelector<HTMLInputElement>('#text-case-style')
      const trigger = root?.querySelector<HTMLElement>(`#text-case-style-trigger > span`)
      if (select) select.value = button.dataset.style ?? select.value
      if (trigger) trigger.textContent = button.textContent?.trim() ?? ''
      if (!input?.value) input && (input.value = sample)
      if (button.dataset.style) run()
    })
  )
  input?.addEventListener('input', () => {
    if (charCount) charCount.textContent = String(Array.from(input.value).length)
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
  sampleButton?.addEventListener('click', () => {
    if (input) input.value = sample
    if (charCount) charCount.textContent = String(Array.from(input?.value ?? '').length)
    run()
  })
  clearButton?.addEventListener('click', () => {
    if (input) input.value = ''
    if (charCount) charCount.textContent = '0'
    clearError(errorBox)
    resetResult()
    input?.focus()
  })
  copyButton?.addEventListener('click', () => void copyText(processed))
  downloadButton?.addEventListener('click', () => downloadText(processed, 'text-case.txt'))
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
