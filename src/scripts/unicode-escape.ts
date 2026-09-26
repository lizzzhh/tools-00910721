import { decodeUnicode, encodeUnicode, inspectCodePoints, type UnicodeResult, type UnicodeScope, type UnicodeStyle } from '../lib/unicode'
import { recordToolUsage } from './usage'
import { clearError, copyText, downloadText, formatNumber, setStat, setValue, showError, toggleHidden } from './tool-panel'

type UnicodeAction = 'encode' | 'decode' | 'inspect'

const mountedRoots = new WeakSet<HTMLElement>()

function readStyle(): UnicodeStyle {
  const value = document.querySelector<HTMLInputElement>('#unicode-style')?.value
  if (value === 'long' || value === 'hex' || value === 'decimal') return value
  return 'short'
}

function readScope(): UnicodeScope {
  return document.querySelector<HTMLInputElement>('#unicode-control')?.checked ? 'control' : 'non-ascii'
}

function renderRows(container: HTMLElement, rows: { character: string; hex: string; decimal: number; utf8: string }[]) {
  container.replaceChildren(
    ...rows.map((row) => {
      const element = document.createElement('div')
      element.className = 'tool-row'
      for (const value of [row.character, row.hex, String(row.decimal), row.utf8]) {
        const cell = document.createElement('span')
        cell.textContent = value
        element.append(cell)
      }
      return element
    })
  )
}

function init() {
  const root = document.querySelector<HTMLElement>('.unicode-workspace')
  if (!root || mountedRoots.has(root)) return
  mountedRoots.add(root)

  const input = root?.querySelector<HTMLTextAreaElement>('#unicode-input')
  const inputLabel = root?.querySelector<HTMLElement>('#unicode-input-label')
  const charCount = root?.querySelector<HTMLElement>('#unicode-char-count')
  const runButton = root?.querySelector<HTMLButtonElement>('#unicode-run')
  const runLabel = root?.querySelector<HTMLElement>('#unicode-run-label')
  const clearButton = root?.querySelector<HTMLButtonElement>('#unicode-clear')
  const errorBox = root?.querySelector<HTMLElement>('#unicode-error')
  const resultCard = root?.querySelector<HTMLElement>('#unicode-result')
  const resultStatus = root?.querySelector<HTMLElement>('#unicode-result-status')
  const outputLabel = root?.querySelector<HTMLElement>('#unicode-output-label')
  const output = root?.querySelector<HTMLTextAreaElement>('#unicode-output')
  const copyButton = root?.querySelector<HTMLButtonElement>('#unicode-copy')
  const downloadButton = root?.querySelector<HTMLButtonElement>('#unicode-download')
  const tableWrap = root?.querySelector<HTMLElement>('#unicode-table-wrap')
  const rows = root?.querySelector<HTMLElement>('#unicode-rows')
  const options = root?.querySelector<HTMLElement>('#unicode-encode-options')
  const panel = root?.querySelector<HTMLElement>('#unicode-panel')
  const modeButtons = Array.from(root?.querySelectorAll<HTMLButtonElement>('[data-mode]'))
  let action: UnicodeAction = 'encode'
  let processed = ''

  function resetResult() {
    processed = ''
    toggleHidden(resultCard, true)
    toggleHidden(tableWrap, true)
    setValue(output, '')
    if (resultStatus) resultStatus.textContent = '等待处理'
    if (copyButton) copyButton.disabled = true
    if (downloadButton) downloadButton.disabled = true
    setStat(root, 'unicode-stat-input', '—')
    setStat(root, 'unicode-stat-output', '—')
    setStat(root, 'unicode-stat-count', '—')
    setStat(root, 'unicode-stat-distinct', '—')
  }

  function showResult(status: string, label: string) {
    toggleHidden(resultCard, false)
    if (resultStatus) resultStatus.textContent = status
    if (outputLabel) outputLabel.textContent = label
    if (copyButton) copyButton.disabled = false
    if (downloadButton) downloadButton.disabled = false
  }

  function renderText(result: Extract<UnicodeResult, { ok: true }>, status: string, label: string) {
    processed = result.output
    setValue(output, result.output)
    toggleHidden(tableWrap, true)
    showResult(status, label)
    setStat(root, 'unicode-stat-input', String(result.inputLength))
    setStat(root, 'unicode-stat-output', String(result.outputLength))
    setStat(root, 'unicode-stat-count', formatNumber(result.replaced))
    setStat(root, 'unicode-stat-distinct', '—')
  }

  function run() {
    clearError(errorBox)
    const value = input?.value ?? ''

    if (action === 'inspect') {
      const report = inspectCodePoints(value)
      processed = report.rows.map((row) => `${row.character}\t${row.hex}\t${row.decimal}\t${row.utf8}`).join('\n')
      setValue(output, value)
      showResult('码点解析完成', '原始文本')
      toggleHidden(tableWrap, false)
      if (rows) renderRows(rows, report.rows)
      setStat(root, 'unicode-stat-input', String(Array.from(value).length))
      setStat(root, 'unicode-stat-output', String(report.rows.length))
      setStat(root, 'unicode-stat-count', formatNumber(report.total))
      setStat(root, 'unicode-stat-distinct', formatNumber(report.distinct))
      recordToolUsage('unicode-escape')
      return
    }

    const result = action === 'encode' ? encodeUnicode(value, readStyle(), readScope()) : decodeUnicode(value)
    if (!result.ok) {
      resetResult()
      showError(errorBox, result.message, result.position)
      return
    }
    renderText(result, action === 'encode' ? '转义完成' : '还原完成', action === 'encode' ? '转义结果' : '还原结果')
    recordToolUsage('unicode-escape')
  }

  function setAction(next: UnicodeAction) {
    if (action === next) return
    action = next
    modeButtons.forEach((button) => {
      const active = button.dataset.mode === action
      button.classList.toggle('active', active)
      button.setAttribute('aria-selected', String(active))
    })
    panel?.setAttribute('aria-labelledby', `unicode-${action === 'encode' ? 'escape' : action === 'decode' ? 'decode' : 'inspect'}-tab`)
    if (options) options.hidden = action !== 'encode'
    if (inputLabel) inputLabel.textContent = action === 'inspect' ? '输入待查询的文本' : action === 'encode' ? '输入文本' : '输入转义序列'
    if (runLabel) runLabel.textContent = action === 'inspect' ? '查询码点' : action === 'encode' ? '开始转义' : '开始还原'
    if (input) {
      input.placeholder = action === 'encode' ? '透明质的工具箱 😀' : action === 'decode' ? '\\u7801\\u95F4 \\uD83D\\uDE00' : '透明质的工具箱 😀'
    }
    clearError(errorBox)
    resetResult()
  }

  modeButtons.forEach((button) => button.addEventListener('click', () => setAction(button.dataset.mode as UnicodeAction)))
  input?.addEventListener('input', () => {
    if (charCount) charCount.textContent = String(Array.from(input.value).length)
    clearError(errorBox)
    resetResult()
  })
  options?.querySelectorAll<HTMLElement>('input, button').forEach((control) => {
    control.addEventListener('change', () => {
      clearError(errorBox)
      resetResult()
    })
  })
  runButton?.addEventListener('click', run)
  clearButton?.addEventListener('click', () => {
    if (input) input.value = ''
    if (charCount) charCount.textContent = '0'
    clearError(errorBox)
    resetResult()
    input?.focus()
  })
  copyButton?.addEventListener('click', () => void copyText(processed))
  downloadButton?.addEventListener('click', () => downloadText(processed, 'unicode.txt'))
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
