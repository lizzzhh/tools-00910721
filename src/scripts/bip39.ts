import {
  bip39LanguageLabels,
  bip39Languages,
  bip39Separators,
  bip39Strengths,
  convertMnemonic,
  detectLanguage,
  generateMnemonic,
  isBip39Language,
  loadWordlist,
  mnemonicToSeed,
  splitMnemonic,
  validateMnemonic,
  type Bip39Language,
  type Bip39Strength
} from '../lib/wallet/bip39'
import { chains, deriveChainEntry, type AddressFormatId, type ChainId, type DerivedEntry } from '../lib/wallet'
import { recordToolUsage } from './usage'
import { clearError, copyText, setDisabled, setText, showError, toggleHidden } from './tool-panel'
import { currentTranslator } from '../i18n/client'
import type { MessageKey } from '../i18n'

const mountedRoots = new WeakSet<HTMLElement>()

/** Cached wordlists, so switching language repeatedly does not refetch. */
const wordlistCache = new Map<Bip39Language, Promise<string[]>>()
function words(language: Bip39Language): Promise<string[]> {
  const cached = wordlistCache.get(language)
  if (cached) return cached
  const pending = loadWordlist(language)
  wordlistCache.set(language, pending)
  return pending
}

/**
 * Label keys are looked up through a typed map rather than template literals,
 * so a typo is a compile error instead of an untranslated string at runtime.
 */
const FORMAT_KEYS: Record<AddressFormatId, MessageKey> = {
  p2pkh: 'toolUi.bip39.formats.p2pkh',
  'p2sh-p2wpkh': 'toolUi.bip39.formats.p2shP2wpkh',
  p2wpkh: 'toolUi.bip39.formats.p2wpkh',
  eip55: 'toolUi.bip39.formats.eip55',
  'tron-base58': 'toolUi.bip39.formats.tronBase58',
  'tron-hex': 'toolUi.bip39.formats.tronHex'
}

const CHAIN_KEYS: Record<ChainId, MessageKey> = {
  bitcoin: 'toolUi.bip39.chains.bitcoin',
  litecoin: 'toolUi.bip39.chains.litecoin',
  dogecoin: 'toolUi.bip39.chains.dogecoin',
  ethereum: 'toolUi.bip39.chains.ethereum',
  binance: 'toolUi.bip39.chains.binance',
  tron: 'toolUi.bip39.chains.tron'
}

/** Accepts a nullish root so callers inside hoisted helpers need no re-checks. */
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
  const root = document.querySelector<HTMLElement>('.bip39-workspace')
  if (!root || mountedRoots.has(root)) return
  mountedRoots.add(root)

  const t = currentTranslator()

  const languageSelect = el<HTMLInputElement>(root, '#bip39-language')
  const strengthSelect = el<HTMLInputElement>(root, '#bip39-strength')
  const generateButton = el<HTMLButtonElement>(root, '#bip39-generate')
  const clearButton = el<HTMLButtonElement>(root, '#bip39-clear')
  const input = el<HTMLTextAreaElement>(root, '#bip39-input')
  const errorBox = el<HTMLElement>(root, '#bip39-error')
  const wordCount = el<HTMLElement>(root, '#bip39-word-count')

  const copyMnemonic = el<HTMLButtonElement>(root, '#bip39-copy-mnemonic')
  const copyEntropy = el<HTMLButtonElement>(root, '#bip39-copy-entropy')
  const entropyOutput = el<HTMLElement>(root, '#bip39-entropy')
  const statLanguage = el<HTMLElement>(root, '#bip39-stat-language')
  const statWords = el<HTMLElement>(root, '#bip39-stat-words')
  const statEntropy = el<HTMLElement>(root, '#bip39-stat-entropy')
  const statChecksum = el<HTMLElement>(root, '#bip39-stat-checksum')

  const convertSelect = el<HTMLInputElement>(root, '#bip39-convert-language')
  const converted = el<HTMLElement>(root, '#bip39-converted')

  const passphrase = el<HTMLInputElement>(root, '#bip39-passphrase')
  const accountInput = el<HTMLInputElement>(root, '#bip39-account')
  const resetPaths = el<HTMLButtonElement>(root, '#bip39-reset-paths')
  const revealButton = el<HTMLButtonElement>(root, '#bip39-reveal')
  const revealLabel = el<HTMLElement>(root, '#bip39-reveal-label')

  const resultCard = el<HTMLElement>(root, '#bip39-result')
  const resultStatus = el<HTMLElement>(root, '#bip39-result-status')
  const statChains = el<HTMLElement>(root, '#bip39-stat-chains')
  const statAddresses = el<HTMLElement>(root, '#bip39-stat-addresses')
  const statSeed = el<HTMLElement>(root, '#bip39-stat-seed')
  const statFingerprint = el<HTMLElement>(root, '#bip39-stat-fingerprint')
  const chainList = el<HTMLElement>(root, '#bip39-chains')
  const warningList = el<HTMLElement>(root, '#bip39-warnings')

  let usageRecorded = false
  let currentMnemonic = ''
  let currentEntropyHex = ''
  let currentLanguage: Bip39Language = 'english'
  let revealSecrets = false

  const recordUsage = () => {
    if (usageRecorded) return
    usageRecorded = true
    recordToolUsage('bip39')
  }

  const selectedLanguage = (): Bip39Language => {
    const value = languageSelect?.value ?? ''
    return isBip39Language(value) ? value : 'english'
  }

  const selectedStrength = (): Bip39Strength => {
    // 16 bytes is 128 bits of entropy, i.e. the 12-word default.
    const value = Number(strengthSelect?.value ?? 16)
    return (bip39Strengths as readonly number[]).includes(value) ? (value as Bip39Strength) : 16
  }

  // --- mnemonic panel -------------------------------------------------------

  function renderMnemonic() {
    const words_ = currentMnemonic ? splitMnemonic(currentMnemonic).length : 0
    setText(statLanguage, currentMnemonic ? bip39LanguageLabels[currentLanguage] : '—')
    setText(statWords, currentMnemonic ? String(words_) : '—')
    // Each entropy byte is 8 bits, so the hex length gives the bit count.
    setText(statEntropy, currentEntropyHex ? String(currentEntropyHex.length * 4) : '—')
    setText(statChecksum, currentMnemonic ? t('toolUi.bip39.statusValid') : '—')
    setText(entropyOutput, currentEntropyHex || '—')
    setDisabled(copyMnemonic, !currentMnemonic)
    setDisabled(copyEntropy, !currentEntropyHex)
  }

  async function refreshConversion() {
    if (!converted) return
    const target = convertSelect?.value ?? ''
    if (!currentMnemonic || !currentEntropyHex || !isBip39Language(target) || target === currentLanguage) {
      setText(converted, currentMnemonic && isBip39Language(target) && target === currentLanguage ? currentMnemonic : '—')
      return
    }
    try {
      const [from, to] = await Promise.all([words(currentLanguage), words(target)])
      if (!validateMnemonic(currentMnemonic, from).valid) {
        setText(converted, '—')
        return
      }
      setText(converted, convertMnemonic(currentMnemonic, from, to, bip39Separators[target]))
    } catch {
      setText(converted, '—')
    }
  }

  async function generate() {
    const language = selectedLanguage()
    const strength = selectedStrength()
    try {
      const list = await words(language)
      const mnemonic = generateMnemonic(strength, list, bip39Separators[language])
      // The entropy is recovered from the generated words rather than drawn a
      // second time, so the displayed hex always matches the mnemonic.
      const validation = validateMnemonic(mnemonic, list)
      currentLanguage = language
      currentMnemonic = mnemonic
      currentEntropyHex = validation.entropyHex ?? ''
      clearError(errorBox)
      if (input) input.value = mnemonic
      setText(wordCount, String(splitMnemonic(mnemonic).length))
      renderMnemonic()
      void refreshConversion()
      scheduleDerive(0)
      recordUsage()
    } catch {
      showError(errorBox, t('toolUi.bip39.errors.generateFailed'))
    }
  }

  /** Detects which bundled wordlist a pasted mnemonic uses, then adopts it. */
  async function adoptMnemonic(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) {
      currentMnemonic = ''
      currentEntropyHex = ''
      clearError(errorBox)
      renderMnemonic()
      setText(wordCount, '0')
      return
    }
    const parts = splitMnemonic(trimmed)
    setText(wordCount, String(parts.length))

    const loaded = await Promise.all(
      bip39Languages.map(async (language) => ({ language, words: await words(language) }))
    )
    const language = detectLanguage(trimmed, loaded)
    if (!language) {
      // Keep the words visible so they can be checked or corrected by hand.
      currentMnemonic = parts.join(' ')
      currentEntropyHex = ''
      showError(errorBox, t('toolUi.bip39.errors.unknownWords').replace('{count}', String(parts.length)))
      renderMnemonic()
      setText(converted, '—')
      return
    }
    const list = loaded.find((entry) => entry.language === language)!.words
    const validation = validateMnemonic(trimmed, list)
    currentLanguage = language
    currentMnemonic = parts.join(bip39Separators[language])
    currentEntropyHex = validation.entropyHex ?? ''
    clearError(errorBox)
    renderMnemonic()
    void refreshConversion()
    scheduleDerive(0)
  }

  function clearAll() {
    window.clearTimeout(deriveTimer)
    currentMnemonic = ''
    currentEntropyHex = ''
    if (input) input.value = ''
    setText(wordCount, '0')
    clearError(errorBox)
    setText(converted, '—')
    renderMnemonic()
    toggleHidden(resultCard, true)
  }

  // --- results panel --------------------------------------------------------

  /** The BIP44 account index. An empty or malformed field means account 0. */
  function readAccount(): number {
    const value = Number(accountInput?.value)
    if (!Number.isInteger(value) || value < 0) return 0
    return value
  }

  /**
   * Derivation is instant, so the table follows the inputs on its own. A short
   * debounce keeps a passphrase being typed from re-deriving on every key, and
   * it stays a no-op until a valid mnemonic exists, so typing into an empty
   * form never raises the "generate a mnemonic first" error.
   */
  let deriveTimer = 0
  function scheduleDerive(delay = 300) {
    window.clearTimeout(deriveTimer)
    if (!currentMnemonic) return
    deriveTimer = window.setTimeout(() => void derive(), delay)
  }

  /** The BIP44 receive path for a chain at the chosen account, or a custom override. */
  function pathFor(chainId: ChainId, account: number): string {
    const chain = chains.find((entry) => entry.id === chainId)
    if (!chain) return ''
    const custom = el<HTMLInputElement>(root, `#bip39-path-${chainId}`)?.value.trim()
    return custom || `m/44'/${chain.coinType}'/${account}'/0/0`
  }

  function buildAddressRow(label: string, address: string) {
    const row = make('div', 'bip39-address')
    row.append(make('span', 'bip39-address-label', label))
    row.append(make('code', 'bip39-address-value', address))
    const copy = make('button', 'bip39-copy')
    copy.type = 'button'
    copy.title = t('common.copy')
    copy.setAttribute('aria-label', `${t('common.copy')} ${address}`)
    copy.textContent = '⧉'
    copy.addEventListener('click', () => void copyText(address, t('toolUi.bip39.messages.copiedAddress')))
    row.append(copy)
    return row
  }

  function buildKeyRow(label: string, value: string, secret = false) {
    const row = make('div', 'bip39-key')
    row.append(make('span', 'bip39-key-label', label))
    const code = make('code', 'bip39-key-value')
    if (secret && !revealSecrets) {
      // The real value is deliberately left out of the DOM here; `lastEntries`
      // holds it and `renderChains` puts it back only after an explicit reveal.
      code.classList.add('bip39-key-masked')
      code.textContent = '•'.repeat(32)
    } else {
      code.textContent = value
    }
    row.append(code)
    return row
  }

  function buildChainBlock(entry: DerivedEntry) {
    const block = make('div', 'bip39-chain')
    block.dataset.chain = entry.chain.id

    const head = make('div', 'bip39-chain-head')
    const title = make('div', 'bip39-chain-title')
    title.append(make('strong', 'bip39-chain-symbol', entry.chain.symbol))
    title.append(make('span', 'bip39-chain-name', t(CHAIN_KEYS[entry.chain.id])))
    head.append(title)
    head.append(make('code', 'bip39-chain-path', entry.path))
    block.append(head)

    const addresses = make('div', 'bip39-address-list')
    for (const item of entry.addresses) {
      addresses.append(buildAddressRow(t(FORMAT_KEYS[item.format]), item.address))
    }
    block.append(addresses)

    const keys = make('div', 'bip39-key-grid')
    keys.append(buildKeyRow(t('toolUi.bip39.keys.privateKey'), entry.privateKey, true))
    keys.append(buildKeyRow(t('toolUi.bip39.keys.accountXprv'), entry.accountXprv, true))
    keys.append(buildKeyRow(t('toolUi.bip39.keys.accountXpub'), entry.accountXpub))
    keys.append(buildKeyRow(t('toolUi.bip39.keys.publicKey'), entry.publicKey))
    keys.append(buildKeyRow(t('toolUi.bip39.keys.publicKeyCompressed'), entry.publicKeyCompressed))
    keys.append(buildKeyRow(t('toolUi.bip39.keys.fingerprint'), entry.fingerprint))
    block.append(keys)

    return block
  }

  function renderWarnings() {
    if (!warningList) return
    warningList.replaceChildren()
    const notes = [
      t('toolUi.bip39.warnings.neverShare'),
      t('toolUi.bip39.warnings.offlineOnly'),
      t('toolUi.bip39.warnings.translatedSeed')
    ]
    for (const note of notes) warningList.append(make('li', '', note))
  }

  /** Rebuilds the chain blocks, e.g. after the reveal toggle changes. */
  let lastEntries: DerivedEntry[] = []
  function renderChains() {
    if (!chainList) return
    chainList.replaceChildren()
    for (const entry of lastEntries) chainList.append(buildChainBlock(entry))
  }

  async function derive() {
    if (!currentMnemonic) {
      showError(errorBox, t('toolUi.bip39.errors.noMnemonic'))
      return
    }
    const list = await words(currentLanguage)
    if (!validateMnemonic(currentMnemonic, list).valid) {
      showError(errorBox, t('toolUi.bip39.errors.invalidMnemonic'))
      return
    }
    clearError(errorBox)
    const account = readAccount()

    // The seed stays inside this function; only its fingerprint is ever shown.
    const seed = mnemonicToSeed(currentMnemonic, passphrase?.value ?? '')

    const entries: DerivedEntry[] = []
    for (const chain of chains) {
      const fallback = `m/44'/${chain.coinType}'/${account}'/0/0`
      try {
        entries.push(deriveChainEntry(seed, chain, pathFor(chain.id, account), account))
      } catch {
        // A malformed custom path should not blank the whole table; fall back
        // to the chain default and let the field keep showing the mistake.
        entries.push(deriveChainEntry(seed, chain, fallback, account))
      }
    }
    lastEntries = entries
    renderChains()

    const addressTotal = entries.reduce((sum, entry) => sum + entry.addresses.length, 0)
    setText(statChains, String(entries.length))
    setText(statAddresses, String(addressTotal))
    setText(statSeed, `${seed.length * 8} ${t('toolUi.bip39.bitsUnit')}`)
    setText(statFingerprint, entries[0]?.fingerprint ?? '—')
    setText(resultStatus, t('toolUi.bip39.statusDerived').replace('{count}', String(entries.length)))
    toggleHidden(resultCard, false)
    renderWarnings()
    recordUsage()
  }

  // --- wiring ---------------------------------------------------------------

  generateButton?.addEventListener('click', () => void generate())
  clearButton?.addEventListener('click', clearAll)
  convertSelect?.addEventListener('change', () => void refreshConversion())
  strengthSelect?.addEventListener('change', () => void generate())

  resetPaths?.addEventListener('click', () => {
    for (const chain of chains) {
      const field = el<HTMLInputElement>(root, `#bip39-path-${chain.id}`)
      if (field) field.value = ''
    }
    scheduleDerive(0)
  })

  passphrase?.addEventListener('input', () => scheduleDerive())
  accountInput?.addEventListener('input', () => scheduleDerive())
  for (const chain of chains) {
    el(root, `#bip39-path-${chain.id}`)?.addEventListener('input', () => scheduleDerive())
  }

  revealButton?.addEventListener('click', () => {
    revealSecrets = !revealSecrets
    revealButton.setAttribute('aria-pressed', String(revealSecrets))
    setText(revealLabel, t(revealSecrets ? 'toolUi.bip39.hideKeys' : 'toolUi.bip39.revealKeys'))
    renderChains()
  })

  copyMnemonic?.addEventListener('click', () => void copyText(currentMnemonic, t('toolUi.bip39.messages.copiedMnemonic')))
  copyEntropy?.addEventListener('click', () => void copyText(currentEntropyHex, t('toolUi.bip39.messages.copiedEntropy')))

  let inputTimer = 0
  input?.addEventListener('input', () => {
    window.clearTimeout(inputTimer)
    inputTimer = window.setTimeout(() => void adoptMnemonic(input.value), 200)
  })

  // Derivation is automatic, so Ctrl/Cmd+Enter is only a manual re-run.
  root.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      void derive()
    }
  })

  renderMnemonic()
  renderWarnings()
}

document.addEventListener('astro:page-load', init)
init()
