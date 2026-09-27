import {
  claimCountsAsWin,
  drawFromSource,
  formatRandomSource,
  newRandomSource,
  parseRandomSource,
  trimHistory,
  tronscanUrl,
  type HistoryEntry,
  type LotteryEntry,
  type WinClaim
} from '../lib/wallet/lottery'
import { recordToolUsage } from './usage'
import { clearError, copyText, setText, showError, toggleHidden } from './tool-panel'
import { currentTranslator } from '../i18n/client'
import type { MessageKey } from '../i18n'

const WARNING_KEYS: readonly MessageKey[] = [
  'toolUi.tron-lottery.warnings.publicSource',
  'toolUi.tron-lottery.warnings.noPassphrase',
  'toolUi.tron-lottery.warnings.noFunds',
  'toolUi.tron-lottery.warnings.deterministic'
]

const mountedRoots = new WeakSet<HTMLElement>()
const STORAGE_KEY = 'tron-lottery:stats'

type Stats = {
  draws: number
  addresses: number
  wins: number
  checks: number
  history: HistoryEntry[]
}

const emptyStats = (): Stats => ({ draws: 0, addresses: 0, wins: 0, checks: 0, history: [] })

function loadStats(): Stats {
  if (typeof localStorage === 'undefined') return emptyStats()
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Stats>
    const rows = Array.isArray(stored.history) ? stored.history : []
    return {
      draws: Number(stored.draws) || 0,
      addresses: Number(stored.addresses) || 0,
      wins: Number(stored.wins) || 0,
      checks: Number(stored.checks) || 0,
      // Re-trimmed on load so a claimed win keeps its exemption from the cap.
      history: trimHistory(rows.filter((row): row is HistoryEntry => typeof row?.source === 'string'))
    }
  } catch {
    return emptyStats()
  }
}

function saveStats(stats: Stats) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats))
  } catch {
    // A full or blocked storage must never break the draw itself.
  }
}

function el<T extends Element>(root: ParentNode | null | undefined, selector: string): T | null {
  return root?.querySelector<T>(selector) ?? null
}

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function init() {
  const root = document.querySelector<HTMLElement>('.lottery-workspace')
  if (!root || mountedRoots.has(root)) return
  mountedRoots.add(root)

  const t = currentTranslator()

  const sourceInput = el<HTMLInputElement>(root, '#lottery-source')
  const drawButton = el<HTMLButtonElement>(root, '#lottery-draw')
  const replayButton = el<HTMLButtonElement>(root, '#lottery-replay')
  const clearHistoryButton = el<HTMLButtonElement>(root, '#lottery-clear-history')
  const errorBox = el<HTMLElement>(root, '#lottery-error')

  const statDraws = el<HTMLElement>(root, '#lottery-stat-draws')
  const statAddresses = el<HTMLElement>(root, '#lottery-stat-addresses')
  const statWins = el<HTMLElement>(root, '#lottery-stat-wins')
  const statChecks = el<HTMLElement>(root, '#lottery-stat-checks')

  const resultCard = el<HTMLElement>(root, '#lottery-result')
  const resultStatus = el<HTMLElement>(root, '#lottery-result-status')
  const entryList = el<HTMLElement>(root, '#lottery-entries')
  const warningList = el<HTMLElement>(root, '#lottery-warnings')
  const historyList = el<HTMLElement>(root, '#lottery-history')
  const revealButton = el<HTMLButtonElement>(root, '#lottery-reveal')
  const revealLabel = el<HTMLElement>(root, '#lottery-reveal-label')

  const dialog = el<HTMLDialogElement>(root, '#lottery-win-dialog')
  const dialogBody = el<HTMLElement>(root, '#lottery-dialog-body')
  const dialogAsk = el<HTMLElement>(root, '.lottery-dialog-step[data-step="ask"]')
  const dialogAmount = el<HTMLElement>(root, '.lottery-dialog-step[data-step="amount"]')
  const amountInput = el<HTMLInputElement>(root, '#lottery-win-amount')

  let stats = loadStats()
  let entries: LotteryEntry[] = []
  let currentSource = ''
  let revealSecrets = false
  /** Entry index the dialog is currently asking about, or -1 when closed. */
  let pendingWin = -1

  const renderStats = () => {
    setText(statDraws, String(stats.draws))
    setText(statAddresses, String(stats.addresses))
    setText(statWins, String(stats.wins))
    setText(statChecks, String(stats.checks))
  }

  function renderHistory() {
    if (!historyList) return
    historyList.replaceChildren()
    if (stats.history.length === 0) {
      historyList.append(make('p', 'lottery-history-empty', t('toolUi.tron-lottery.historyEmpty')))
      return
    }
    for (const row of stats.history) {
      const item = make('div', 'lottery-history-row')
      if (row.claim) item.classList.add('is-winner')
      const code = make('code', 'lottery-history-source', row.source)
      item.append(code)
      const when = make('span', 'lottery-history-time', new Date(row.at).toLocaleString())
      item.append(when)
      if (row.claim) {
        item.append(make('span', 'lottery-badge-winner', t('toolUi.tron-lottery.winnerBadge')))
        item.append(
          make(
            'span',
            'lottery-win-amount',
            row.claim.amount.trim() || t('toolUi.tron-lottery.winnerAmountUnknown')
          )
        )
      } else if (row.winners > 0) {
        item.append(make('span', 'lottery-badge-winner', t('toolUi.tron-lottery.winnerBadge')))
      }
      const replay = make('button', 'inline-copy', t('toolUi.tron-lottery.replayButton'))
      replay.type = 'button'
      replay.addEventListener('click', () => {
        if (sourceInput) sourceInput.value = row.source
        void run(row.source, true)
      })
      item.append(replay)
      historyList.append(item)
    }
  }

  function renderWarnings() {
    if (!warningList) return
    warningList.replaceChildren()
    for (const key of WARNING_KEYS) warningList.append(make('li', '', t(key)))
  }

  /** The win reported for the current draw, if the user has claimed one. */
  function currentClaim(): WinClaim | undefined {
    return stats.history.find((row) => row.source === currentSource)?.claim
  }

  function renderEntries() {
    if (!entryList) return
    entryList.replaceChildren()
    entries.forEach((entry) => entryList.append(buildEntry(entry)))
  }

  function buildEntry(entry: LotteryEntry): HTMLElement {
    const card = make('div', 'lottery-entry')
    const claim = currentClaim()
    const claimed = claim?.index === entry.index
    if (entry.winner || claimed) card.classList.add('is-winner')
    const head = make('div', 'lottery-entry-head')
    head.append(make('span', 'lottery-entry-index', `#${entry.index + 1}`))
    head.append(make('code', 'lottery-entry-hex', entry.addressHex))
    if (entry.winner || claimed) {
      head.append(make('span', 'lottery-badge-winner', t('toolUi.tron-lottery.winnerBadge')))
      if (claimed && claim) {
        head.append(
          make('span', 'lottery-win-amount', claim.amount.trim() || t('toolUi.tron-lottery.winnerAmountUnknown'))
        )
      }
    }
    card.append(head)

    const addressRow = make('div', 'lottery-entry-address')
    addressRow.append(make('code', 'lottery-address', entry.address))
    const copy = make('button', 'bip39-copy', '⧉')
    copy.type = 'button'
    copy.title = t('common.copy')
    copy.setAttribute('aria-label', `${t('common.copy')} ${entry.address}`)
    copy.addEventListener('click', () => void copyText(entry.address, t('toolUi.tron-lottery.messages.copiedAddress')))
    addressRow.append(copy)
    card.append(addressRow)

    const secretRow = make('div', 'lottery-entry-secret')
    secretRow.append(make('span', 'lottery-secret-label', t('toolUi.tron-lottery.mnemonicLabel')))
    const code = make('code', 'lottery-mnemonic')
    if (revealSecrets) {
      code.textContent = entry.mnemonic
    } else {
      // The real words stay out of the DOM until the user asks for them.
      code.classList.add('bip39-key-masked')
      code.textContent = '•'.repeat(48)
    }
    secretRow.append(code)
    card.append(secretRow)

    const actions = make('div', 'lottery-entry-actions')
    const check = make('button', 'lottery-check', t('toolUi.tron-lottery.checkButton'))
    check.type = 'button'
    check.addEventListener('click', () => {
      stats.checks += 1
      saveStats(stats)
      renderStats()
      window.open(tronscanUrl(entry.address), '_blank', 'noopener,noreferrer')
      openWinDialog(entry)
    })
    actions.append(check)
    const copyWords = make('button', 'inline-copy', t('toolUi.tron-lottery.copyMnemonic'))
    copyWords.type = 'button'
    copyWords.addEventListener('click', () => void copyText(entry.mnemonic, t('toolUi.tron-lottery.messages.copiedMnemonic')))
    actions.append(copyWords)
    card.append(actions)

    return card
  }

  function showStep(step: 'ask' | 'amount') {
    if (dialogAsk) dialogAsk.hidden = step !== 'ask'
    if (dialogAmount) dialogAmount.hidden = step !== 'amount'
  }

  function openWinDialog(entry: LotteryEntry) {
    if (!dialog) return
    pendingWin = entry.index
    showStep('ask')
    if (amountInput) amountInput.value = ''
    if (dialogBody) {
      dialogBody.textContent = t('toolUi.tron-lottery.winDialogBody').replace('{address}', entry.address)
    }
    dialog.showModal()
  }

  /** Records the reported win against the draw it belongs to. */
  function claimWin(index: number, amount: string) {
    const claim: WinClaim = { index, amount: amount.trim() }
    let row = stats.history.find((item) => item.source === currentSource)
    if (!row) {
      // The draw being checked can be older than the history cap, so its row
      // may already have been dropped. Re-add it: a claim is exempt from the cap
      // anyway, which is exactly what keeps reported wins from being lost.
      row = { source: currentSource, at: Date.now(), winners: 0 }
      stats.history = trimHistory([row, ...stats.history])
    }
    // A win the user reports from the dialog counts towards the tally, otherwise
    // `wins` only ever reflected the algorithm's own verdict. The claim is
    // counted once per draw, so confirming it again cannot inflate the total.
    if (claimCountsAsWin(row)) stats.wins += 1
    row.claim = claim
    saveStats(stats)
    renderStats()
    renderHistory()
    renderEntries()
  }

  async function run(source: string, replay: boolean) {
    const list = await drawFromSource(source)
    entries = list
    currentSource = source
    if (dialog?.open) dialog.close('cancel')
    renderEntries()

    const winners = list.filter((entry) => entry.winner).length
    stats.draws += 1
    stats.addresses += list.length
    stats.wins += winners
    if (!replay) {
      stats.history = trimHistory([{ source, at: Date.now(), winners }, ...stats.history.filter((row) => row.source !== source)])
    }
    saveStats(stats)
    renderStats()
    renderHistory()

    setText(
      resultStatus,
      replay
        ? t('toolUi.tron-lottery.statusReplayed').replace('{count}', String(list.length))
        : t('toolUi.tron-lottery.statusDrawn').replace('{count}', String(list.length))
    )
    toggleHidden(resultCard, false)
    recordToolUsage('tron-lottery')
  }

  function drawNew() {
    clearError(errorBox)
    const source = formatRandomSource(newRandomSource())
    if (sourceInput) sourceInput.value = source
    void run(source, false)
  }

  function replay() {
    const parsed = parseRandomSource(sourceInput?.value ?? '')
    if (!parsed) {
      showError(errorBox, t('toolUi.tron-lottery.errors.badSource'))
      return
    }
    clearError(errorBox)
    const source = formatRandomSource(parsed)
    if (sourceInput) sourceInput.value = source
    void run(source, true)
  }

  // Both steps live in one dialog: answering "yes" swaps the panel in place
  // rather than closing and reopening, and Esc needs no handler because the
  // native dialog already handles it.
  dialog?.querySelectorAll<HTMLButtonElement>('[data-answer]').forEach((button) => {
    button.addEventListener('click', () => {
      const answer = button.dataset.answer
      if (answer === 'yes') {
        showStep('amount')
        amountInput?.focus()
        return
      }
      dialog.close(answer ?? 'cancel')
    })
  })

  dialog?.addEventListener('close', () => {
    const answer = dialog.returnValue
    if (answer === 'save') claimWin(pendingWin, amountInput?.value ?? '')
    pendingWin = -1
    dialog.returnValue = ''
  })

  drawButton?.addEventListener('click', drawNew)
  replayButton?.addEventListener('click', replay)
  clearHistoryButton?.addEventListener('click', () => {
    stats.history = []
    saveStats(stats)
    renderHistory()
  })
  revealButton?.addEventListener('click', () => {
    revealSecrets = !revealSecrets
    revealButton.setAttribute('aria-pressed', String(revealSecrets))
    setText(revealLabel, t(revealSecrets ? 'toolUi.tron-lottery.hideKeys' : 'toolUi.tron-lottery.revealKeys'))
    renderEntries()
  })

  // Reopening the page lands on the last source so a draw is never lost.
  if (sourceInput && !sourceInput.value && stats.history[0]) {
    sourceInput.value = stats.history[0].source
  }
  renderStats()
  renderHistory()
  renderWarnings()
}

document.addEventListener('astro:page-load', init)
init()
