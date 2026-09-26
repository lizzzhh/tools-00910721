import { defaultPasswordOptions, estimatePasswordStrength, generatePassword, type PasswordOptions } from '../lib/security/passwords'
import { currentTranslator } from '../i18n/client'
import { showToast } from './site'
import { recordToolUsage } from './usage'

const mountedRoots = new WeakSet<HTMLElement>()

function init() {
  const root = document.querySelector<HTMLElement>('.security-workspace')
  if (!root || mountedRoots.has(root)) return
  mountedRoots.add(root)

  const workspace = document.querySelector<HTMLElement>('.security-workspace')
  const lengthRange = document.querySelector<HTMLInputElement>('#password-length')
  const lengthNumber = document.querySelector<HTMLInputElement>('#password-length-number')
  const lengthValue = document.querySelector<HTMLOutputElement>('#password-length-value')
  const lowercase = document.querySelector<HTMLInputElement>('#password-lowercase')
  const uppercase = document.querySelector<HTMLInputElement>('#password-uppercase')
  const numbers = document.querySelector<HTMLInputElement>('#password-numbers')
  const symbols = document.querySelector<HTMLInputElement>('#password-symbols')
  const generateButton = document.querySelector<HTMLButtonElement>('#password-generate')
  const clearButton = document.querySelector<HTMLButtonElement>('#password-clear')
  const errorBox = document.querySelector<HTMLElement>('#password-generator-error')
  const output = document.querySelector<HTMLElement>('#password-output')
  const outputValue = document.querySelector<HTMLElement>('#password-value')
  const copyButton = document.querySelector<HTMLButtonElement>('#password-copy')
  const status = document.querySelector<HTMLElement>('#password-status')
  const strengthLabel = document.querySelector<HTMLElement>('#password-strength-label')
  const strengthScore = document.querySelector<HTMLElement>('#password-strength-score')
  const strengthBar = document.querySelector<HTMLElement>('#password-strength-bar')
  const strengthDetail = document.querySelector<HTMLElement>('#password-strength-detail')
  let generatedPassword = ''

  function normalizeLength(value: number) {
    return Math.max(8, Math.min(64, Number.isFinite(value) ? Math.round(value) : 20))
  }

  function getLength() {
    return normalizeLength(Number(lengthNumber?.value ?? lengthRange?.value ?? 20))
  }

  function syncLength(source: HTMLInputElement) {
    const length = normalizeLength(Number(source.value))
    if (lengthRange) lengthRange.value = String(length)
    if (lengthNumber) lengthNumber.value = String(length)
    if (lengthValue) lengthValue.textContent = currentTranslator()('toolUi.password-generator.runtime.lengthUnit', { count: length })
  }

  function getOptions(): PasswordOptions {
    return {
      lowercase: lowercase?.checked ?? defaultPasswordOptions.lowercase,
      uppercase: uppercase?.checked ?? defaultPasswordOptions.uppercase,
      numbers: numbers?.checked ?? defaultPasswordOptions.numbers,
      symbols: symbols?.checked ?? defaultPasswordOptions.symbols
    }
  }

  function showError(message: string) {
    if (!errorBox) return
    errorBox.textContent = message
    errorBox.hidden = false
  }

  function clearError() {
    if (!errorBox) return
    errorBox.hidden = true
    errorBox.textContent = ''
  }

  function resetResult() {
    generatedPassword = ''
    if (outputValue) outputValue.textContent = currentTranslator()('toolUi.password-generator.runtime.placeholder')
    output?.setAttribute('data-empty', 'true')
    if (copyButton) copyButton.disabled = true
    const t = currentTranslator()
    if (status) status.textContent = t('toolUi.password-generator.runtime.waiting')
    if (strengthLabel) strengthLabel.textContent = t('toolUi.password-generator.runtime.strengthWaiting')
    if (strengthScore) strengthScore.textContent = '—'
    if (strengthBar) strengthBar.style.width = '0%'
    if (strengthDetail) strengthDetail.textContent = t('toolUi.password-generator.runtime.strengthHint')
  }

  function renderStrength(password: string) {
    const result = estimatePasswordStrength(password)
    if (strengthLabel) {
      strengthLabel.textContent = result.label
      strengthLabel.dataset.level = result.level
    }
    if (strengthScore) strengthScore.textContent = `${result.score} / 100`
    if (strengthBar) {
      strengthBar.style.width = `${result.score}%`
      strengthBar.dataset.level = result.level
    }
    if (strengthDetail) strengthDetail.textContent = currentTranslator()('toolUi.password-generator.runtime.entropy', { bits: result.entropy, pool: result.poolSize })
  }

  function generate() {
    clearError()
    try {
      const password = generatePassword(getLength(), getOptions())
      generatedPassword = password
      if (outputValue) outputValue.textContent = password
      output?.setAttribute('data-empty', 'false')
      if (copyButton) copyButton.disabled = false
      if (status) status.textContent = currentTranslator()('toolUi.password-generator.runtime.done')
      renderStrength(password)
      recordToolUsage('password-generator')
    } catch (error) {
      resetResult()
      showError(error instanceof Error ? error.message : currentTranslator()('toolUi.password-generator.runtime.failed'))
    }
  }

  async function copyPassword() {
    if (!generatedPassword) return
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(generatedPassword)
      showToast(currentTranslator()('toolUi.password-generator.runtime.copied'))
    } catch {
      showToast(currentTranslator()('toolUi.password-generator.runtime.manualCopy'))
    }
  }

  function resetOptions() {
    if (lengthRange) lengthRange.value = '20'
    if (lengthNumber) lengthNumber.value = '20'
    if (lowercase) lowercase.checked = defaultPasswordOptions.lowercase
    if (uppercase) uppercase.checked = defaultPasswordOptions.uppercase
    if (numbers) numbers.checked = defaultPasswordOptions.numbers
    if (symbols) symbols.checked = defaultPasswordOptions.symbols
    if (lengthValue) lengthValue.textContent = currentTranslator()('toolUi.password-generator.runtime.lengthUnit', { count: 20 })
    resetResult()
    clearError()
  }

  lengthRange?.addEventListener('input', () => syncLength(lengthRange))
  lengthNumber?.addEventListener('change', () => syncLength(lengthNumber))
  generateButton?.addEventListener('click', generate)
  clearButton?.addEventListener('click', resetOptions)
  copyButton?.addEventListener('click', () => void copyPassword())
  workspace?.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      generate()
    }
  })

  syncLength(lengthRange!)
  resetResult()
}

document.addEventListener('astro:page-load', init)
init()