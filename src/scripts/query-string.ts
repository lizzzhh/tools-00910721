import { buildQueryString, parseQueryString, type QueryEntry } from '../lib/query-string'
import { recordToolUsage } from './usage'
import { clearError, copyText, downloadText, formatNumber, setStat, setValue, showError, toggleHidden } from './tool-panel'

type QueryAction = 'parse' | 'build'

const parseSample = '?utm_source=weibo&utm_medium=%E7%A4%BE%E4%BA%A1&tags=a&tags=b&draft#%E9%A1%B5%E9%9D%A2'
const buildSample = '[\n  { "key": "utm_source", "value": "weibo" },\n  { "key": "utm_medium", "value": "社交" },\n  { "key": "tags", "value": "a" },\n  { "key": "tags", "value": "b" },\n  "draft"\n]'

const mountedRoots = new WeakSet<HTMLElement>()

function renderRows(container: HTMLElement, entries: QueryEntry[]) {
  container.replaceChildren(
    ...entries.map((entry) => {
      const element = document.createElement('div')
      element.className = 'tool-row'
      const key = document.createElement('span')
      key.textContent = entry.key
      const value = document.createElement('span')
      value.textContent = entry.hasValue ? entry.value : '（无值）'
      value.dataset.empty = entry.hasValue ? 'false' : 'true'
      element.append(key, value)
      return element
    })
  )
}

function init() {
  const root = document.querySelector<HTMLElement>('.query-string-workspace')
  if (!root || mountedRoots.has(root)) return
  mountedRoots.add(root)

  const input = root?.querySelector<HTMLTextAreaElement>('#query-input')
  const inputLabel = root?.querySelector<HTMLElement>('#query-input-label')
  const charCount = root?.querySelector<HTMLElement>('#query-char-count')
  const runButton = root?.querySelector<HTMLButtonElement>('#query-run')
  const runLabel = root?.querySelector<HTMLElement>('#query-run-label')
  const sampleButton = root?.querySelector<HTMLButtonElement>('#query-sample')
  const clearButton = root?.querySelector<HTMLButtonElement>('#query-clear')
  const errorBox = root?.querySelector<HTMLElement>('#query-error')
  const resultCard = root?.querySelector<HTMLElement>('#query-result')
  const resultStatus = root?.querySelector<HTMLElement>('#query-result-status')
  const outputLabel = root?.querySelector<HTMLElement>('#query-output-label')
  const output = root?.querySelector<HTMLTextAreaElement>('#query-output')
  const copyButton = root?.querySelector<HTMLButtonElement>('#query-copy')
  const downloadButton = root?.querySelector<HTMLButtonElement>('#query-download')
  const tableWrap = root?.querySelector<HTMLElement>('#query-table-wrap')
  const rows = root?.querySelector<HTMLElement>('#query-rows')
  const optionsTitle = root?.querySelector<HTMLElement>('#query-options-title')
  const optionsHint = root?.querySelector<HTMLElement>('#query-options-hint')
  const parseOptions = root?.querySelector<HTMLElement>('#query-parse-options')
  const buildOptions = root?.querySelector<HTMLElement>('#query-build-options')
  const panel = root?.querySelector<HTMLElement>('#query-panel')
  const modeButtons = Array.from(root?.querySelectorAll<HTMLButtonElement>('[data-mode]'))
  let action: QueryAction = 'parse'
  let processed = ''

  function resetResult() {
    processed = ''
    toggleHidden(resultCard, true)
    toggleHidden(tableWrap, true)
    setValue(output, '')
    if (resultStatus) resultStatus.textContent = '等待处理'
    if (copyButton) copyButton.disabled = true
    if (downloadButton) downloadButton.disabled = true
    setStat(root, 'query-stat-count', '—')
    setStat(root, 'query-stat-duplicates', '—')
    setStat(root, 'query-stat-length', '—')
    setStat(root, 'query-stat-keys', '—')
  }

  function run() {
    clearError(errorBox)
    const value = input?.value ?? ''

    const result =
      action === 'parse'
        ? parseQueryString(value, {
            keepHash: root?.querySelector<HTMLInputElement>('#query-keep-hash')?.checked ?? false,
            keepEmpty: root?.querySelector<HTMLInputElement>('#query-parse-empty')?.checked ?? true,
            sortKeys: root?.querySelector<HTMLInputElement>('#query-parse-sort')?.checked ?? false
          })
        : buildQueryString(value, {
            encode: root?.querySelector<HTMLInputElement>('#query-encode')?.checked ?? true,
            encodeSpaceAsPlus: root?.querySelector<HTMLInputElement>('#query-plus')?.checked ?? false,
            keepEmpty: root?.querySelector<HTMLInputElement>('#query-build-empty')?.checked ?? true,
            sortKeys: root?.querySelector<HTMLInputElement>('#query-build-sort')?.checked ?? false
          })

    if (!result.ok) {
      resetResult()
      showError(errorBox, result.message, result.position)
      return
    }

    processed = result.output
    setValue(output, result.output)
    if (rows) renderRows(rows, result.entries)
    toggleHidden(tableWrap, result.entries.length === 0)
    toggleHidden(resultCard, false)
    if (resultStatus) resultStatus.textContent = action === 'parse' ? '解析完成' : '生成完成'
    if (outputLabel) outputLabel.textContent = action === 'parse' ? '解析结果（JSON）' : '生成的查询字符串'
    if (copyButton) copyButton.disabled = false
    if (downloadButton) downloadButton.disabled = false
    setStat(root, 'query-stat-count', formatNumber(result.count))
    setStat(root, 'query-stat-duplicates', formatNumber(result.duplicateKeys))
    setStat(root, 'query-stat-length', `${formatNumber(result.output.length)} 字符`)
    setStat(root, 'query-stat-keys', formatNumber(new Set(result.entries.map((entry) => entry.key)).size))
    recordToolUsage('query-string')
  }

  function setAction(next: QueryAction) {
    if (action === next) return
    action = next
    modeButtons.forEach((button) => {
      const active = button.dataset.mode === action
      button.classList.toggle('active', active)
      button.setAttribute('aria-selected', String(active))
    })
    panel?.setAttribute('aria-labelledby', `query-${action}-tab`)
    toggleHidden(parseOptions, action !== 'parse')
    toggleHidden(buildOptions, action !== 'build')
    if (optionsTitle) optionsTitle.textContent = action === 'parse' ? '解析选项' : '生成选项'
    if (optionsHint) {
      optionsHint.innerHTML = action === 'parse' ? '支持粘贴完整 URL、<code>?</code> 开头或纯查询串。' : '输入 JSON 对象、键值对数组或字符串数组，例如 <code>[{"key":"a","value":"1"}]</code>。'
    }
    if (inputLabel) inputLabel.textContent = action === 'parse' ? '查询字符串' : 'JSON 输入'
    if (runLabel) runLabel.textContent = action === 'parse' ? '开始解析' : '开始生成'
    if (input) input.placeholder = action === 'parse' ? '?utm_source=weibo&tags=a' : '[\n  { "key": "page", "value": "1" }\n]'
    clearError(errorBox)
    resetResult()
  }

  function loadSample() {
    if (!input) return
    input.value = action === 'parse' ? parseSample : buildSample
    if (charCount) charCount.textContent = String(Array.from(input.value).length)
    run()
  }

  modeButtons.forEach((button) => button.addEventListener('click', () => setAction(button.dataset.mode as QueryAction)))
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
  downloadButton?.addEventListener('click', () => downloadText(processed, 'query-string.txt'))
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
