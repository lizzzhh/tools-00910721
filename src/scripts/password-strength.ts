import { estimatePasswordStrength } from '../lib/security/passwords'
import { currentTranslator } from '../i18n/client'
import { recordToolUsage } from './usage'

const mountedRoots = new WeakSet<HTMLElement>()

function init() {
  const root = document.querySelector<HTMLElement>('.security-workspace')
  if (!root || mountedRoots.has(root)) return
  mountedRoots.add(root)

  const input = document.querySelector<HTMLInputElement>('#password-strength-input')
  const realtime = document.querySelector<HTMLInputElement>('#password-strength-realtime')
  const showPassword = document.querySelector<HTMLInputElement>('#password-strength-show')
  const evaluateButton = document.querySelector<HTMLButtonElement>('#password-strength-evaluate')
  const clearButton = document.querySelector<HTMLButtonElement>('#password-strength-clear')
  const result = document.querySelector<HTMLElement>('#strength-result')
  const status = document.querySelector<HTMLElement>('#password-strength-status')
  const score = document.querySelector<HTMLElement>('#strength-score')
  const label = document.querySelector<HTMLElement>('#strength-label')
  const bar = document.querySelector<HTMLElement>('#strength-bar')
  const entropy = document.querySelector<HTMLElement>('#strength-entropy')
  const metrics = document.querySelector<HTMLElement>('#strength-metrics')
  const length = document.querySelector<HTMLElement>('#strength-length')
  const classes = document.querySelector<HTMLElement>('#strength-classes')
  const unique = document.querySelector<HTMLElement>('#strength-unique')
  const messages = document.querySelector<HTMLElement>('#strength-messages')
  const suggestions = document.querySelector<HTMLElement>('#strength-suggestions')

  function fillList(element: HTMLElement | null, values: string[]) {
    if (!element) return
    element.replaceChildren()
    if (!values.length) {
      const item = document.createElement('li')
      item.className = 'security-empty'
      item.textContent = currentTranslator()('toolUi.password-strength.runtime.none')
      element.append(item)
      return
    }
    values.forEach((value) => {
      const item = document.createElement('li')
      item.textContent = value
      element.append(item)
    })
  }

  function render(password: string) {
    const value = estimatePasswordStrength(password)
    if (result) result.dataset.level = value.level
    if (status) status.textContent = currentTranslator()(password ? 'toolUi.password-strength.runtime.done' : 'workspace.waitingInput')
    if (score) score.textContent = password ? String(value.score) : '—'
    if (label) label.textContent = currentTranslator()(`toolUi.password-strength.levels.${value.level}`)
    if (bar) {
      bar.style.width = password ? `${value.score}%` : '0%'
      bar.dataset.level = value.level
    }
    if (entropy) entropy.textContent = currentTranslator()(password ? 'toolUi.password-strength.runtime.entropy' : 'toolUi.password-strength.runtime.entropyHint', { bits: value.entropy, pool: value.poolSize })
    if (metrics) metrics.hidden = !password
    if (length) length.textContent = String(value.length)
    if (classes) classes.textContent = String(value.poolSize ? [/[a-z]/, /[A-Z]/, /[0-9]/].filter((pattern) => pattern.test(password)).length + ([...password].some((character) => !/[A-Za-z0-9\s]/.test(character)) ? 1 : 0) : 0)
    if (unique) unique.textContent = String(value.uniqueCharacters)
    fillList(messages, value.notes.map((note) => currentTranslator()(`toolUi.password-strength.notes.${note.code}`, note.params)))
    fillList(suggestions, value.advice.map((note) => currentTranslator()(`toolUi.password-strength.notes.${note.code}`, note.params)))
  }

  function evaluate(record = false) {
    const password = input?.value ?? ''
    render(password)
    if (record && password) recordToolUsage('password-strength')
  }

  function clearAll() {
    if (input) input.value = ''
    if (showPassword) showPassword.checked = false
    if (input) input.type = 'password'
    render('')
    input?.focus()
  }

  input?.addEventListener('input', () => {
    if (realtime?.checked) evaluate()
  })
  showPassword?.addEventListener('change', () => {
    if (input) input.type = showPassword.checked ? 'text' : 'password'
  })
  evaluateButton?.addEventListener('click', () => evaluate(true))
  clearButton?.addEventListener('click', clearAll)
  input?.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      evaluate(true)
    }
  })

  render('')
}

document.addEventListener('astro:page-load', init)
init()