import { showToast } from './site'

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value)
}

export async function copyText(value: string, successMessage = '结果已复制到剪贴板', fallbackMessage = '当前环境不支持自动复制，请手动选择内容') {
  if (!value) return false
  try {
    if (!navigator.clipboard) throw new Error('clipboard unavailable')
    await navigator.clipboard.writeText(value)
    showToast(successMessage)
    return true
  } catch {
    showToast(fallbackMessage)
    return false
  }
}

export function downloadText(value: string, filename: string) {
  if (!value) return
  const url = URL.createObjectURL(new Blob([value], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  showToast('结果文件已准备下载')
}

export function setText(element: HTMLElement | null | undefined, value: string) {
  if (element) element.textContent = value
}

export function setValue(element: HTMLTextAreaElement | null | undefined, value: string) {
  if (!element) return
  element.value = value
  element.dataset.empty = value.length === 0 ? 'true' : 'false'
}

export function setStat(root: ParentNode | null | undefined, id: string, value: string) {
  setText(root?.querySelector<HTMLElement>(`#${id}`), value)
}

export function setDisabled(element: HTMLButtonElement | null | undefined, disabled: boolean) {
  if (element) element.disabled = disabled
}

export function toggleHidden(element: HTMLElement | null | undefined, hidden: boolean) {
  if (element) element.hidden = hidden
}

export function showError(element: HTMLElement | null | undefined, message: string, position?: number) {
  if (!element) return
  const prefix = position === undefined ? '' : `第 ${position} 个字符：`
  element.textContent = `${prefix}${message}`
  element.hidden = false
}

export function clearError(element: HTMLElement | null | undefined) {
  if (!element) return
  element.textContent = ''
  element.hidden = true
}

export function queryRoot<T extends HTMLElement>(selector: string) {
  return document.querySelector<T>(selector)
}

export function readOption(id: string) {
  return document.querySelector<HTMLInputElement>(`#${id}`)?.value ?? ''
}

export function readCheckbox(id: string) {
  return document.querySelector<HTMLInputElement>(`#${id}`)?.checked ?? false
}

export function readNumber(id: string, fallback: number) {
  const raw = document.querySelector<HTMLInputElement>(`#${id}`)?.value ?? ''
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}
