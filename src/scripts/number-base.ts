import { baseLabels, basePrefixes, convertNumber, isNumberBase, numberBases, type NumberBase } from '../lib/number-base'
import { recordToolUsage } from './usage'
import { clearError, copyText, downloadText, formatNumber, setStat, showError, toggleHidden } from './tool-panel'

const sample = '0x4d2'

const mountedRoots = new WeakSet<HTMLElement>()

function init() {
  const root = document.querySelector<HTMLElement>('.number-base-workspace')
  if (!root || mountedRoots.has(root)) return
  mountedRoots.add(root)

  const input = root?.querySelector<HTMLInputElement>('#number-base-input')
  const runButton = root?.querySelector<HTMLButtonElement>('#number-base-run')
  const sampleButton = root?.querySelector<HTMLButtonElement>('#number-base-sample')
  const clearButton = root?.querySelector<HTMLButtonElement>('#number-base-clear')
  const errorBox = root?.querySelector<HTMLElement>('#number-base-error')
  const resultCard = root?.querySelector<HTMLElement>('#number-base-result')
  const resultStatus = root?.querySelector<HTMLElement>('#number-base-result-status')
  const rows = root?.querySelector<HTMLElement>('#number-base-rows')
  const copyButton = root?.querySelector<HTMLButtonElement>('#number-base-copy')
  const downloadButton = root?.querySelector<HTMLButtonElement>('#number-base-download')
  let processed = ''

  function resetResult() {
    processed = ''
    toggleHidden(resultCard, true)
    if (resultStatus) resultStatus.textContent = '等待处理'
    if (copyButton) copyButton.disabled = true
    if (downloadButton) downloadButton.disabled = true
    setStat(root, 'number-base-stat-decimal', '—')
    setStat(root, 'number-base-stat-input', '—')
    setStat(root, 'number-base-stat-bits', '—')
    setStat(root, 'number-base-stat-sign', '—')
    rows?.replaceChildren()
  }

  function run() {
    clearError(errorBox)
    const rawBase = root?.querySelector<HTMLInputElement>('#number-base-from')?.value ?? '10'
    if (!isNumberBase(rawBase)) {
      resetResult()
      showError(errorBox, '请选择有效的输入进制')
      return
    }
    const from = Number(rawBase) as NumberBase
    const result = convertNumber(input?.value ?? '', from)
    if (!result.ok) {
      resetResult()
      showError(errorBox, result.message, result.position)
      return
    }

    processed = numberBases.map((base) => `${baseLabels[base]}(${base})\t${basePrefixes[base]}${result.digits[base]}`).join('\n')
    if (rows) {
      rows.replaceChildren(
        ...numberBases.map((base) => {
          const element = document.createElement('div')
          element.className = 'tool-row'
          const label = document.createElement('span')
          label.textContent = `${baseLabels[base]} ${base}`
          const value = document.createElement('span')
          value.textContent = `${basePrefixes[base]}${result.digits[base]}`
          element.append(label, value)
          element.addEventListener('click', () => void copyText(`${basePrefixes[base]}${result.digits[base]}`, `${baseLabels[base]}结果已复制`))
          return element
        })
      )
    }

    toggleHidden(resultCard, false)
    if (resultStatus) resultStatus.textContent = '转换完成'
    if (copyButton) copyButton.disabled = false
    if (downloadButton) downloadButton.disabled = false
    setStat(root, 'number-base-stat-decimal', result.digits[10])
    setStat(root, 'number-base-stat-input', formatNumber(result.inputLength))
    setStat(root, 'number-base-stat-bits', `${formatNumber(result.digits[2].length)} 位`)
    setStat(root, 'number-base-stat-sign', result.negative ? '负数' : '非负')
    recordToolUsage('number-base')
  }

  input?.addEventListener('input', () => {
    clearError(errorBox)
    resetResult()
  })
  root?.querySelector<HTMLInputElement>('#number-base-from')?.addEventListener('change', () => {
    clearError(errorBox)
    resetResult()
  })
  runButton?.addEventListener('click', run)
  sampleButton?.addEventListener('click', () => {
    if (input) input.value = sample
    run()
  })
  clearButton?.addEventListener('click', () => {
    if (input) input.value = ''
    clearError(errorBox)
    resetResult()
    input?.focus()
  })
  copyButton?.addEventListener('click', () => void copyText(processed))
  downloadButton?.addEventListener('click', () => downloadText(processed, 'number-base.txt'))
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
