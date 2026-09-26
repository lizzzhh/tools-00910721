import {
  createUuids,
  isUuidVersion,
  uuidNamespaces,
  uuidVersionMap,
  type DceDomain,
  type UuidCasing,
  type UuidForm
} from '../lib/uuid'
import { recordToolUsage } from './usage'
import { clearError, copyText, downloadText, formatNumber, setStat, setValue, showError, toggleHidden } from './tool-panel'

const mountedRoots = new WeakSet<HTMLElement>()

function init() {
  const root = document.querySelector<HTMLElement>('.uuid-workspace')
  if (!root || mountedRoots.has(root)) return
  mountedRoots.add(root)

  const countInput = root.querySelector<HTMLInputElement>('#uuid-count')
  const prefixInput = root.querySelector<HTMLInputElement>('#uuid-prefix')
  const nameInput = root.querySelector<HTMLInputElement>('#uuid-name')
  const namespaceHexInput = root.querySelector<HTMLInputElement>('#uuid-namespace-hex')
  const namespaceField = root.querySelector<HTMLElement>('#uuid-namespace-field')
  const nameSection = root.querySelector<HTMLElement>('#uuid-name-section')
  const domainSection = root.querySelector<HTMLElement>('#uuid-domain-section')
  const runButton = root.querySelector<HTMLButtonElement>('#uuid-run')
  const clearButton = root.querySelector<HTMLButtonElement>('#uuid-clear')
  const errorBox = root?.querySelector<HTMLElement>('#uuid-error')
  const resultCard = root?.querySelector<HTMLElement>('#uuid-result')
  const resultStatus = root?.querySelector<HTMLElement>('#uuid-result-status')
  const output = root?.querySelector<HTMLTextAreaElement>('#uuid-output')
  const copyButton = root?.querySelector<HTMLButtonElement>('#uuid-copy')
  const downloadButton = root?.querySelector<HTMLButtonElement>('#uuid-download')
  let processed = ''

  function readVersion() {
    const raw = Number(root?.querySelector<HTMLInputElement>('#uuid-version')?.value ?? '4')
    return isUuidVersion(raw) ? raw : 4
  }

  function readNamespace() {
    const id = root?.querySelector<HTMLInputElement>('#uuid-namespace')?.value ?? 'dns'
    if (id !== 'custom') return uuidNamespaces.find((item) => item.id === id)?.hex ?? ''
    return namespaceHexInput?.value.trim() ?? ''
  }

  function syncSections() {
    const version = readVersion()
    toggleHidden(nameSection, version !== 3 && version !== 5)
    toggleHidden(domainSection, version !== 2)
  }

  function resetResult() {
    processed = ''
    toggleHidden(resultCard, true)
    setValue(output, '')
    if (resultStatus) resultStatus.textContent = '等待生成'
    if (copyButton) copyButton.disabled = true
    if (downloadButton) downloadButton.disabled = true
    setStat(root, 'uuid-stat-count', '—')
    setStat(root, 'uuid-stat-version', '—')
    setStat(root, 'uuid-stat-kind', '—')
    setStat(root, 'uuid-stat-length', '—')
  }

  function run() {
    clearError(errorBox)
    const version = readVersion()
    const format = (root?.querySelector<HTMLInputElement>('#uuid-format')?.value ?? 'standard') as UuidForm
    const casing = (root?.querySelector<HTMLInputElement>('#uuid-case')?.value ?? 'lower') as UuidCasing
    const result = createUuids({
      version,
      count: Number(countInput?.value ?? 5),
      casing,
      form: format,
      prefix: prefixInput?.value ?? '',
      namespace: readNamespace(),
      name: nameInput?.value ?? '',
      domain: Number(root?.querySelector<HTMLInputElement>('#uuid-domain')?.value ?? '0') as DceDomain
    })

    if (!result.ok) {
      resetResult()
      showError(errorBox, result.message)
      return
    }

    processed = result.output
    setValue(output, result.output)
    toggleHidden(resultCard, false)
    if (resultStatus) resultStatus.textContent = `已生成 ${result.values.length} 个`
    if (copyButton) copyButton.disabled = false
    if (downloadButton) downloadButton.disabled = false
    setStat(root, 'uuid-stat-count', formatNumber(result.values.length))
    setStat(root, 'uuid-stat-version', `v${result.version}`)
    setStat(root, 'uuid-stat-kind', uuidVersionMap[result.version].kindLabel)
    setStat(root, 'uuid-stat-length', formatNumber(result.output.length))
    recordToolUsage('uuid-generator')
  }

  root?.querySelector('#uuid-version')?.addEventListener('change', () => {
    syncSections()
    resetResult()
  })
  root?.querySelector('#uuid-namespace')?.addEventListener('change', () => {
    toggleHidden(namespaceField, root?.querySelector<HTMLInputElement>('#uuid-namespace')?.value !== 'custom')
    resetResult()
  })
  root?.querySelectorAll<HTMLInputElement>('.tool-options input, .tool-field input').forEach((control) => {
    if (control.id === 'uuid-version' || control.id === 'uuid-namespace') return
    control.addEventListener('change', resetResult)
  })
  runButton?.addEventListener('click', run)
  clearButton?.addEventListener('click', () => {
    if (countInput) countInput.value = '5'
    if (prefixInput) prefixInput.value = ''
    if (nameInput) nameInput.value = ''
    if (namespaceHexInput) namespaceHexInput.value = ''
    clearError(errorBox)
    resetResult()
  })
  copyButton?.addEventListener('click', () => void copyText(processed))
  downloadButton?.addEventListener('click', () => downloadText(processed, 'uuid-list.txt'))
  root?.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      run()
    }
  })

  syncSections()
  resetResult()
}

document.addEventListener('astro:page-load', init)
init()
