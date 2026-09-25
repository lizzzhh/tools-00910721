import CryptoJS from 'crypto-js'
import { createMD5 } from 'hash-wasm'
import { showToast } from './site'
import { recordToolUsage } from './usage'

type InputMode = 'text' | 'file'

const input = document.querySelector<HTMLTextAreaElement>('#md5-input')
const textareaWrap = document.querySelector<HTMLElement>('.textarea-wrap')
const charCount = document.querySelector<HTMLElement>('#char-count')
const realtimeToggle = document.querySelector<HTMLInputElement>('#realtime-toggle')
const resultCase = document.querySelector<HTMLInputElement>('#result-case')
const textClear = document.querySelector<HTMLButtonElement>('#text-clear')
const calculateButton = document.querySelector<HTMLButtonElement>('#calculate')
const clearButton = document.querySelector<HTMLButtonElement>('#clear')
const cancelCalculate = document.querySelector<HTMLButtonElement>('#cancel-calculate')
const output = document.querySelector<HTMLElement>('#hash-output')
const outputCode = output?.querySelector('code')
const copyButton = document.querySelector<HTMLButtonElement>('#copy-result')
const status = document.querySelector<HTMLElement>('#result-status')
const detail = document.querySelector<HTMLElement>('#result-detail')
const fileInput = document.querySelector<HTMLInputElement>('#file-input')
const dropZone = document.querySelector<HTMLElement>('#drop-zone')
const dropTitle = document.querySelector<HTMLElement>('#drop-title')
const dropMeta = document.querySelector<HTMLElement>('#drop-meta')
const fileProgress = document.querySelector<HTMLElement>('#file-progress')
const fileProgressLabel = document.querySelector<HTMLElement>('#file-progress-label')
const fileProgressPercent = document.querySelector<HTMLElement>('#file-progress-percent')
const fileProgressBar = document.querySelector<HTMLElement>('#file-progress-bar')
const fileProgressDetail = document.querySelector<HTMLElement>('#file-progress-detail')
const workspace = document.querySelector<HTMLElement>('.tool-workspace')
const inputMode = document.querySelector<HTMLElement>('.input-mode')
const modeButtons = Array.from(inputMode?.querySelectorAll<HTMLButtonElement>('[data-mode]') ?? [])
const modePanels = Array.from(workspace?.querySelectorAll<HTMLElement>('[data-panel]') ?? [])
const emptyHash = 'D41D8CD98F00B204E9800998ECF8427E'
const largeFileThreshold = 10 * 1024 ** 2
let mode: InputMode = 'text'
let selectedFile: File | undefined
let result = ''
let liveFrame = 0
let outputCase: 'lower' | 'upper' = 'upper'
let calculationRun = 0
let activeReader: ReadableStreamDefaultReader<Uint8Array> | undefined
let isCalculating = false

function setCalculating(value: boolean) {
  isCalculating = value
  workspace?.classList.toggle('is-calculating', value)
  workspace?.setAttribute('aria-busy', String(value))
}

function updateClearHover(event: MouseEvent) {
  if (!input || isCalculating) return
  const bounds = input.getBoundingClientRect()
  const inClearZone = event.clientX >= bounds.right - 64 && event.clientY <= bounds.top + 48
  textareaWrap?.classList.toggle('is-clear-visible', inClearZone)
}

function formatResult(hash: string) {
  return outputCase === 'upper' ? hash.toUpperCase() : hash.toLowerCase()
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function updateFileProgress(loaded: number, total: number) {
  const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 100
  if (fileProgress) fileProgress.hidden = false
  if (fileProgressPercent) fileProgressPercent.textContent = `${percent}%`
  if (fileProgressBar) fileProgressBar.style.width = `${percent}%`
  if (fileProgressDetail) fileProgressDetail.textContent = `${formatBytes(loaded)} / ${formatBytes(total)}`
}

function resetFileProgress() {
  if (fileProgress) fileProgress.hidden = false
  if (fileProgressLabel) fileProgressLabel.textContent = '准备计算'
  if (fileProgressPercent) fileProgressPercent.textContent = '0%'
  if (fileProgressBar) fileProgressBar.style.width = '0%'
  if (fileProgressDetail) fileProgressDetail.textContent = '0 B / 0 B'
}

async function calculateFileHash(file: File, runId: number) {
  if (fileProgressLabel) fileProgressLabel.textContent = '正在读取文件'
  updateFileProgress(0, file.size)
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
  const hasher = await createMD5()
  if (runId !== calculationRun) return undefined
  hasher.init()
  const reader = file.stream().getReader()
  activeReader = reader
  let loaded = 0
  let chunkCount = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (runId !== calculationRun) return undefined
      if (done) break
      hasher.update(value)
      loaded += value.byteLength
      chunkCount += 1
      updateFileProgress(loaded, file.size)
      if (chunkCount % 4 === 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    }
    if (fileProgressLabel) fileProgressLabel.textContent = '计算完成'
    return hasher.digest('hex')
  } finally {
    if (activeReader === reader) activeReader = undefined
  }
}

function stopCalculation() {
  setCalculating(false)
  calculationRun += 1
  void activeReader?.cancel()
  activeReader = undefined
  if (cancelCalculate) cancelCalculate.hidden = true
  if (calculateButton) calculateButton.disabled = false
  if (mode === 'file' && status) status.textContent = '已停止'
  if (mode === 'file' && fileProgressLabel) fileProgressLabel.textContent = '已停止'
}

function setMode(nextMode: InputMode) {
  if (mode === nextMode) return
  if (isCalculating) stopCalculation()
  mode = nextMode
  workspace?.setAttribute('data-mode', mode)
  modeButtons.forEach((button) => {
    const active = button.dataset.mode === mode
    button.classList.toggle('active', active)
    button.setAttribute('aria-selected', String(active))
  })
  modePanels.forEach((panel) => {
    const active = panel.dataset.panel === mode
    panel.classList.toggle('active', active)
    panel.hidden = !active
  })
  resetResult()
  if (mode === 'text') {
    if (realtimeToggle?.checked) calculateTextLive()
    return
  }
  resetFileProgress()
  if (status) status.textContent = selectedFile ? '等待计算' : '等待选择文件'
  if (detail) detail.textContent = selectedFile ? `已选择：${selectedFile.name}` : '选择文件后计算文件摘要'
}

function calculateTextLive() {
  if (isCalculating) return
  window.cancelAnimationFrame(liveFrame)
  liveFrame = window.requestAnimationFrame(() => {
    const value = input?.value ?? ''
    const bytes = new TextEncoder().encode(value).byteLength
    showResult(CryptoJS.MD5(value).toString(), value ? `实时计算 · ${bytes} 字节` : '实时计算 · 空字符串', !value)
  })
}

function resetResult() {
  result = ''
  if (outputCode) outputCode.textContent = emptyHash
  output?.setAttribute('data-empty', 'true')
  if (copyButton) copyButton.disabled = true
  if (status) status.textContent = '等待输入'
  if (detail) detail.textContent = '结果将以 32 位十六进制字符串显示'
}

function showResult(hash: string, source: string, muted = false) {
  result = hash
  if (outputCode) outputCode.textContent = formatResult(hash)
  output?.setAttribute('data-empty', String(muted))
  if (copyButton) copyButton.disabled = false
  if (status) status.textContent = '计算完成'
  if (detail) detail.textContent = source
}

async function calculate() {
  if (!calculateButton || isCalculating) return
  const runId = ++calculationRun
  const calculationMode = mode
  setCalculating(true)
  calculateButton.disabled = true
  if (calculationMode === 'file') resetResult()
  if (cancelCalculate) cancelCalculate.hidden = calculationMode !== 'file' || !selectedFile || selectedFile.size <= largeFileThreshold
  if (status) status.textContent = '正在计算…'
  await new Promise((resolve) => window.setTimeout(resolve, 60))
  if (runId !== calculationRun) return
  try {
    if (calculationMode === 'text') {
      const value = input?.value ?? ''
      const bytes = new TextEncoder().encode(value).byteLength
      showResult(CryptoJS.MD5(value).toString(), value ? `来源：文本 · ${bytes} 字节` : '来源：空字符串', !value)
      recordToolUsage('md5')
    } else {
      if (!selectedFile) {
        showToast('请先选择一个文件')
        return
      }
      const hash = await calculateFileHash(selectedFile, runId)
      if (!hash || runId !== calculationRun) return
      showResult(hash, `来源：${selectedFile.name} · ${formatBytes(selectedFile.size)}`)
      recordToolUsage('md5')
    }
  } catch {
    if (runId !== calculationRun) return
    resetResult()
    resetFileProgress()
    showToast('计算失败，请检查文件后重试')
  } finally {
    if (runId === calculationRun) {
      setCalculating(false)
      calculateButton.disabled = false
      if (cancelCalculate) cancelCalculate.hidden = true
    }
  }
}

async function copyResult() {
  if (!result || isCalculating) return
  const displayedResult = formatResult(result)
  try {
    await navigator.clipboard.writeText(displayedResult)
  } catch {
    const selection = window.getSelection()
    const range = document.createRange()
    if (outputCode) range.selectNodeContents(outputCode)
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.execCommand('copy')
    selection?.removeAllRanges()
  }
  showToast('MD5 结果已复制')
}

function resetFile() {
  selectedFile = undefined
  if (fileInput) fileInput.value = ''
  if (dropTitle) dropTitle.textContent = '拖放文件到这里，或点击选择'
  if (dropMeta) dropMeta.textContent = '支持任意文件类型，文件不会离开你的设备'
  dropZone?.classList.remove('has-file')
  resetFileProgress()
}

function clearAll() {
  if (isCalculating) return
  if (input) input.value = ''
  if (charCount) charCount.textContent = '0'
  if (textClear) textClear.hidden = true
  resetFile()
  resetResult()
  if (mode === 'text' && realtimeToggle?.checked) calculateTextLive()
  input?.focus()
}

function selectFile(file: File | undefined) {
  if (!file || isCalculating) return
  selectedFile = file
  if (dropTitle) dropTitle.textContent = file.name
  if (dropMeta) dropMeta.textContent = `${formatBytes(file.size)} · 文件已就绪，等待计算`
  dropZone?.classList.add('has-file')
  resetFileProgress()
}

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return
  const modeButton = event.target.closest<HTMLButtonElement>('[data-mode]')
  if (!modeButton || modeButton.closest('.tool-workspace') !== workspace) return
  const nextMode = modeButton.dataset.mode
  if (nextMode !== 'text' && nextMode !== 'file') return
  setMode(nextMode)
})
input?.addEventListener('input', () => {
  if (isCalculating) return
  if (charCount) charCount.textContent = String(Array.from(input.value).length)
  if (textClear) textClear.hidden = input.value.length === 0
  if (mode === 'text' && realtimeToggle?.checked) calculateTextLive()
})
textareaWrap?.addEventListener('mousemove', updateClearHover)
textareaWrap?.addEventListener('mouseleave', () => textareaWrap.classList.remove('is-clear-visible'))
realtimeToggle?.addEventListener('change', () => {
  if (!isCalculating && realtimeToggle.checked) calculateTextLive()
})
resultCase?.addEventListener('change', () => {
  if (isCalculating) return
  outputCase = resultCase.value === 'upper' ? 'upper' : 'lower'
  if (outputCode && result) outputCode.textContent = formatResult(result)
})

textClear?.addEventListener('click', clearAll)
clearButton?.addEventListener('click', clearAll)
calculateButton?.addEventListener('click', calculate)
cancelCalculate?.addEventListener('click', stopCalculation)
copyButton?.addEventListener('click', copyResult)
fileInput?.addEventListener('change', () => selectFile(fileInput.files?.[0]))
dropZone?.addEventListener('keydown', (event) => {
  if (isCalculating) return
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    fileInput?.click()
  }
})
dropZone?.addEventListener('dragover', (event) => {
  event.preventDefault()
  if (isCalculating) return
  dropZone.classList.add('is-dragging')
})
dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('is-dragging'))
dropZone?.addEventListener('drop', (event) => {
  event.preventDefault()
  if (isCalculating) return
  dropZone.classList.remove('is-dragging')
  selectFile(event.dataTransfer?.files[0])
})
document.querySelector<HTMLElement>('.tool-workspace')?.addEventListener('keydown', (event: KeyboardEvent) => {
  if (!isCalculating && (event.metaKey || event.ctrlKey) && event.key === 'Enter') calculate()
})

if (mode === 'text' && realtimeToggle?.checked) calculateTextLive()
