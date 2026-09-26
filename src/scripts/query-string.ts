import { buildQueryString, countDuplicateKeys, parseQueryString, selectEntries, type QueryEntry } from '../lib/query-string'
import { recordToolUsage } from './usage'
import { clearError, copyText, downloadText, formatNumber, readCheckbox, setDisabled, setStat, setText, showError, toggleHidden } from './tool-panel'

const sample = 'https://example.com/list?utm_source=weibo&utm_medium=%E7%A4%BE%E4%BA%A4&tags=%E4%B8%AD%E6%96%87&tags=%E6%8A%80%E6%9C%AF&draft&q=hello+world#section'

const mountedRoots = new WeakSet<HTMLElement>()

function init() {
  const root = document.querySelector<HTMLElement>('.query-string-workspace')
  if (!root || mountedRoots.has(root)) return
  mountedRoots.add(root)

  const input = root.querySelector<HTMLTextAreaElement>('#query-input')
  const charCount = root.querySelector<HTMLElement>('#query-char-count')
  const sampleButton = root.querySelector<HTMLButtonElement>('#query-sample')
  const clearButton = root.querySelector<HTMLButtonElement>('#query-clear')
  const addButton = root.querySelector<HTMLButtonElement>('#query-add')
  const filterInput = root.querySelector<HTMLInputElement>('#query-filter')
  const errorBox = root.querySelector<HTMLElement>('#query-error')
  const resultStatus = root.querySelector<HTMLElement>('#query-result-status')
  const rows = root.querySelector<HTMLElement>('#query-rows')
  const emptyState = root.querySelector<HTMLElement>('#query-empty-state')
  const sourceBlock = root.querySelector<HTMLElement>('#query-source')
  const sourceValue = root.querySelector<HTMLElement>('#query-source-value')
  const duplicateWarning = root.querySelector<HTMLElement>('#query-duplicate-warning')
  const output = root.querySelector<HTMLInputElement>('#query-output')
  const downloadButton = root.querySelector<HTMLButtonElement>('#query-download')

  let entries: QueryEntry[] = []
  let hash = ''
  let processed = ''
  let base = ''
  let parseTimer: number | undefined
  let usageRecorded = false

  function readOptions() {
    return {
      encode: readCheckbox('query-encode'),
      encodeSpaceAsPlus: readCheckbox('query-plus'),
      includeEmpty: readCheckbox('query-keep-empty'),
      sortKeys: readCheckbox('query-sort'),
      leadingQuestionMark: readCheckbox('query-prefix'),
      appendHash: readCheckbox('query-append-hash')
    }
  }

  function matches(entry: QueryEntry, needle: string) {
    return entry.key.toLowerCase().includes(needle) || entry.value.toLowerCase().includes(needle)
  }

  function createIconButton(icon: string, label: string) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'icon-button'
    button.setAttribute('aria-label', label)
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('aria-hidden', 'true')
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
    use.setAttribute('href', `#${icon}`)
    svg.append(use)
    button.append(svg)
    return button
  }

  function createRow(entry: QueryEntry, index: number, position: number) {
    const row = document.createElement('div')
    row.className = 'query-row'
    row.dataset.empty = entry.hasValue ? 'false' : 'true'

    const ordinal = document.createElement('span')
    ordinal.className = 'query-row-index'
    ordinal.textContent = String(position)

    const key = document.createElement('input')
    key.type = 'text'
    key.className = 'query-cell query-cell-key'
    key.value = entry.key
    key.placeholder = '参数名'
    key.autocomplete = 'off'
    key.spellcheck = false
    key.setAttribute('aria-label', `第 ${position} 个参数的键`)
    key.addEventListener('input', () => {
      entries[index].key = key.value
      sync(true)
    })

    const value = document.createElement('input')
    value.type = 'text'
    value.className = 'query-cell query-cell-value'
    value.value = entry.value
    value.placeholder = entry.hasValue ? '参数值' : '无值参数'
    value.autocomplete = 'off'
    value.spellcheck = false
    value.setAttribute('aria-label', `第 ${position} 个参数的值`)
    value.addEventListener('input', () => {
      entries[index].value = value.value
      entries[index].hasValue = value.value !== ''
      paintValueState()
      sync(true)
    })

    const valueToggle = document.createElement('button')
    valueToggle.type = 'button'
    valueToggle.className = 'query-value-toggle'
    valueToggle.textContent = '='
    valueToggle.title = '以「键=值」形式输出；关闭时输出为「键」'
    valueToggle.setAttribute('aria-label', `第 ${position} 个参数是否输出等号`)
    valueToggle.addEventListener('click', () => {
      entries[index].hasValue = !entries[index].hasValue
      if (entries[index].hasValue) entries[index].value = entries[index].value || ''
      paintValueState()
      sync()
    })

    function paintValueState() {
      const hasValue = entries[index].hasValue
      row.dataset.empty = hasValue ? 'false' : 'true'
      valueToggle.setAttribute('aria-pressed', String(hasValue))
      value.placeholder = hasValue ? '参数值' : '无值参数'
    }

    const removeButton = createIconButton('icon-trash-2', `删除第 ${position} 个参数`)
    removeButton.addEventListener('click', () => {
      entries.splice(index, 1)
      renderRows()
      sync(true)
    })

    const actions = document.createElement('div')
    actions.className = 'query-row-actions'
    actions.append(valueToggle, removeButton)

    row.append(ordinal, key, value, actions)
    paintValueState()
    return row
  }

  function visibleEntries() {
    const needle = (filterInput?.value ?? '').trim().toLowerCase()
    return entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => !needle || matches(entry, needle))
  }

  function renderRows() {
    if (!rows) return
    const visible = visibleEntries()
    rows.replaceChildren(...visible.map(({ entry, index }, position) => createRow(entry, index, position + 1)))
    toggleHidden(emptyState, visible.length > 0)
    setText(
      emptyState,
      entries.length === 0
        ? '在上方粘贴查询串即可自动解析，也可以用「添加参数」逐条填写。'
        : '没有匹配当前筛选条件的参数。'
    )
  }

  function composeInput(query: string, options: ReturnType<typeof readOptions>) {
    const suffix = options.appendHash && hash ? `#${hash}` : ''
    if (base) return `${base}?${query}${suffix}`
    const prefix = options.leadingQuestionMark && query ? '?' : ''
    return `${prefix}${query}${suffix}`
  }

  // writeBack is only set for table-driven changes, so typing in the textarea is
  // never reformatted underneath the caret.
  function sync(writeBack = false) {
    const options = readOptions()
    const selected = selectEntries(entries, options)
    const duplicates = countDuplicateKeys(selected)
    processed = buildQueryString(entries, { ...options, appendHash: false, leadingQuestionMark: false })

    if (output) output.value = processed
    if (writeBack && input) {
      const composed = composeInput(processed, options)
      if (input.value !== composed) {
        input.value = composed
        setText(charCount, String(Array.from(composed).length))
      }
    }
    setText(sourceValue, base)
    toggleHidden(sourceBlock, !base)
    setText(resultStatus, entries.length > 0 ? '已同步' : '等待输入')
    setDisabled(downloadButton, processed === '')
    setStat(root, 'query-stat-count', formatNumber(selected.length))
    setStat(root, 'query-stat-keys', formatNumber(new Set(selected.map((entry) => entry.key)).size))
    setStat(root, 'query-stat-duplicates', formatNumber(duplicates))
    setStat(root, 'query-stat-length', `${formatNumber(processed.length)} 字符`)

    if (duplicateWarning) {
      duplicateWarning.textContent = duplicates > 0 ? `有 ${duplicates} 个重复键，输出会保留全部同名参数。` : ''
      duplicateWarning.hidden = duplicates === 0
    }
  }

  function parse() {
    const result = parseQueryString(input?.value ?? '')

    if (!result.ok) {
      entries = []
      hash = ''
      base = ''
      renderRows()
      sync()
      showError(errorBox, result.message, result.position)
      return
    }

    clearError(errorBox)
    entries = result.entries
    hash = result.hash
    base = result.base
    renderRows()
    sync()

    if (!usageRecorded && entries.length > 0) {
      usageRecorded = true
      recordToolUsage('query-string')
    }
  }

  function scheduleParse() {
    window.clearTimeout(parseTimer)
    parseTimer = window.setTimeout(parse, 200)
  }

  function clearAll() {
    window.clearTimeout(parseTimer)
    entries = []
    hash = ''
    base = ''
    usageRecorded = false
    if (input) input.value = ''
    if (filterInput) filterInput.value = ''
    setText(charCount, '0')
    clearError(errorBox)
    renderRows()
    sync()
    input?.focus()
  }

  input?.addEventListener('input', () => {
    setText(charCount, String(Array.from(input.value).length))
    scheduleParse()
  })
  filterInput?.addEventListener('input', renderRows)
  addButton?.addEventListener('click', () => {
    entries.push({ key: '', value: '', hasValue: false })
    usageRecorded = true
    if (filterInput) filterInput.value = ''
    renderRows()
    sync(true)
    const last = rows?.lastElementChild?.querySelector<HTMLInputElement>('.query-cell-key')
    last?.focus()
  })
  root.querySelectorAll<HTMLElement>('.tool-options input').forEach((control) => {
    control.addEventListener('change', () => sync(true))
  })
  sampleButton?.addEventListener('click', () => {
    if (input) input.value = sample
    setText(charCount, String(Array.from(input?.value ?? '').length))
    parse()
  })
  clearButton?.addEventListener('click', clearAll)
  output?.addEventListener('click', () => {
    if (processed) void copyText(processed, '查询字符串已复制到剪贴板')
  })
  downloadButton?.addEventListener('click', () => downloadText(processed, 'query-string.txt'))
  renderRows()
  sync()
}

document.addEventListener('astro:page-load', init)
init()
