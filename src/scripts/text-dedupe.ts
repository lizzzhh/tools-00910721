import { dedupeLines, shuffleLines, sortLines, type SortMode } from '../lib/text-lines'
import { recordToolUsage } from './usage'
import { clearError, copyText, downloadText, formatNumber, setStat, setValue, showError, toggleHidden } from './tool-panel'

type LineAction = 'dedupe' | 'sort' | 'reverse' | 'shuffle'

const sample = `banana
apple
cherry
banana
Apple
date
apple`

const mountedRoots = new WeakSet<HTMLElement>()

function init() {
  const root = document.querySelector<HTMLElement>('.text-dedupe-workspace')
  if (!root || mountedRoots.has(root)) return
  mountedRoots.add(root)

  const input = root?.querySelector<HTMLTextAreaElement>('#text-dedupe-input')
  const lineCount = root?.querySelector<HTMLElement>('#text-dedupe-line-count')
  const runButton = root?.querySelector<HTMLButtonElement>('#text-dedupe-run')
  const sampleButton = root?.querySelector<HTMLButtonElement>('#text-dedupe-sample')
  const clearButton = root?.querySelector<HTMLButtonElement>('#text-dedupe-clear')
  const errorBox = root?.querySelector<HTMLElement>('#text-dedupe-error')
  const resultCard = root?.querySelector<HTMLElement>('#text-dedupe-result')
  const resultStatus = root?.querySelector<HTMLElement>('#text-dedupe-result-status')
  const output = root?.querySelector<HTMLTextAreaElement>('#text-dedupe-output')
  const copyButton = root?.querySelector<HTMLButtonElement>('#text-dedupe-copy')
  const downloadButton = root?.querySelector<HTMLButtonElement>('#text-dedupe-download')
  let processed = ''

  function readOptions() {
    return {
      ignoreCase: root?.querySelector<HTMLInputElement>('#text-dedupe-ignore-case')?.checked ?? false,
      trim: root?.querySelector<HTMLInputElement>('#text-dedupe-trim')?.checked ?? false,
      unique: root?.querySelector<HTMLInputElement>('#text-dedupe-unique')?.checked ?? false
    }
  }

  function resetResult() {
    processed = ''
    toggleHidden(resultCard, true)
    setValue(output, '')
    if (resultStatus) resultStatus.textContent = '等待处理'
    if (copyButton) copyButton.disabled = true
    if (downloadButton) downloadButton.disabled = true
    setStat(root, 'text-dedupe-stat-total', '—')
    setStat(root, 'text-dedupe-stat-kept', '—')
    setStat(root, 'text-dedupe-stat-removed', '—')
    setStat(root, 'text-dedupe-stat-ratio', '—')
  }

  function run() {
    clearError(errorBox)
    const value = input?.value ?? ''
    if (value.trim().length === 0) {
      resetResult()
      showError(errorBox, '请输入要处理的文本')
      return
    }

    const options = readOptions()
    const action = (root?.querySelector<HTMLInputElement>('#text-dedupe-mode')?.value ?? 'dedupe') as LineAction
    const mode = (root?.querySelector<HTMLInputElement>('#text-dedupe-sort-mode')?.value ?? 'line') as SortMode
    const result =
      action === 'dedupe'
        ? dedupeLines(value, options)
        : action === 'shuffle'
          ? shuffleLines(value)
          : sortLines(value, { ...options, mode, order: action === 'reverse' ? 'desc' : 'asc' })

    processed = result.output
    setValue(output, result.output)
    toggleHidden(resultCard, false)
    if (resultStatus) resultStatus.textContent = '处理完成'
    if (copyButton) copyButton.disabled = false
    if (downloadButton) downloadButton.disabled = false
    setStat(root, 'text-dedupe-stat-total', formatNumber(result.total))
    setStat(root, 'text-dedupe-stat-kept', formatNumber(result.kept))
    setStat(root, 'text-dedupe-stat-removed', formatNumber(result.removed))
    setStat(root, 'text-dedupe-stat-ratio', result.total === 0 ? '0%' : `${Math.round((result.removed / result.total) * 100)}%`)
    recordToolUsage('text-deduplicate')
  }

  input?.addEventListener('input', () => {
    if (lineCount) lineCount.textContent = formatNumber(input.value.split(/\r\n|\r|\n/).length)
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
    if (lineCount) lineCount.textContent = formatNumber(sample.split('\n').length)
    run()
  })
  clearButton?.addEventListener('click', () => {
    if (input) input.value = ''
    if (lineCount) lineCount.textContent = '0'
    clearError(errorBox)
    resetResult()
    input?.focus()
  })
  copyButton?.addEventListener('click', () => void copyText(processed))
  downloadButton?.addEventListener('click', () => downloadText(processed, 'text-lines.txt'))
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
