import { decodeJwt, type JwtDecodeResult, type JsonObject } from '../lib/security/jwt'
import { showToast } from './site'
import { recordToolUsage } from './usage'
import { currentTranslator } from '../i18n/client'

type DecodedJwt = Extract<JwtDecodeResult, { ok: true }>

const mountedRoots = new WeakSet<HTMLElement>()

function init() {
  const workspace = document.querySelector<HTMLElement>('.security-workspace')
  if (!workspace || mountedRoots.has(workspace)) return
  mountedRoots.add(workspace)

  const input = document.querySelector<HTMLTextAreaElement>('#jwt-input')
  const charCount = document.querySelector<HTMLElement>('#jwt-char-count')
  const clearButton = document.querySelector<HTMLButtonElement>('#jwt-clear')
  const decodeButton = document.querySelector<HTMLButtonElement>('#jwt-decode')
  const errorBox = document.querySelector<HTMLElement>('#jwt-error')
  const resultCard = document.querySelector<HTMLElement>('#jwt-result')
  const resultStatus = document.querySelector<HTMLElement>('#jwt-result-status')
  const state = document.querySelector<HTMLElement>('#jwt-state')
  const claims = document.querySelector<HTMLElement>('#jwt-claims')
  const headerOutput = document.querySelector<HTMLElement>('#jwt-header')
  const payloadOutput = document.querySelector<HTMLElement>('#jwt-payload')
  const warnings = document.querySelector<HTMLElement>('#jwt-warnings')
  const copyHeaderButton = document.querySelector<HTMLButtonElement>('#jwt-copy-header')
  const copyPayloadButton = document.querySelector<HTMLButtonElement>('#jwt-copy-payload')

  function clearError() {
    if (!errorBox) return
    errorBox.hidden = true
    errorBox.textContent = ''
  }

  function showError(message: string) {
    if (!errorBox) return
    errorBox.textContent = message
    errorBox.hidden = false
  }

  function formatTimestamp(value: number) {
    const date = new Date(value * 1000)
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
  }

  function formatClaim(key: string, value: unknown) {
    if ((key === 'exp' || key === 'iat' || key === 'nbf') && typeof value === 'number') {
      return `${value}（${formatTimestamp(value)}）`
    }
    if (typeof value === 'string') return value
    return JSON.stringify(value)
  }

  function setState(result: DecodedJwt) {
    if (!state) return
    state.dataset.level = result.status
    const t = currentTranslator()
    state.textContent = result.kind === 'jwe'
      ? t('toolUi.jwt-decode.runtime.stateEncrypted')
      : result.status === 'expired'
        ? t('toolUi.jwt-decode.runtime.stateExpired')
        : result.status === 'not-yet-valid'
          ? t('toolUi.jwt-decode.runtime.stateNotYetValid')
          : result.status === 'unknown-expiry'
            ? t('toolUi.jwt-decode.runtime.stateUnknownExpiry')
            : t('toolUi.jwt-decode.runtime.stateValid')
  }

  function renderClaims(payload: JsonObject | null) {
    if (!claims) return
    claims.replaceChildren()
    if (!payload) {
      const empty = document.createElement('p')
      empty.className = 'security-empty'
      empty.textContent = currentTranslator()('toolUi.jwt-decode.runtime.claimsEncrypted')
      claims.append(empty)
      return
    }
    const t = currentTranslator()
    const definitions: [string, string][] = [
      ['iss', t('toolUi.jwt-decode.runtime.claimIss')],
      ['sub', t('toolUi.jwt-decode.runtime.claimSub')],
      ['aud', t('toolUi.jwt-decode.runtime.claimAud')],
      ['iat', t('toolUi.jwt-decode.runtime.claimIat')],
      ['nbf', t('toolUi.jwt-decode.runtime.claimNbf')],
      ['exp', t('toolUi.jwt-decode.runtime.claimExp')]
    ]
    const available = definitions.filter(([key]) => payload[key] !== undefined)
    if (!available.length) {
      const empty = document.createElement('p')
      empty.className = 'security-empty'
      empty.textContent = currentTranslator()('toolUi.jwt-decode.runtime.claimsEmpty')
      claims.append(empty)
      return
    }
    available.forEach(([key, label]) => {
      const item = document.createElement('div')
      item.className = 'jwt-claim'
      const name = document.createElement('span')
      name.textContent = label
      const value = document.createElement('code')
      value.textContent = formatClaim(key, payload[key])
      item.append(name, value)
      claims.append(item)
    })
  }

  function renderWarnings(result: DecodedJwt) {
    if (!warnings) return
    warnings.replaceChildren()
    result.warnings.forEach((warning) => {
      const item = document.createElement('li')
      item.textContent = currentTranslator()(`toolUi.jwt-decode.warnings.${warning}`)
      warnings.append(item)
    })
  }

  function renderResult(result: DecodedJwt) {
    if (resultCard) resultCard.hidden = false
    if (resultStatus) resultStatus.textContent = currentTranslator()(result.kind === 'jwe' ? 'toolUi.jwt-decode.runtime.statusJwe' : 'toolUi.jwt-decode.runtime.statusDone')
    setState(result)
    renderClaims(result.payload)
    if (headerOutput) headerOutput.textContent = JSON.stringify(result.header, null, 2)
    if (payloadOutput) payloadOutput.textContent = result.payload ? JSON.stringify(result.payload, null, 2) : currentTranslator()('toolUi.jwt-decode.runtime.payloadEncrypted')
    renderWarnings(result)
    if (copyHeaderButton) copyHeaderButton.disabled = false
    if (copyPayloadButton) copyPayloadButton.disabled = !result.payload
  }

  function resetResult() {
    if (resultCard) resultCard.hidden = true
    if (copyHeaderButton) copyHeaderButton.disabled = true
    if (copyPayloadButton) copyPayloadButton.disabled = true
    clearError()
  }

  function decode() {
    clearError()
    const value = input?.value ?? ''
    const result = decodeJwt(value)
    if (!result.ok) {
      resetResult()
      const t = currentTranslator()
      showError(
        result.params
          ? t(`toolUi.jwt-decode.errors.${result.code}`, { part: t(`toolUi.jwt-decode.runtime.${result.params.part === 'header' ? 'partHeader' : 'partPayload'}`) })
          : t(`toolUi.jwt-decode.errors.${result.code}`)
      )
      return
    }
    renderResult(result)
    recordToolUsage('jwt-decode')
  }

  function clearAll() {
    if (input) input.value = ''
    if (charCount) charCount.textContent = '0'
    resetResult()
    input?.focus()
  }

  async function copyOutput(element: HTMLElement | null, label: string) {
    if (!element?.textContent) return
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(element.textContent)
      showToast(currentTranslator()('toolUi.jwt-decode.runtime.copied', { label }))
    } catch {
      showToast(currentTranslator()('toolUi.jwt-decode.runtime.manualCopy'))
    }
  }

  input?.addEventListener('input', () => {
    if (charCount) charCount.textContent = String(Array.from(input.value).length)
  })
  decodeButton?.addEventListener('click', decode)
  clearButton?.addEventListener('click', clearAll)
  copyHeaderButton?.addEventListener('click', () => void copyOutput(headerOutput, 'Header'))
  copyPayloadButton?.addEventListener('click', () => void copyOutput(payloadOutput, 'Payload'))
  workspace?.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      decode()
    }
  })
}

document.addEventListener('astro:page-load', init)
init()