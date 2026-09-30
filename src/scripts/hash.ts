import { createHashHashers, hashAlgorithms, isHmacAlgorithm, type HashAlgorithmId } from '../lib/security/digests'
import { showToast } from './site'
import { recordToolUsage } from './usage'
import { currentTranslator } from '../i18n/client'

type InputMode = 'text' | 'file'

const mountedRoots = new WeakSet<HTMLElement>()

function init() {
  const root = document.querySelector<HTMLElement>('.security-workspace')
  if (!root || mountedRoots.has(root)) return
  mountedRoots.add(root)

  const labelById = new Map(hashAlgorithms.map((algorithm) => [algorithm.id, algorithm.label]))
  const algorithmInputs = document.querySelectorAll<HTMLInputElement>('input[name="hash-algorithms"]')
  const keyField = document.querySelector<HTMLElement>('#hash-key-field')
  const keyInput = document.querySelector<HTMLInputElement>('#hash-key')
  const showKey = document.querySelector<HTMLInputElement>('#hash-show-key')
  const input = document.querySelector<HTMLTextAreaElement>('#hash-input')
  const charCount = document.querySelector<HTMLElement>('#hash-char-count')
  const realtimeToggle = document.querySelector<HTMLInputElement>('#hash-realtime')
  const calculateButton = document.querySelector<HTMLButtonElement>('#hash-calculate')
  const cancelButton = document.querySelector<HTMLButtonElement>('#hash-cancel')
  const clearButton = document.querySelector<HTMLButtonElement>('#hash-clear')
  const outputCaseInput = document.querySelector<HTMLInputElement>('#hash-output-case')
  const copyAllButton = document.querySelector<HTMLButtonElement>('#hash-copy-all')
  const resultList = document.querySelector<HTMLElement>('#hash-results')
  const status = document.querySelector<HTMLElement>('#hash-result-status')
  const algorithmCount = document.querySelector<HTMLElement>('#hash-algorithm-count')
  const detail = document.querySelector<HTMLElement>('#hash-detail')
  const fileInput = document.querySelector<HTMLInputElement>('#hash-file-input')
  const dropZone = document.querySelector<HTMLElement>('#hash-drop-zone')
  const dropTitle = document.querySelector<HTMLElement>('#hash-drop-title')
  const dropMeta = document.querySelector<HTMLElement>('#hash-drop-meta')
  const progress = document.querySelector<HTMLElement>('#hash-progress')
  const progressLabel = document.querySelector<HTMLElement>('#hash-progress-label')
  const progressPercent = document.querySelector<HTMLElement>('#hash-progress-percent')
  const progressBar = document.querySelector<HTMLElement>('#hash-progress-bar')
  const progressDetail = document.querySelector<HTMLElement>('#hash-progress-detail')
  const workspace = document.querySelector<HTMLElement>('.security-workspace')
  const modeButtons = Array.from(workspace?.querySelectorAll<HTMLButtonElement>('[data-mode]') ?? [])
  const modePanels = Array.from(workspace?.querySelectorAll<HTMLElement>('[data-panel]') ?? [])
  const largeFileThreshold = 10 * 1024 ** 2
  const encoder = new TextEncoder()
  let mode: InputMode = 'text'
  let selectedFile: File | undefined
  let results = new Map<HashAlgorithmId, string>()
  let liveFrame = 0
  let runId = 0
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let isCalculating = false

  function getSelectedIds(): HashAlgorithmId[] {
    return [...algorithmInputs].filter((item) => item.checked).map((item) => item.value as HashAlgorithmId)
  }

  function getOutputCase() {
    return outputCaseInput?.value === 'upper' ? 'upper' : 'lower'
  }

  function formatOutput(value: string) {
    return getOutputCase() === 'upper' ? value.toUpperCase() : value.toLowerCase()
  }

  function getKey() {
    return keyInput?.value ?? ''
  }

  function setCalculating(value: boolean) {
    isCalculating = value
    workspace?.classList.toggle('is-calculating', value)
    workspace?.setAttribute('aria-busy', String(value))
    if (calculateButton) calculateButton.disabled = value
    if (cancelButton) cancelButton.hidden = !value || mode !== 'file' || !selectedFile || selectedFile.size <= largeFileThreshold
  }

  function updateKeyField() {
    if (!keyField) return
    keyField.hidden = !getSelectedIds().some(isHmacAlgorithm)
  }

  function updateAlgorithmCount() {
    const count = getSelectedIds().length
    if (algorithmCount) algorithmCount.textContent = count ? currentTranslator()('toolUi.hash.runtime.selectedCount', { count }) : currentTranslator()('toolUi.hash.runtime.noneSelected')
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KB`
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  }

  function updateProgress(loaded: number, total: number) {
    const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 100
    if (progress) progress.hidden = false
    if (progressPercent) progressPercent.textContent = `${percent}%`
    if (progressBar) progressBar.style.width = `${percent}%`
    if (progressDetail) progressDetail.textContent = `${formatBytes(loaded)} / ${formatBytes(total)}`
  }

  function resetProgress() {
    if (progress) progress.hidden = false
    if (progressLabel) progressLabel.textContent = currentTranslator()('toolUi.hash.runtime.readyToRun')
    if (progressPercent) progressPercent.textContent = '0%'
    if (progressBar) progressBar.style.width = '0%'
    if (progressDetail) progressDetail.textContent = '0 B / 0 B'
  }

  function stopCalculation() {
    runId += 1
    window.cancelAnimationFrame(liveFrame)
    // The reader may already be in a failed state, in which case cancelling it
    // rejects as well; the failure being reported is the one that caused it.
    const reader = activeReader
    activeReader = undefined
    void reader?.cancel().catch(() => {})
    setCalculating(false)
    if (status) status.textContent = currentTranslator()('toolUi.hash.runtime.stopped')
    if (progressLabel) progressLabel.textContent = currentTranslator()('toolUi.hash.runtime.stopped')
  }

  function cancelPending() {
    runId += 1
    window.cancelAnimationFrame(liveFrame)
  }

  function createRow(id: HashAlgorithmId) {
    const row = document.createElement('div')
    row.className = 'hash-result-item'
    row.dataset.algo = id
    const label = document.createElement('span')
    label.className = 'hash-result-algo'
    label.textContent = labelById.get(id) ?? id
    const value = document.createElement('code')
    value.className = 'hash-result-value'
    value.textContent = ''
    const copy = document.createElement('button')
    copy.className = 'hash-result-copy'
    copy.type = 'button'
    copy.dataset.algo = id
    copy.textContent = currentTranslator()('toolUi.hash.runtime.copy')
    copy.setAttribute('aria-label', currentTranslator()('toolUi.hash.runtime.copyAria', { label: labelById.get(id) ?? id }))
    row.append(label, value, copy)
    return row
  }

  function renderList() {
    if (!resultList) return
    const ids = getSelectedIds()
    resultList.replaceChildren()
    if (!ids.length) return
    ids.forEach((id) => {
      const row = createRow(id)
      const value = row.querySelector<HTMLElement>('.hash-result-value')
      if (value) value.textContent = results.has(id) ? formatOutput(results.get(id) ?? '') : currentTranslator()('toolUi.hash.runtime.waitingCalc')
      if (!results.has(id)) row.classList.add('is-pending')
      resultList.append(row)
    })
  }

  function computed(computedResults: Map<HashAlgorithmId, string>, source: string) {
    results = computedResults
    renderList()
    if (status) status.textContent = currentTranslator()('toolUi.hash.runtime.done')
    if (detail) detail.textContent = source
  }

  function resetResult() {
    results = new Map()
    renderList()
    if (status) status.textContent = currentTranslator()('workspace.waitingInput')
    if (detail) detail.textContent = currentTranslator()(getSelectedIds().length ? 'toolUi.hash.runtime.hintSelected' : 'toolUi.hash.runtime.hintNone')
  }

  async function hashBytes(ids: HashAlgorithmId[], bytes: Uint8Array, id: number) {
    const hashers = await createHashHashers(ids, getKey())
    if (id !== runId) return undefined
    hashers.forEach((hasher) => hasher.update(bytes))
    const computedResults = new Map<HashAlgorithmId, string>()
    hashers.forEach((hasher, algorithmId) => computedResults.set(algorithmId, hasher.digest('hex')))
    return computedResults
  }

  async function hashFileStream(file: File, ids: HashAlgorithmId[], id: number) {
    if (progressLabel) progressLabel.textContent = currentTranslator()('toolUi.hash.runtime.readingFile')
    updateProgress(0, file.size)
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    const hashers = await createHashHashers(ids, getKey())
    if (id !== runId) return undefined
    const reader = file.stream().getReader()
    activeReader = reader
    let loaded = 0
    let chunkCount = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (id !== runId) return undefined
        if (done) break
        hashers.forEach((hasher) => hasher.update(value))
        loaded += value.byteLength
        chunkCount += 1
        updateProgress(loaded, file.size)
        if (chunkCount % 4 === 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      }
      if (progressLabel) progressLabel.textContent = currentTranslator()('toolUi.hash.runtime.done')
      const computedResults = new Map<HashAlgorithmId, string>()
      hashers.forEach((hasher, algorithmId) => computedResults.set(algorithmId, hasher.digest('hex')))
      return computedResults
    } finally {
      if (activeReader === reader) activeReader = undefined
    }
  }

  function calculateTextLive() {
    if (isCalculating) return
    window.cancelAnimationFrame(liveFrame)
    const id = ++runId
    liveFrame = window.requestAnimationFrame(async () => {
      const ids = getSelectedIds()
      if (!ids.length) return
      const value = input?.value ?? ''
      const bytes = encoder.encode(value)
      // Nothing awaits this frame, so a failure has to be caught here: the
      // calculate button reports one, and this path would otherwise leave the
      // results waiting with nothing in the console to explain it.
      let computedResults: Map<HashAlgorithmId, string> | undefined
      try {
        computedResults = await hashBytes(ids, bytes, id)
      } catch {
        if (id !== runId) return
        showToast(currentTranslator()('toolUi.hash.runtime.failed'))
        return
      }
      if (!computedResults || id !== runId) return
      computed(computedResults, currentTranslator()('toolUi.hash.runtime.liveCalc', { bytes: formatBytes(bytes.byteLength) }))
    })
  }

  async function calculate() {
    if (isCalculating) return
    const ids = getSelectedIds()
    if (!ids.length) {
      showToast(currentTranslator()('toolUi.hash.runtime.needAlgorithm'))
      return
    }
    if (mode === 'file' && !selectedFile) {
      showToast(currentTranslator()('toolUi.hash.runtime.needFile'))
      return
    }
    const id = ++runId
    setCalculating(true)
    if (status) status.textContent = currentTranslator()('toolUi.hash.runtime.calculating')
    await new Promise<void>((resolve) => window.setTimeout(resolve, 20))
    try {
      if (mode === 'text') {
        const value = input?.value ?? ''
        const bytes = encoder.encode(value)
        const computedResults = await hashBytes(ids, bytes, id)
        if (!computedResults || id !== runId) return
        computed(computedResults, currentTranslator()('toolUi.hash.runtime.sourceText', { bytes: formatBytes(bytes.byteLength) }))
      } else if (selectedFile) {
        const computedResults = await hashFileStream(selectedFile, ids, id)
        if (!computedResults || id !== runId) return
        computed(computedResults, currentTranslator()('toolUi.hash.runtime.sourceFile', { name: selectedFile.name, size: formatBytes(selectedFile.size) }))
      }
      recordToolUsage('hash')
    } catch {
      if (id === runId) showToast(currentTranslator()('toolUi.hash.runtime.failed'))
    } finally {
      if (id === runId) setCalculating(false)
    }
  }

  async function copyValue(algoId: string) {
    const id = algoId as HashAlgorithmId
    const value = results.get(id)
    if (!value) {
      showToast(currentTranslator()('toolUi.hash.runtime.needDigest'))
      return
    }
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(formatOutput(value))
      showToast(currentTranslator()('toolUi.hash.runtime.copiedOne', { label: labelById.get(id) ?? id }))
    } catch {
      showToast(currentTranslator()('toolUi.hash.runtime.manualCopy'))
    }
  }

  async function copyAll() {
    if (!results.size) {
      showToast(currentTranslator()('toolUi.hash.runtime.needDigest'))
      return
    }
    const text = [...results.entries()].map(([id, value]) => `${labelById.get(id) ?? id}: ${formatOutput(value)}`).join('\n')
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(text)
      showToast(currentTranslator()('toolUi.hash.runtime.copiedAll'))
    } catch {
      showToast(currentTranslator()('toolUi.hash.runtime.manualCopy'))
    }
  }

  function setMode(nextMode: InputMode) {
    if (mode === nextMode) return
    if (isCalculating) stopCalculation()
    else cancelPending()
    mode = nextMode
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
    if (mode === 'file') resetProgress()
    if (mode === 'text' && realtimeToggle?.checked) calculateTextLive()
  }

  function resetFile() {
    selectedFile = undefined
    if (fileInput) fileInput.value = ''
    if (dropTitle) dropTitle.textContent = currentTranslator()('toolUi.hash.dropLabel')
    if (dropMeta) dropMeta.textContent = currentTranslator()('toolUi.hash.dropHint')
    dropZone?.classList.remove('has-file')
    if (progress) progress.hidden = true
  }

  function clearAll() {
    if (isCalculating) return
    cancelPending()
    if (input) input.value = ''
    if (charCount) charCount.textContent = '0'
    resetFile()
    resetResult()
    if (mode === 'text' && realtimeToggle?.checked) calculateTextLive()
    input?.focus()
  }

  function selectFile(file: File | undefined) {
    if (!file || isCalculating) return
    selectedFile = file
    if (dropTitle) dropTitle.textContent = file.name
    if (dropMeta) dropMeta.textContent = currentTranslator()('toolUi.hash.runtime.fileReady', { size: formatBytes(file.size) })
    dropZone?.classList.add('has-file')
    resetProgress()
    if (status) status.textContent = currentTranslator()('toolUi.hash.runtime.waitingRun')
    if (detail) detail.textContent = currentTranslator()('toolUi.hash.runtime.selectedFile', { name: file.name })
  }

  workspace?.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return
    const modeButton = event.target.closest<HTMLButtonElement>('[data-mode]')
    if (!modeButton || modeButton.closest('.security-workspace') !== workspace) return
    const nextMode = modeButton.dataset.mode
    if (nextMode === 'text' || nextMode === 'file') setMode(nextMode)
    return
  })
  algorithmInputs.forEach((item) => item.addEventListener('change', () => {
    updateKeyField()
    updateAlgorithmCount()
    resetResult()
    if (mode === 'text' && realtimeToggle?.checked && !isCalculating) calculateTextLive()
  }))
  keyInput?.addEventListener('input', () => {
    if (mode === 'text' && realtimeToggle?.checked && !isCalculating) calculateTextLive()
  })
  showKey?.addEventListener('change', () => {
    if (keyInput) keyInput.type = showKey.checked ? 'text' : 'password'
  })
  input?.addEventListener('input', () => {
    if (charCount) charCount.textContent = String(Array.from(input.value).length)
    if (mode === 'text' && realtimeToggle?.checked) calculateTextLive()
  })
  realtimeToggle?.addEventListener('change', () => {
    if (realtimeToggle.checked && mode === 'text') calculateTextLive()
    else cancelPending()
  })
  outputCaseInput?.addEventListener('change', renderList)
  calculateButton?.addEventListener('click', () => void calculate())
  cancelButton?.addEventListener('click', stopCalculation)
  clearButton?.addEventListener('click', clearAll)
  copyAllButton?.addEventListener('click', () => void copyAll())
  resultList?.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('.hash-result-copy')
    if (button) void copyValue(button.dataset.algo ?? '')
  })
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
    if (!isCalculating) dropZone.classList.add('is-dragging')
  })
  dropZone?.addEventListener('dragleave', () => dropZone?.classList.remove('is-dragging'))
  dropZone?.addEventListener('drop', (event) => {
    event.preventDefault()
    dropZone.classList.remove('is-dragging')
    if (!isCalculating) selectFile(event.dataTransfer?.files[0])
  })
  workspace?.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      void calculate()
    }
  })

  updateKeyField()
  updateAlgorithmCount()
  resetResult()
  if (realtimeToggle?.checked) calculateTextLive()
}

document.addEventListener('astro:page-load', init)
init()