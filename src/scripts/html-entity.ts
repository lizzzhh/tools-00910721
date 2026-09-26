import { decodeHtml, encodeHtml, type EntityFormat, type EntityMode, type HtmlResult } from '../lib/html-entities'
import { currentTranslator } from '../i18n/client'
import { recordToolUsage } from './usage'
import { clearError, copyText, downloadText, setStat, setValue, showError, toggleHidden } from './tool-panel'

type EntityAction = 'encode' | 'decode'

const sample = '<a href="https://example.com?a=1&b=2" title=\'透明质的工具箱\'>\n  Tom & Jerry < 3 © 2026\n</a>'

const mountedRoots = new WeakSet<HTMLElement>()

function readMode(): EntityMode {
  const value = document.querySelector<HTMLInputElement>('#html-entity-mode')?.value
  if (value === 'named' || value === 'all') return value
  return 'basic'
}

function readFormat(): EntityFormat {
  const value = document.querySelector<HTMLInputElement>('#html-entity-format')?.value
  if (value === 'decimal' || value === 'hex') return value
  return 'named'
}

function init() {
  const root = document.querySelector<HTMLElement>('.html-entity-workspace')
  if (!root || mountedRoots.has(root)) return
  mountedRoots.add(root)

  const input = root?.querySelector<HTMLTextAreaElement>('#html-entity-input')
  const inputLabel = root?.querySelector<HTMLElement>('#html-entity-input-label')
  const charCount = root?.querySelector<HTMLElement>('#html-entity-char-count')
  const runButton = root?.querySelector<HTMLButtonElement>('#html-entity-run')
  const runLabel = root?.querySelector<HTMLElement>('#html-entity-run-label')
  const sampleButton = root?.querySelector<HTMLButtonElement>('#html-entity-sample')
  const clearButton = root?.querySelector<HTMLButtonElement>('#html-entity-clear')
  const errorBox = root?.querySelector<HTMLElement>('#html-entity-error')
  const resultCard = root?.querySelector<HTMLElement>('#html-entity-result')
  const resultStatus = root?.querySelector<HTMLElement>('#html-entity-result-status')
  const outputLabel = root?.querySelector<HTMLElement>('#html-entity-output-label')
  const output = root?.querySelector<HTMLTextAreaElement>('#html-entity-output')
  const copyButton = root?.querySelector<HTMLButtonElement>('#html-entity-copy')
  const downloadButton = root?.querySelector<HTMLButtonElement>('#html-entity-download')
  const panel = root?.querySelector<HTMLElement>('#html-entity-panel')
  const modeButtons = Array.from(root?.querySelectorAll<HTMLButtonElement>('[data-mode]'))
  let action: EntityAction = 'encode'
  let processed = ''

  function resetResult() {
    processed = ''
    toggleHidden(resultCard, true)
    setValue(output, '')
    if (resultStatus) resultStatus.textContent = currentTranslator()('workspace.waiting')
    if (copyButton) copyButton.disabled = true
    if (downloadButton) downloadButton.disabled = true
    setStat(root, 'html-entity-stat-input', '—')
    setStat(root, 'html-entity-stat-output', '—')
    setStat(root, 'html-entity-stat-replaced', '—')
    setStat(root, 'html-entity-stat-delta', '—')
  }

  function renderResult(result: Extract<HtmlResult, { ok: true }>) {
    processed = result.output
    toggleHidden(resultCard, false)
    const t = currentTranslator()
    if (resultStatus) resultStatus.textContent = action === 'encode' ? t('toolUi.html-entity.runtime.encodeDone') : t('toolUi.html-entity.runtime.decodeDone')
    if (outputLabel) outputLabel.textContent = action === 'encode' ? t('toolUi.html-entity.runtime.encodedResult') : t('toolUi.html-entity.runtime.decodedResult')
    setValue(output, result.output)
    if (copyButton) copyButton.disabled = false
    if (downloadButton) downloadButton.disabled = false
    setStat(root, 'html-entity-stat-input', String(result.inputLength))
    setStat(root, 'html-entity-stat-output', String(result.outputLength))
    setStat(root, 'html-entity-stat-replaced', String(result.replaced))
    const delta = result.outputLength - result.inputLength
    setStat(root, 'html-entity-stat-delta', delta > 0 ? `+${delta}` : String(delta))
  }

  function run() {
    clearError(errorBox)
    const value = input?.value ?? ''
    const result = action === 'encode' ? encodeHtml(value, readMode(), readFormat()) : decodeHtml(value, root?.querySelector<HTMLInputElement>('#html-lenient')?.checked ?? false)
    if (!result.ok) {
      resetResult()
      showError(errorBox, currentTranslator()(`toolUi.html-entity.errors.${result.code}`, result.params), result.position)
      return
    }
    renderResult(result)
    recordToolUsage('html-entity')
  }

  function setAction(next: EntityAction) {
    if (action === next) return
    action = next
    modeButtons.forEach((button) => {
      const active = button.dataset.mode === action
      button.classList.toggle('active', active)
      button.setAttribute('aria-selected', String(active))
    })
    panel?.setAttribute('aria-labelledby', action === 'encode' ? 'html-encode-tab' : 'html-decode-tab')
    const t = currentTranslator()
    if (inputLabel) inputLabel.textContent = action === 'encode' ? t('toolUi.html-entity.runtime.inputEncodeLabel') : t('toolUi.html-entity.runtime.inputDecodeLabel')
    if (runLabel) runLabel.textContent = action === 'encode' ? t('toolUi.html-entity.runtime.runEncode') : t('toolUi.html-entity.runtime.runDecode')
    if (input) input.placeholder = action === 'encode' ? '<div class="a">Tom & Jerry</div>' : '&lt;div&gt;Tom &amp; Jerry&lt;/div&gt;'
    clearError(errorBox)
    resetResult()
  }

  function loadSample() {
    if (!input) return
    input.value = sample
    if (charCount) charCount.textContent = String(Array.from(sample).length)
    run()
  }

  modeButtons.forEach((button) => button.addEventListener('click', () => setAction(button.dataset.mode as EntityAction)))
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
  sampleButton?.addEventListener('click', loadSample)
  clearButton?.addEventListener('click', () => {
    if (input) input.value = ''
    if (charCount) charCount.textContent = '0'
    clearError(errorBox)
    resetResult()
    input?.focus()
  })
  copyButton?.addEventListener('click', () => void copyText(processed))
  downloadButton?.addEventListener('click', () => downloadText(processed, action === 'encode' ? 'html-escaped.txt' : 'html-unescaped.txt'))
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
