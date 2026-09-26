import { decodeUrl, encodeUrl, type UrlMode, type UrlResult } from '../lib/url'
import { currentTranslator } from '../i18n/client'
import { showToast } from './site'
import { recordToolUsage } from './usage'

type OperationMode = 'encode' | 'decode'

const mountedRoots = new WeakSet<HTMLElement>()

function init() {
  const root = document.querySelector<HTMLElement>('.url-workspace')
  if (!root || mountedRoots.has(root)) return
  mountedRoots.add(root)

  const input = root.querySelector<HTMLTextAreaElement>('#url-input')
  const charCount = root.querySelector<HTMLElement>('#url-char-count')
  const inputLabel = root.querySelector<HTMLElement>('#url-input-label')
  const processLabel = root.querySelector<HTMLElement>('#url-process-label')
  const ruleInput = root.querySelector<HTMLInputElement>('#url-rule')
  const errorBox = root.querySelector<HTMLElement>('#url-error')
  const resultCard = root.querySelector<HTMLElement>('#url-result')
  const resultStatus = root.querySelector<HTMLElement>('#url-result-status')
  const outputLabel = root.querySelector<HTMLElement>('#url-output-label')
  const output = root.querySelector<HTMLTextAreaElement>('#url-output')
  const copyButton = root.querySelector<HTMLButtonElement>('#url-copy')
  const downloadButton = root.querySelector<HTMLButtonElement>('#url-download')
  const statInput = root.querySelector<HTMLElement>('#url-stat-input')
  const statOutput = root.querySelector<HTMLElement>('#url-stat-output')
  const statBytes = root.querySelector<HTMLElement>('#url-stat-bytes')
  const statRule = root.querySelector<HTMLElement>('#url-stat-rule')
  const processButton = root.querySelector<HTMLButtonElement>('#url-process')
  const clearButton = root.querySelector<HTMLButtonElement>('#url-clear')
  const modeButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-mode]'))
  const panel = root.querySelector<HTMLElement>('#url-panel')
  let mode: OperationMode = 'encode'
  let processedOutput = ''

  function getInputLength() {
    return Array.from(input?.value ?? '').length
  }

  function getRule(): UrlMode {
    return ruleInput?.value === 'uri' ? 'uri' : 'component'
  }

  function clearError() {
    if (!errorBox) return
    errorBox.textContent = ''
    errorBox.hidden = true
  }

  function showError(result: Extract<UrlResult, { ok: false }>) {
    if (!errorBox) return
    const t = currentTranslator()
    const position = result.position === undefined ? '' : t('workspace.charPosition', { position: result.position })
    errorBox.textContent = `${position}${t(`toolUi.url-encode.errors.${result.code}`)}`
    errorBox.hidden = false
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KB`
    return `${(bytes / 1024 ** 2).toFixed(2)} MB`
  }

  function resetResult() {
    processedOutput = ''
    if (resultCard) resultCard.hidden = true
    if (output) {
      output.value = ''
      output.dataset.empty = 'true'
    }
    if (copyButton) copyButton.disabled = true
    if (downloadButton) downloadButton.disabled = true
    if (resultStatus) resultStatus.textContent = '等待处理'
    if (statInput) statInput.textContent = '—'
    if (statOutput) statOutput.textContent = '—'
    if (statBytes) statBytes.textContent = '—'
    if (statRule) statRule.textContent = '—'
  }

  function renderResult(result: Extract<UrlResult, { ok: true }>) {
    processedOutput = result.output
    if (resultCard) resultCard.hidden = false
    const t = currentTranslator()
    if (resultStatus) resultStatus.textContent = mode === 'encode' ? t('toolUi.url-encode.runtime.doneEncode') : t('toolUi.url-encode.runtime.doneDecode')
    if (outputLabel) outputLabel.textContent = mode === 'encode' ? t('toolUi.url-encode.runtime.encodedResult') : t('toolUi.url-encode.runtime.decodedResult')
    if (output) {
      output.value = result.output
      output.dataset.empty = 'false'
    }
    if (copyButton) copyButton.disabled = false
    if (downloadButton) downloadButton.disabled = false
    if (statInput) statInput.textContent = String(getInputLength())
    if (statOutput) statOutput.textContent = String(result.outputLength)
    if (statBytes) statBytes.textContent = formatBytes(result.byteLength)
    if (statRule) statRule.textContent = getRule() === 'uri' ? t('toolUi.url-encode.runtime.ruleUri') : t('toolUi.url-encode.runtime.ruleComponent')
  }

  function setMode(nextMode: OperationMode) {
    if (mode === nextMode) return
    mode = nextMode
    modeButtons.forEach((button) => {
      const active = button.dataset.mode === mode
      button.classList.toggle('active', active)
      button.setAttribute('aria-selected', String(active))
    })
    panel?.setAttribute('aria-labelledby', mode === 'encode' ? 'url-encode-tab' : 'url-decode-tab')
    const t = currentTranslator()
    if (inputLabel) inputLabel.textContent = mode === 'encode' ? t('toolUi.url-encode.runtime.inputEncodeLabel') : t('toolUi.url-encode.runtime.inputDecodeLabel')
    if (processLabel) processLabel.textContent = mode === 'encode' ? t('toolUi.url-encode.runtime.startEncode') : t('toolUi.url-encode.runtime.startDecode')
    if (input) input.placeholder = mode === 'encode' ? t('toolUi.url-encode.runtime.placeholderEncode') : t('toolUi.url-encode.runtime.placeholderDecode')
    clearError()
    resetResult()
  }

  function process() {
    clearError()
    const value = input?.value ?? ''
    if (mode === 'decode' && !value.trim()) {
      resetResult()
      if (errorBox) {
        errorBox.textContent = currentTranslator()('toolUi.url-encode.runtime.needInput')
        errorBox.hidden = false
      }
      return
    }
    const result = mode === 'encode' ? encodeUrl(value, getRule()) : decodeUrl(value, getRule())
    if (!result.ok) {
      resetResult()
      showError(result)
      return
    }
    renderResult(result)
    recordToolUsage('url-encode')
  }

  async function copyOutput() {
    if (!processedOutput) return
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(processedOutput)
      showToast(currentTranslator()('toolUi.url-encode.runtime.toastCopied'))
    } catch {
      showToast(currentTranslator()('toolUi.url-encode.runtime.toastManual'))
    }
  }

  function downloadOutput() {
    if (!processedOutput) return
    const url = URL.createObjectURL(new Blob([processedOutput], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = mode === 'encode' ? 'encoded-url.txt' : 'decoded-url.txt'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    showToast(currentTranslator()('toolUi.url-encode.runtime.toastDownload'))
  }

  function clearAll() {
    if (input) input.value = ''
    if (charCount) charCount.textContent = '0'
    clearError()
    resetResult()
    input?.focus()
  }

  modeButtons.forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode as OperationMode)))
  input?.addEventListener('input', () => {
    if (charCount) charCount.textContent = String(getInputLength())
    clearError()
    resetResult()
  })
  processButton?.addEventListener('click', process)
  clearButton?.addEventListener('click', clearAll)
  copyButton?.addEventListener('click', () => void copyOutput())
  downloadButton?.addEventListener('click', downloadOutput)
  root.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      process()
    }
  })

  resetResult()
}

document.addEventListener('astro:page-load', init)
init()
