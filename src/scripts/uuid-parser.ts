import { parseUuidList, type UuidDetails, type UuidParsedRow } from '../lib/uuid'
import { recordToolUsage } from './usage'
import { currentTranslator } from '../i18n/client'
import { clearError, copyText, formatNumber, setStat, showError, toggleHidden } from './tool-panel'

const mountedRoots = new WeakSet<HTMLElement>()
const MAX_ROWS = 200

function kindLabel(kind: UuidDetails['kind']) {
  return currentTranslator()(`uuidUi.kinds.${kind}`)
}

function versionLabel(details: UuidDetails) {
  const t = currentTranslator()
  if (details.versionLabelId === 'unknown') return t('uuidUi.forms.unknown', { hex: details.unknownVersion ?? '' })
  if (details.versionLabelId === 'nil') return t('uuidUi.forms.nil')
  if (details.versionLabelId === 'max') return t('uuidUi.forms.max')
  return `v${details.version}`
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
  const t = currentTranslator()
  const rows: string[][] = [
    [t('toolUi.uuid-parser.rows.canonical'), details.value],
    [t('toolUi.uuid-parser.rows.compact'), details.compact],
    [t('toolUi.uuid-parser.rows.version'), versionLabel(details)],
    [t('toolUi.uuid-parser.rows.variant'), details.variant],
    [t('toolUi.uuid-parser.rows.kind'), kindLabel(details.kind)]
  ]

  if (details.form !== 'standard') {
    rows.push([
      t('toolUi.uuid-parser.rows.specialForm'),
      t(details.form === 'nil' ? 'toolUi.uuid-parser.forms.nilZero' : 'toolUi.uuid-parser.forms.maxOnes')
    ])
  }
  if (details.timestamp) rows.push([t('toolUi.uuid-parser.rows.timestamp'), `${details.timestamp}（Unix ${details.timestampMs} ms）`])
  if (details.clockSequence) rows.push([t('toolUi.uuid-parser.rows.clockSequence'), details.clockSequence])
  if (details.dceDomain !== null) rows.push([t('toolUi.uuid-parser.rows.dceDomain'), `0x${details.dceDomain.toString(16).padStart(2, '0')}`])
  if (details.node) {
    rows.push([
      t('toolUi.uuid-parser.rows.node'),
      `${details.node}${details.multicast ? t('toolUi.uuid-parser.suffixes.nodeMulticast') : ''}`
    ])
  }
  if (details.randomTail) rows.push([t('toolUi.uuid-parser.rows.randomTail'), details.randomTail])
  if (details.entropy) rows.push([t('toolUi.uuid-parser.rows.entropy'), `${details.entropy}${t('toolUi.uuid-parser.suffixes.entropyBits')}`])

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
  setHead(
    '.uuid-parse-item-meta',
    details
      ? `${versionLabel(details)} · ${kindLabel(details.kind)}`
      : currentTranslator()('toolUi.uuid-parser.messages.unparsable')
  )
  setHead('.uuid-parse-item-state', details ? shortTimestamp(details.timestamp) : (row.error ?? ''))

  const fields = body.querySelector<HTMLElement>('.uuid-parse-item-fields')
  if (details) {
    fields?.replaceChildren(...detailRows(details).map(createRow))
    const copyButton = body.querySelector<HTMLButtonElement>('.uuid-parse-item-copy')
    if (copyButton) {
      copyButton.disabled = false
      copyButton.addEventListener('click', () =>
        void copyText(details.value, currentTranslator()('toolUi.uuid-parser.messages.copied'))
      )
    }
    return fragment
  }

  element.dataset.invalid = 'true'
  body.querySelector('.uuid-parse-item-actions')?.remove()
  const note = document.createElement('p')
  note.className = 'uuid-parse-item-note'
  note.textContent = row.error ?? currentTranslator()('toolUi.uuid-parser.messages.invalidItem')
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
    if (resultStatus) resultStatus.textContent = currentTranslator()('toolUi.uuid-parser.messages.waiting')
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
      showError(errorBox, currentTranslator()('toolUi.uuid-parser.messages.emptyInput'))
      return
    }

    const report = parseUuidList(value)
    if (report.rows.length === 0) {
      resetResult()
      showError(errorBox, '请输入需要解析的 UUID')
      return
    }

    if (report.invalid > 0) {
      showError(errorBox, currentTranslator()('toolUi.uuid-parser.messages.invalidNotice', { count: formatNumber(report.invalid) }))
    }

    toggleHidden(resultCard, false)
    if (resultStatus) {
      resultStatus.textContent = currentTranslator()('toolUi.uuid-parser.messages.parsedStatus', { count: formatNumber(report.rows.length) })
    }
    setStat(root, 'uuid-parse-stat-total', formatNumber(report.rows.length))
    setStat(root, 'uuid-parse-stat-valid', formatNumber(report.valid))
    setStat(root, 'uuid-parse-stat-invalid', formatNumber(report.invalid))

    const t = currentTranslator()
    const versions = [
      ...new Set(
        report.rows.map((row) => (row.details ? versionLabel(row.details) : t('toolUi.uuid-parser.messages.invalidShort')))
      )
    ].sort()
    setStat(root, 'uuid-parse-stat-versions', versions.join(' · '))

    if (itemContainer && itemTemplate) {
      const nodes: Node[] = report.rows.slice(0, MAX_ROWS).map((row) => createItem(itemTemplate, row))
      if (report.rows.length > MAX_ROWS) {
        const notice = document.createElement('p')
        notice.className = 'uuid-parse-item-notice'
        notice.textContent = currentTranslator()('toolUi.uuid-parser.messages.truncated', {
        shown: formatNumber(MAX_ROWS),
        rest: formatNumber(report.rows.length - MAX_ROWS)
      })
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
