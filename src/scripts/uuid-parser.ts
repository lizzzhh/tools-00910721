import { parseUuidList, type UuidDetails, type UuidParsedRow } from '../lib/uuid'
import { recordToolUsage } from './usage'
import { clearError, copyText, formatNumber, setStat, showError, toggleHidden } from './tool-panel'

const mountedRoots = new WeakSet<HTMLElement>()
const MAX_ROWS = 200

const kindLabels: Record<UuidDetails['kind'], string> = {
  time: '时间有序',
  random: '随机',
  name: '名称派生',
  custom: '自定义',
  none: '无字段'
}

function createRow(cells: string[]) {
  const element = document.createElement('div')
  element.className = 'tool-row'
  for (const value of cells) {
    const cell = document.createElement('span')
    cell.textContent = value
    element.append(cell)
  }
  return element
}

function detailRows(details: UuidDetails): string[][] {
  const rows: string[][] = [
    ['规范形式', details.value],
    ['紧凑形式', details.compact],
    ['版本', details.versionLabel],
    ['变体', details.variant],
    ['类型', kindLabels[details.kind]]
  ]

  if (details.form !== 'standard') {
    rows.push(['特殊格式', details.form === 'nil' ? 'Nil 全零' : 'Max 全一'])
  }
  if (details.timestamp) rows.push(['时间戳', `${details.timestamp}（Unix ${details.timestampMs} ms）`])
  if (details.clockSequence) rows.push(['时钟序列', details.clockSequence])
  if (details.dceDomain !== null) rows.push(['DCE 域', `0x${details.dceDomain.toString(16).padStart(2, '0')}`])
  if (details.node) rows.push(['节点标识', `${details.node}${details.multicast ? '（随机位已置 1）' : ''}`])
  if (details.randomTail) rows.push(['随机尾部', details.randomTail])
  if (details.entropy) rows.push(['随机位', `${details.entropy}（122 位）`])

  return rows
}

function shortTimestamp(value: string | null) {
  return value ? `${value.slice(0, 10)} ${value.slice(11, 19)}` : ''
}

function createItem(template: HTMLTemplateElement, row: UuidParsedRow) {
  const fragment = template.content.cloneNode(true) as DocumentFragment
  const element = fragment.querySelector<HTMLDetailsElement>('.uuid-parse-item')
  const head = fragment.querySelector<HTMLElement>('.uuid-parse-item-head')
  const body = fragment.querySelector<HTMLElement>('.uuid-parse-item-body')
  if (!element || !head || !body) return fragment

  const details = row.details
  const setHead = (selector: string, value: string) => {
    const target = head.querySelector<HTMLElement>(selector)
    if (target) target.textContent = value
  }

  setHead('.uuid-parse-item-index', String(row.index))
  setHead('.uuid-parse-item-value', details ? details.value : row.input)
  setHead('.uuid-parse-item-meta', details ? `${details.versionLabel} · ${kindLabels[details.kind]}` : '无法解析')
  setHead('.uuid-parse-item-state', details ? shortTimestamp(details.timestamp) : (row.error ?? ''))

  const fields = body.querySelector<HTMLElement>('.uuid-parse-item-fields')
  if (details) {
    fields?.replaceChildren(...detailRows(details).map(createRow))
    const copyButton = body.querySelector<HTMLButtonElement>('.uuid-parse-item-copy')
    if (copyButton) {
      copyButton.disabled = false
      copyButton.addEventListener('click', () => void copyText(details.value, '该 UUID 已复制到剪贴板'))
    }
    return fragment
  }

  element.dataset.invalid = 'true'
  body.querySelector('.uuid-parse-item-actions')?.remove()
  const note = document.createElement('p')
  note.className = 'uuid-parse-item-note'
  note.textContent = row.error ?? '该项不是合法 UUID'
  fields?.replaceChildren(note)
  return fragment
}

function init() {
  const root = document.querySelector<HTMLElement>('.uuid-parser-workspace')
  if (!root || mountedRoots.has(root)) return
  mountedRoots.add(root)

  const input = root?.querySelector<HTMLTextAreaElement>('#uuid-parse-input')
  const runButton = root?.querySelector<HTMLButtonElement>('#uuid-parse-run')
  const clearButton = root?.querySelector<HTMLButtonElement>('#uuid-parse-clear')
  const errorBox = root?.querySelector<HTMLElement>('#uuid-parse-error')
  const resultCard = root?.querySelector<HTMLElement>('#uuid-parse-result')
  const resultStatus = root?.querySelector<HTMLElement>('#uuid-parse-status')
  const itemTemplate = root?.querySelector<HTMLTemplateElement>('#uuid-parse-item-template')
  const itemContainer = root?.querySelector<HTMLElement>('#uuid-parse-items')

  function resetResult() {
    toggleHidden(resultCard, true)
    itemContainer?.replaceChildren()
    if (itemContainer) itemContainer.dataset.empty = 'true'
    if (resultStatus) resultStatus.textContent = '等待解析'
    setStat(root, 'uuid-parse-stat-total', '—')
    setStat(root, 'uuid-parse-stat-valid', '—')
    setStat(root, 'uuid-parse-stat-invalid', '—')
    setStat(root, 'uuid-parse-stat-versions', '—')
  }

  function run() {
    clearError(errorBox)
    const value = input?.value.trim() ?? ''
    if (!value) {
      resetResult()
      showError(errorBox, '请输入需要解析的 UUID')
      return
    }

    const report = parseUuidList(value)
    if (report.rows.length === 0) {
      resetResult()
      showError(errorBox, '请输入需要解析的 UUID')
      return
    }

    if (report.invalid > 0) {
      showError(errorBox, `有 ${report.invalid} 项无法解析，已在下方明细中标注`)
    }

    toggleHidden(resultCard, false)
    if (resultStatus) resultStatus.textContent = `已解析 ${report.rows.length} 项`
    setStat(root, 'uuid-parse-stat-total', formatNumber(report.rows.length))
    setStat(root, 'uuid-parse-stat-valid', formatNumber(report.valid))
    setStat(root, 'uuid-parse-stat-invalid', formatNumber(report.invalid))

    const versions = [...new Set(report.rows.map((row) => row.details?.versionLabel ?? '无效'))].sort()
    setStat(root, 'uuid-parse-stat-versions', versions.join(' · '))

    if (itemContainer && itemTemplate) {
      const nodes: Node[] = report.rows.slice(0, MAX_ROWS).map((row) => createItem(itemTemplate, row))
      if (report.rows.length > MAX_ROWS) {
        const notice = document.createElement('p')
        notice.className = 'uuid-parse-item-notice'
        notice.textContent = `仅显示前 ${MAX_ROWS} 项，其余 ${formatNumber(report.rows.length - MAX_ROWS)} 项未列出`
        nodes.push(notice)
      }
      itemContainer.replaceChildren(...nodes)
      itemContainer.dataset.empty = 'false'
    }
    recordToolUsage('uuid-parser')
  }

  runButton?.addEventListener('click', run)
  clearButton?.addEventListener('click', () => {
    if (input) input.value = ''
    clearError(errorBox)
    resetResult()
  })
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
