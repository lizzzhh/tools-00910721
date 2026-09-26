import { decodeBase, encodeBase, type BaseEncoding, type BaseResult } from '../lib/base64'
import { currentTranslator } from '../i18n/client'
import { showToast } from './site'
import { recordToolUsage } from './usage'

type Base64Mode = 'encode' | 'decode'

const mountedRoots = new WeakSet<HTMLElement>()

function init() {
  const root = document.querySelector<HTMLElement>('.base64-workspace')
  if (!root || mountedRoots.has(root)) return
  mountedRoots.add(root)

  const input = root.querySelector<HTMLTextAreaElement>('#base64-input')
  const charCount = root.querySelector<HTMLElement>('#base64-char-count')
  const inputLabel = root.querySelector<HTMLElement>('#base64-input-label')
  const processLabel = root.querySelector<HTMLElement>('#base64-process-label')
  const encodingInput = root.querySelector<HTMLInputElement>('#base-encoding')
  const errorBox = root.querySelector<HTMLElement>('#base64-error')
  const resultCard = root.querySelector<HTMLElement>('#base64-result')
  const resultStatus = root.querySelector<HTMLElement>('#base64-result-status')
  const outputLabel = root.querySelector<HTMLElement>('#base64-output-label')
  const output = root.querySelector<HTMLTextAreaElement>('#base64-output')
  const copyButton = root.querySelector<HTMLButtonElement>('#base64-copy')
  const downloadButton = root.querySelector<HTMLButtonElement>('#base64-download')
  const statInput = root.querySelector<HTMLElement>('#base64-stat-input')
  const statOutput = root.querySelector<HTMLElement>('#base64-stat-output')
  const statBytes = root.querySelector<HTMLElement>('#base64-stat-bytes')
  const statFormat = root.querySelector<HTMLElement>('#base64-stat-format')
  const processButton = root.querySelector<HTMLButtonElement>('#base64-process')
  const clearButton = root.querySelector<HTMLButtonElement>('#base64-clear')
  const modeButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-mode]'))
  const panel = root.querySelector<HTMLElement>('#base64-panel')
  let mode: Base64Mode = 'encode'
  let processedOutput = ''

  function getInputLength() {
    return Array.from(input?.value ?? '').length
  }

  function getEncoding(): BaseEncoding {
    if (encodingInput?.value === 'base32') return 'base32'
    if (encodingInput?.value === 'base58') return 'base58'
    if (encodingInput?.value === 'base62') return 'base62'
    if (encodingInput?.value === 'base85') return 'base85'
    if (encodingInput?.value === 'base91') return 'base91'
    return 'base64'
  }

  function getEncodingLabel() {
    const labels: Record<BaseEncoding, string> = {
      base32: 'Base32',
      base58: 'Base58',
      base62: 'Base62',
      base64: 'Base64',
      base85: 'Ascii85',
      base91: 'Base91'
    }
    return labels[getEncoding()]
  }

  function updateModeLabels() {
    const label = getEncodingLabel()
    const t = currentTranslator()
    if (inputLabel) inputLabel.textContent = mode === 'encode' ? t('workspace.inputLabel') : t('toolUi.base64.inputHintFor', { label })
    if (processLabel) processLabel.textContent = mode === 'encode' ? t('workspace.startEncode') : t('workspace.startDecode')
    if (input)
      input.placeholder =
        mode === 'encode' ? t('toolUi.base64.inputPlaceholder') : t('toolUi.base64.decodeInputPlaceholder', { label })
  }

  function clearError() {
    if (!errorBox) return
    errorBox.textContent = ''
    errorBox.hidden = true
  }

  function showError(result: Extract<BaseResult, { ok: false }>) {
    if (!errorBox) return
    const t = currentTranslator()
    const position = result.position === undefined ? '' : t('toolUi.base64.charPosition', { position: result.position })
    errorBox.textContent = `${position}${t(`toolUi.base64.errors.${result.code}`, result.params)}`
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
    if (resultStatus) resultStatus.textContent = currentTranslator()('workspace.waiting')
    if (statInput) statInput.textContent = '—'
    if (statOutput) statOutput.textContent = '—'
    if (statBytes) statBytes.textContent = '—'
    if (statFormat) statFormat.textContent = '—'
  }

  function renderResult(result: Extract<BaseResult, { ok: true }>) {
    processedOutput = result.output
    if (resultCard) resultCard.hidden = false
    const t = currentTranslator()
    if (resultStatus) resultStatus.textContent = mode === 'encode' ? t('toolUi.base64.doneEncode') : t('toolUi.base64.doneDecode')
    if (outputLabel) outputLabel.textContent = mode === 'encode' ? t('workspace.encodedResult') : t('workspace.decodedResult')
    if (output) {
      output.value = result.output
      output.dataset.empty = 'false'
    }
    if (copyButton) copyButton.disabled = false
    if (downloadButton) downloadButton.disabled = false
    if (statInput) statInput.textContent = String(getInputLength())
    if (statOutput) statOutput.textContent = String(result.outputLength)
    if (statBytes) statBytes.textContent = formatBytes(result.byteLength)
    if (statFormat) statFormat.textContent = mode === 'encode' ? getEncodingLabel() : t('toolUi.base64.utf8Text')
  }

  function setMode(nextMode: Base64Mode) {
    if (mode === nextMode) return
    mode = nextMode
    modeButtons.forEach((button) => {
      const active = button.dataset.mode === mode
      button.classList.toggle('active', active)
      button.setAttribute('aria-selected', String(active))
    })
    panel?.setAttribute('aria-labelledby', mode === 'encode' ? 'base64-encode-tab' : 'base64-decode-tab')
    updateModeLabels()
    clearError()
    resetResult()
  }

  function process() {
    clearError()
    const value = input?.value ?? ''
    if (mode === 'decode' && !value.trim()) {
      resetResult()
      if (errorBox) {
        errorBox.textContent = currentTranslator()('toolUi.base64.needInput', { label: getEncodingLabel() })
        errorBox.hidden = false
      }
      return
    }
    const result = mode === 'encode' ? encodeBase(value, getEncoding()) : decodeBase(value, getEncoding())
    if (!result.ok) {
      resetResult()
      showError(result)
      return
    }
    renderResult(result)
    recordToolUsage('base64')
  }

  async function copyOutput() {
    if (!processedOutput) return
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(processedOutput)
      showToast(currentTranslator()('toolUi.base64.toast.copied'))
    } catch {
      showToast(currentTranslator()('toolUi.base64.toast.manualCopy'))
    }
  }

  function downloadOutput() {
    if (!processedOutput) return
    const url = URL.createObjectURL(new Blob([processedOutput], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = mode === 'encode' ? 'encoded.txt' : 'decoded.txt'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    showToast(currentTranslator()('toolUi.base64.toast.downloadReady'))
  }

  function clearAll() {
    if (input) input.value = ''
    if (charCount) charCount.textContent = '0'
    clearError()
    resetResult()
    input?.focus()
  }

  modeButtons.forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode as Base64Mode)))
  encodingInput?.addEventListener('change', () => {
    updateModeLabels()
    clearError()
    resetResult()
  })
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

  updateModeLabels()
  resetResult()
}

document.addEventListener('astro:page-load', init)
init()
