import { decodeJwt, type JwtDecodeResult, type JsonObject } from '../lib/security/jwt'
import { showToast } from './site'
import { recordToolUsage } from './usage'

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
    state.textContent = result.kind === 'jwe'
      ? '加密令牌：仅能读取 Header'
      : result.status === 'expired'
        ? '令牌已过期'
        : result.status === 'not-yet-valid'
          ? '令牌尚未生效'
          : result.status === 'unknown-expiry'
            ? '未提供过期时间声明'
            : '令牌当前未过期'
  }

  function renderClaims(payload: JsonObject | null) {
    if (!claims) return
    claims.replaceChildren()
    if (!payload) {
      const empty = document.createElement('p')
      empty.className = 'security-empty'
      empty.textContent = 'JWE 载荷已加密，无法直接读取。'
      claims.append(empty)
      return
    }
    const definitions: [string, string][] = [
      ['iss', '签发者'],
      ['sub', '主题'],
      ['aud', '受众'],
      ['iat', '签发时间'],
      ['nbf', '生效时间'],
      ['exp', '过期时间']
    ]
    const available = definitions.filter(([key]) => payload[key] !== undefined)
    if (!available.length) {
      const empty = document.createElement('p')
      empty.className = 'security-empty'
      empty.textContent = '载荷中没有常见时间或身份声明。'
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
      item.textContent = warning
      warnings.append(item)
    })
  }

  function renderResult(result: DecodedJwt) {
    if (resultCard) resultCard.hidden = false
    if (resultStatus) resultStatus.textContent = result.kind === 'jwe' ? 'JWE 已解析' : '解析完成'
    setState(result)
    renderClaims(result.payload)
    if (headerOutput) headerOutput.textContent = JSON.stringify(result.header, null, 2)
    if (payloadOutput) payloadOutput.textContent = result.payload ? JSON.stringify(result.payload, null, 2) : '载荷已加密，无法直接读取。'
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
      showError(result.error)
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
      showToast(`${label}已复制`)
    } catch {
      showToast('当前环境不支持自动复制，请手动选择内容')
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