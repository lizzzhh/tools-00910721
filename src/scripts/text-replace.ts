import { replaceText } from '../lib/text-lines'
import { currentTranslator } from '../i18n/client'
import { recordToolUsage } from './usage'
import { clearError, copyText, downloadText, formatNumber, setStat, setValue, showError, toggleHidden } from './tool-panel'

const sampleText = `function getUserName(user) {
  return user.name || 'guest'
}

const GET_USER_NAME = getUserName`
const sampleFind = 'getUserName'
const sampleTo = 'readUserName'

const mountedRoots = new WeakSet<HTMLElement>()

function renderGroups(container: HTMLElement, groups: string[]) {
  container.replaceChildren(
    ...groups.map((group, index) => {
      const element = document.createElement('div')
      element.className = 'tool-row'
      const label = document.createElement('span')
      label.textContent = `$${index + 1}`
      const value = document.createElement('span')
      value.textContent = group
      element.append(label, value)
      return element
    })
  )
}

function init() {
  const root = document.querySelector<HTMLElement>('.text-replace-workspace')
  if (!root || mountedRoots.has(root)) return
  mountedRoots.add(root)

  const findInput = root?.querySelector<HTMLInputElement>('#text-replace-find')
  const toInput = root?.querySelector<HTMLInputElement>('#text-replace-to')
  const input = root?.querySelector<HTMLTextAreaElement>('#text-replace-input')
  const charCount = root?.querySelector<HTMLElement>('#text-replace-char-count')
  const runButton = root?.querySelector<HTMLButtonElement>('#text-replace-run')
  const sampleButton = root?.querySelector<HTMLButtonElement>('#text-replace-sample')
  const clearButton = root?.querySelector<HTMLButtonElement>('#text-replace-clear')
  const errorBox = root?.querySelector<HTMLElement>('#text-replace-error')
  const resultCard = root?.querySelector<HTMLElement>('#text-replace-result')
  const resultStatus = root?.querySelector<HTMLElement>('#text-replace-result-status')
  const output = root?.querySelector<HTMLTextAreaElement>('#text-replace-output')
  const copyButton = root?.querySelector<HTMLButtonElement>('#text-replace-copy')
  const downloadButton = root?.querySelector<HTMLButtonElement>('#text-replace-download')
  const groupsWrap = root?.querySelector<HTMLElement>('#text-replace-groups-wrap')
  const groups = root?.querySelector<HTMLElement>('#text-replace-groups')
  let processed = ''

  function resetResult() {
    processed = ''
    toggleHidden(resultCard, true)
    toggleHidden(groupsWrap, true)
    setValue(output, '')
    if (resultStatus) resultStatus.textContent = currentTranslator()('workspace.waiting')
    if (copyButton) copyButton.disabled = true
    if (downloadButton) downloadButton.disabled = true
    setStat(root, 'text-replace-stat-matches', '—')
    setStat(root, 'text-replace-stat-input', '—')
    setStat(root, 'text-replace-stat-output', '—')
    setStat(root, 'text-replace-stat-delta', '—')
    groups?.replaceChildren()
  }

  function run() {
    clearError(errorBox)
    const value = input?.value ?? ''
    const result = replaceText(value, findInput?.value ?? '', toInput?.value ?? '', {
      regex: root?.querySelector<HTMLInputElement>('#text-replace-regex')?.checked ?? false,
      caseSensitive: !(root?.querySelector<HTMLInputElement>('#text-replace-case')?.checked ?? false),
      wholeWord: root?.querySelector<HTMLInputElement>('#text-replace-word')?.checked ?? false
    })

    if (!result.ok) {
      resetResult()
      showError(errorBox, currentTranslator()(`toolUi.text-replace.errors.${result.code}`, result.params))
      return
    }

    processed = result.output
    setValue(output, result.output)
    toggleHidden(resultCard, false)
    const t = currentTranslator()
    if (resultStatus) resultStatus.textContent = result.matches > 0 ? t('toolUi.text-replace.runtime.done') : t('toolUi.text-replace.runtime.noMatch')
    if (copyButton) copyButton.disabled = false
    if (downloadButton) downloadButton.disabled = false
    setStat(root, 'text-replace-stat-matches', formatNumber(result.matches))
    setStat(root, 'text-replace-stat-input', formatNumber(value.length))
    setStat(root, 'text-replace-stat-output', formatNumber(result.output.length))
    const delta = result.output.length - value.length
    setStat(root, 'text-replace-stat-delta', delta > 0 ? `+${delta}` : String(delta))
    if (groups) renderGroups(groups, result.groups)
    toggleHidden(groupsWrap, result.groups.length === 0)
    recordToolUsage('text-replace')
  }

  input?.addEventListener('input', () => {
    if (charCount) charCount.textContent = formatNumber(Array.from(input.value).length)
    clearError(errorBox)
    resetResult()
  })
  findInput?.addEventListener('input', () => {
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
    if (input) input.value = sampleText
    if (findInput) findInput.value = sampleFind
    if (toInput) toInput.value = sampleTo
    if (charCount) charCount.textContent = formatNumber(Array.from(sampleText).length)
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
  downloadButton?.addEventListener('click', () => downloadText(processed, 'text-replaced.txt'))
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
