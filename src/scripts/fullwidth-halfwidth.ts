import { convertWidth, type WidthMode } from '../lib/fullwidth'
import { recordToolUsage } from './usage'
import { clearError, copyText, downloadText, formatNumber, setStat, setValue, toggleHidden } from './tool-panel'

const samples: Record<WidthMode, string> = {
  'to-half': 'ＡＢＣ　カタカナ　你好，世界。（１２３）',
  'to-full': 'ABC カタカナ 你好,世界.(123)'
}

const mountedRoots = new WeakSet<HTMLElement>()

function init() {
  const root = document.querySelector<HTMLElement>('.fullwidth-workspace')
  if (!root || mountedRoots.has(root)) return
  mountedRoots.add(root)

  const input = root.querySelector<HTMLTextAreaElement>('#fullwidth-input')
  const charCount = root.querySelector<HTMLElement>('#fullwidth-char-count')
  const modeInput = root.querySelector<HTMLInputElement>('#fullwidth-mode')
  const keepSpaceInput = root.querySelector<HTMLInputElement>('#fullwidth-keep-space')
  const runButton = root.querySelector<HTMLButtonElement>('#fullwidth-run')
  const sampleButton = root.querySelector<HTMLButtonElement>('#fullwidth-sample')
  const clearButton = root.querySelector<HTMLButtonElement>('#fullwidth-clear')
  const errorBox = root.querySelector<HTMLElement>('#fullwidth-error')
  const resultCard = root.querySelector<HTMLElement>('#fullwidth-result')
  const resultStatus = root.querySelector<HTMLElement>('#fullwidth-result-status')
  const output = root.querySelector<HTMLTextAreaElement>('#fullwidth-output')
  const copyButton = root.querySelector<HTMLButtonElement>('#fullwidth-copy')
  const downloadButton = root.querySelector<HTMLButtonElement>('#fullwidth-download')
  let processed = ''

  function readMode(): WidthMode {
    return modeInput?.value === 'to-full' ? 'to-full' : 'to-half'
  }

  function resetResult() {
    processed = ''
    toggleHidden(resultCard, true)
    setValue(output, '')
    if (resultStatus) resultStatus.textContent = '等待处理'
    if (copyButton) copyButton.disabled = true
    if (downloadButton) downloadButton.disabled = true
    setStat(root, 'fullwidth-stat-converted', '—')
    setStat(root, 'fullwidth-stat-unchanged', '—')
    setStat(root, 'fullwidth-stat-input', '—')
    setStat(root, 'fullwidth-stat-output', '—')
  }

  function run() {
    clearError(errorBox)
    const value = input?.value ?? ''
    const result = convertWidth(value, readMode(), {
      keepSpace: keepSpaceInput?.checked ?? true
    })
    const total = Array.from(value).length

    processed = result.output
    setValue(output, result.output)
    toggleHidden(resultCard, false)
    if (resultStatus) resultStatus.textContent = '转换完成'
    if (copyButton) copyButton.disabled = false
    if (downloadButton) downloadButton.disabled = false
    setStat(root, 'fullwidth-stat-converted', formatNumber(result.converted))
    setStat(root, 'fullwidth-stat-unchanged', formatNumber(Math.max(0, total - result.converted)))
    setStat(root, 'fullwidth-stat-input', formatNumber(total))
    setStat(root, 'fullwidth-stat-output', formatNumber(Array.from(result.output).length))
    recordToolUsage('fullwidth-halfwidth')
  }

  input?.addEventListener('input', () => {
    if (charCount) charCount.textContent = String(Array.from(input.value).length)
    clearError(errorBox)
    resetResult()
  })
  root.querySelectorAll<HTMLElement>('.tool-options input, .tool-options button').forEach((control) => {
    control.addEventListener('change', () => {
      clearError(errorBox)
      resetResult()
    })
  })
  runButton?.addEventListener('click', run)
  sampleButton?.addEventListener('click', () => {
    if (input) input.value = samples[readMode()]
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
  downloadButton?.addEventListener('click', () => downloadText(processed, 'fullwidth.txt'))
  root.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      run()
    }
  })

  resetResult()
}

document.addEventListener('astro:page-load', init)
init()
