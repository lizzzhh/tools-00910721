import { analyzeText } from '../lib/text-stats'
import { recordToolUsage } from './usage'
import { formatBytes, formatNumber, setStat, toggleHidden } from './tool-panel'

const sample = `码间 tools 是一套纯前端开发者工具箱。

所有处理都在你的浏览器本地完成，不上传任何数据。
Try typing, counting, and converting text safely.`

const mountedRoots = new WeakSet<HTMLElement>()

function init() {
  const root = document.querySelector<HTMLElement>('.text-counter-workspace')
  if (!root || mountedRoots.has(root)) return
  mountedRoots.add(root)

  const input = root?.querySelector<HTMLTextAreaElement>('#text-counter-input')
  const charCount = root?.querySelector<HTMLElement>('#text-counter-char-count')
  const resultCard = root?.querySelector<HTMLElement>('#text-counter-result')
  const resultStatus = root?.querySelector<HTMLElement>('#text-counter-result-status')
  const sampleButton = root?.querySelector<HTMLButtonElement>('#text-counter-sample')
  const clearButton = root?.querySelector<HTMLButtonElement>('#text-counter-clear')
  let used = false

  function update() {
    const value = input?.value ?? ''
    if (charCount) charCount.textContent = formatNumber(Array.from(value).length)

    if (value.length === 0) {
      toggleHidden(resultCard, true)
      if (resultStatus) resultStatus.textContent = '等待输入'
      used = false
      return
    }

    const stats = analyzeText(value)
    toggleHidden(resultCard, false)
    if (resultStatus) resultStatus.textContent = '实时统计中'
    setStat(root, 'text-counter-stat-characters', formatNumber(stats.characters))
    setStat(root, 'text-counter-stat-no-spaces', formatNumber(stats.charactersNoSpaces))
    setStat(root, 'text-counter-stat-words', formatNumber(stats.words))
    setStat(root, 'text-counter-stat-unique', formatNumber(stats.uniqueWords))
    setStat(root, 'text-counter-stat-lines', formatNumber(stats.lines))
    setStat(root, 'text-counter-stat-paragraphs', formatNumber(stats.paragraphs))
    setStat(root, 'text-counter-stat-sentences', formatNumber(stats.sentences))
    setStat(root, 'text-counter-stat-bytes', `${formatNumber(stats.bytes)}（${formatBytes(stats.bytes)}）`)
    setStat(root, 'text-counter-stat-cjk', formatNumber(stats.cjk))
    setStat(root, 'text-counter-stat-letters', formatNumber(stats.letters))
    setStat(root, 'text-counter-stat-digits', formatNumber(stats.digits))
    setStat(root, 'text-counter-stat-punctuation', formatNumber(stats.punctuation))
    setStat(root, 'text-counter-stat-whitespace', formatNumber(stats.whitespace))
    setStat(root, 'text-counter-stat-longest', formatNumber(stats.longestWord))
    setStat(root, 'text-counter-stat-reading', `${formatNumber(stats.readingMinutes)} 分钟`)

    if (!used) {
      used = true
      recordToolUsage('text-counter')
    }
  }

  input?.addEventListener('input', update)
  sampleButton?.addEventListener('click', () => {
    if (input) input.value = sample
    update()
  })
  clearButton?.addEventListener('click', () => {
    if (input) input.value = ''
    update()
    input?.focus()
  })

  toggleHidden(resultCard, true)
}

document.addEventListener('astro:page-load', init)
init()
