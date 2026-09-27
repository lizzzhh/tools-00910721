import {
  bip39LanguageLabels,
  completionOptions,
  bip39Languages,
  bip39Separators,
  bip39Strengths,
  convertMnemonic,
  detectLanguage,
  findWordCandidates,
  findWordPosition,
  generateMnemonic,
  inspectMnemonic,
  isBip39Language,
  loadWordlist,
  loadWordlistIndex,
  readingOf,
  mnemonicToSeed,
  splitMnemonic,
  tokenizeMnemonic,
  validateMnemonic,
  type Bip39Language,
  type Bip39Strength,
  type MnemonicWordSpan,
  type WordlistIndex
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
 * Canonical-form lookup tables, held both as promises (so concurrent callers
 * share one fetch) and as resolved values (so the per-keystroke checks can stay
 * synchronous).
 */
const wordIndexCache = new Map<Bip39Language, Promise<WordlistIndex>>()
const wordIndexes = new Map<Bip39Language, WordlistIndex>()
/** True once all four lists have resolved. The live checks wait for this. */
let everyListReady = false

function wordIndex(language: Bip39Language): Promise<WordlistIndex> {
  const ready = wordIndexes.get(language)
  if (ready) return Promise.resolve(ready)
  const cached = wordIndexCache.get(language)
  if (cached) return cached
  const pending = loadWordlistIndex(language).then((index) => {
    wordIndexes.set(language, index)
    if (wordIndexes.size === bip39Languages.length) everyListReady = true
    return index
  })
  wordIndexCache.set(language, pending)
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
  const editor = el<HTMLElement>(root, '.bip39-editor')
  const highlight = el<HTMLElement>(root, '#bip39-highlight')
  const caretRuler = el<HTMLElement>(root, '#bip39-caret-ruler')
  const suggest = el<HTMLElement>(root, '#bip39-suggest')
  const suggestList = el<HTMLElement>(root, '#bip39-candidates')
  const suggestLabel = el<HTMLElement>(root, '#bip39-suggest-label')
  const suggestHint = el<HTMLElement>(root, '#bip39-suggest-hint')
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

  /** True while an IME composition is in flight; the marks and popup wait for it. */
  let composing = false
  // True while the open list is checksum completions rather than spelling
  // candidates, which changes what applying one does: there is no word under the
  // caret to replace, so the word is appended instead.
  let completionMode = false
  /** Candidate words currently offered, and which one the keyboard has reached. */
  let suggestOptions: string[] = []
  let optionIndex = -1

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

  // --- mnemonic editor ------------------------------------------------------

  /**
   * The word the caret sits in, or null when it sits in a run of separators.
   *
   * A caret exactly on the trailing edge of a word still counts as being in it,
   * so the popup stays up for the word just typed; the next word only claims the
   * caret once a separator has been typed, because then the offsets differ.
   */
  function activeSpan(spans: MnemonicWordSpan[], caret: number): MnemonicWordSpan | null {
    for (const span of spans) {
      if (caret >= span.start && caret <= span.end) return span
    }
    return null
  }

  /**
   * Rebuilds the layer that sits behind the textarea.
   *
   * Every character of the value is written back out — the separators included —
   * because the textarea is what holds the text, and this layer is only a
   * picture of it. Dropping the whitespace would reflow the picture and slide
   * the marks away from the words.
   */
  function paintHighlight(
    value: string,
    spans: MnemonicWordSpan[],
    flagged: number[],
    skip: number | null
  ) {
    if (!highlight) return
    const bad = new Set(flagged)
    const fragment = document.createDocumentFragment()
    let cursor = 0
    for (const span of spans) {
      if (span.start > cursor) fragment.append(value.slice(cursor, span.start))
      if (bad.has(span.index) && span.index !== skip) {
        fragment.append(make('mark', 'bip39-word-bad', span.text))
      } else {
        fragment.append(span.text)
      }
      cursor = span.end
    }
    if (cursor < value.length) fragment.append(value.slice(cursor))
    // The textarea keeps a line box for the position past its last character;
    // this sentinel gives the picture the same final line box.
    fragment.append('\n')
    highlight.replaceChildren(fragment)
    highlight.scrollTop = input?.scrollTop ?? 0
    highlight.scrollLeft = input?.scrollLeft ?? 0
  }

  /** Every bundled list that contains a word, in declared language order. */
  function listsWith(word: string): Bip39Language[] {
    const found: Bip39Language[] = []
    for (const language of bip39Languages) {
      const index = wordIndexes.get(language)
      if (index && findWordPosition(word, index) >= 0) found.push(language)
    }
    return found
  }

  /**
   * The list the candidate popup should draw from.
   *
   * The select says which wordlist the user is generating *into*, which is not
   * necessarily the one being pasted. When the word is missing from the selected
   * list but sits in exactly one other, that other list is what is actually
   * being typed — so the popup follows the word rather than the control, and a
   * Chinese or Japanese paste still gets useful suggestions without the user
   * having to find the language dropdown first.
   */
  function candidateList(word: string, selected: Bip39Language): Bip39Language {
    const current = wordIndexes.get(selected)
    if (current && findWordPosition(word, current) >= 0) return selected
    const owners = listsWith(word)
    return owners.length === 1 ? owners[0] : selected
  }

  function closeSuggest() {
    completionMode = false
    suggestOptions = []
    optionIndex = -1
    suggestList?.replaceChildren()
    toggleHidden(suggest, true)
    input?.setAttribute('aria-expanded', 'false')
    input?.removeAttribute('aria-activedescendant')
  }

  /**
   * Keeps the highlighted option inside the scrolling list.
   *
   * The list is capped at 13rem, so arrowing down past the eighth candidate
   * would otherwise walk the selection off the top of the popup and leave the
   * highlighted word invisible. The scroll is set on the list element directly
   * rather than through `scrollIntoView`, which would also scroll the page and
   * drag the field out from under the popup.
   */
  function revealOption(position: number) {
    const list = suggestList
    if (!list) return
    const item = list.children[position] as HTMLElement | undefined
    if (!item) return
    const top = item.offsetTop
    if (top < list.scrollTop) {
      list.scrollTop = top
    } else if (top + item.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = top + item.offsetHeight - list.clientHeight
    }
  }

  /** Moves the keyboard highlight, or clears it with a negative index. */
  function setSelectedOption(next: number) {
    optionIndex = next
    const items = suggestList?.children ?? []
    for (let position = 0; position < items.length; position += 1) {
      items[position].setAttribute('aria-selected', String(position === next))
    }
    if (next >= 0) revealOption(next)
    if (!input) return
    if (next < 0) input.removeAttribute('aria-activedescendant')
    else input.setAttribute('aria-activedescendant', `bip39-candidate-${next}`)
  }

  /**
   * Anchors the popup to the caret.
   *
   * The caret's line and column cannot be derived arithmetically, because soft
   * wrapping makes the column depend on the rendered width of everything before
   * it. So the ruler holds a copy of the text up to the caret with a zero-width
   * marker at the end, and that marker is measured instead.
   */
  function placeSuggest() {
    if (!suggest || !caretRuler || !editor || !input) return
    const value = input.value
    const marker = document.createElement('span')
    marker.textContent = '\u200b'
    caretRuler.replaceChildren(value.slice(0, input.selectionStart ?? value.length), marker)

    const markerBox = marker.getBoundingClientRect()
    const editorBox = editor.getBoundingClientRect()
    const lineHeight = markerBox.height || Number.parseFloat(getComputedStyle(input).lineHeight) || 20
    // The textarea scrolls its own content and the ruler does not, so the scroll
    // offset has to come back out or the popup drifts on a long paste.
    const top = markerBox.top - editorBox.top - input.scrollTop
    const left = markerBox.left - editorBox.left - input.scrollLeft

    const width = suggest.offsetWidth
    const height = suggest.offsetHeight
    // Flip above the caret line when the space below is too short, which is the
    // common case near the bottom of a 12rem field on a phone.
    const below = top + lineHeight
    const flip = below + height > editorBox.height && top - height >= 0
    suggest.style.left = `${Math.min(Math.max(0, left), Math.max(0, editorBox.width - width))}px`
    suggest.style.top = flip ? `${top - height}px` : `${below}px`
  }

  /**
   * The candidates that would leave the mnemonic valid if applied.
   *
   * While the last word is being typed the ordinary candidates are spelling
   * matches, and most of them leave the checksum wrong — so a tick next to the
   * few that do finish it is the difference between a spelling aid and an answer.
   *
   * Empty unless the word under the caret is the last one, and unless the
   * candidates come from the same wordlist as the rest of the mnemonic: a tick on
   * a word from another list would promise a valid mnemonic that does not exist.
   */
  function checksumTicking(options: string[], active: MnemonicWordSpan, language: Bip39Language): string[] {
    if (!input) return []
    const spans = tokenizeMnemonic(input.value)
    if (active.index !== spans.length - 1) return []
    const wordlists = bip39Languages.flatMap((entry) => {
      const found = wordIndexes.get(entry)
      return found ? [{ language: entry, words: found.words }] : []
    })
    const prefix = `${spans
      .slice(0, active.index)
      .map((span) => span.text)
      .join(' ')} `
    const found = completionOptions(prefix, prefix.length, wordlists, language)
    if (!found || found.language !== language) return []
    return options.filter((word) => found.options.includes(word))
  }

  function renderSuggest(active: MnemonicWordSpan | null) {
    if (composing || !input) {
      closeSuggest()
      return
    }
    // No word under the caret is the gap after the last separator, which is
    // where a checksum completion is offered.
    if (!active) {
      renderCompletion()
      return
    }
    const language = candidateList(active.text, selectedLanguage())
    const index = wordIndexes.get(language)
    if (!index) {
      closeSuggest()
      return
    }
    // A word already in the list needs no completion. Offering the word the user
    // just finished typing as a "candidate" is noise, not help.
    const options = findWordPosition(active.text, index) >= 0 ? [] : findWordCandidates(active.text, index)
    if (options.length === 0) {
      closeSuggest()
      return
    }
    // Which of these would finish the mnemonic, if any. Only the last word can:
    // a candidate in any earlier position leaves the wrong number of words, so
    // nothing completes and there is nothing to mark.
    const completing = new Set(checksumTicking(options, active, language))
    const fragment = document.createDocumentFragment()
    // A candidate reached by typing Latin is only useful if the user can see why
    // it was offered, so the reading it matched is spelled out beside it. Han
    // candidates were typed as Han and need no gloss.
    const byReading = /^[a-z]+$/.test(active.text)
    options.forEach((word, position) => {
      const reading = byReading ? readingOf(word, index) : ''
      const item = make('li', 'bip39-suggest-option', word)
      if (reading) {
        const gloss = make('span', 'bip39-suggest-reading', reading)
        gloss.dir = 'ltr'
        item.append(gloss)
      }
      if (completing.has(word)) item.append(make('span', 'bip39-suggest-check', '\u2713'))
      item.id = `bip39-candidate-${position}`
      item.setAttribute('role', 'option')
      item.setAttribute('aria-selected', 'false')
      fragment.append(item)
    })
    suggestList?.replaceChildren(fragment)
    suggestOptions = options
    // The completion list rewrites these, so they have to be put back. The hint
    // only mentions the tick once there is a tick to explain.
    setText(suggestLabel, t('toolUi.bip39.suggestLabel'))
    setText(suggestHint, t(completing.size > 0 ? 'toolUi.bip39.suggestTickHint' : 'toolUi.bip39.suggestHint'))
    // The first candidate starts highlighted, so Enter accepts it straight away
    // without a preliminary arrow press. The list only opens while the word under
    // the caret is *not* yet a valid one, so there is always something to accept
    // and the default is the closest match by construction.
    setSelectedOption(0)
    toggleHidden(suggest, false)
    input.setAttribute('aria-expanded', 'true')
    placeSuggest()
  }

  /**
   * The list shown when the caret is parked in the gap after the last separator,
   * one word short of a valid length.
   *
   * Every word in it completes the mnemonic so the checksum matches, so this is
   * a shortcut to a valid mnemonic rather than a spelling aid. Typing at all
   * makes the caret land inside a word, which routes back to the ordinary
   * candidates — that is what "ignore the checksum and keep typing" amounts to
   * here, and it needs no state of its own to notice.
   */
  function renderCompletion() {
    completionMode = false
    if (!input || !everyListReady) return
    // The decision lives in the lib so it can be tested: this is the branch that
    // decides whether a popup appears at all, and getting it wrong either hides a
    // completion or interrupts ordinary typing with one.
    const found = completionOptions(
      input.value,
      input.selectionStart ?? input.value.length,
      bip39Languages.flatMap((language) => {
        const index = wordIndexes.get(language)
        return index ? [{ language, words: index.words }] : []
      }),
      selectedLanguage()
    )
    if (!found) return
    const options = found.options
    const fragment = document.createDocumentFragment()
    options.forEach((word, position) => {
      const item = make('li', 'bip39-suggest-option', word)
      // A tick, because a word from this list is valid the moment it lands where
      // the caret is. The hint under the list says the same in words, so the tick
      // itself says nothing extra to a screen reader and is hidden from one.
      item.append(make('span', 'bip39-suggest-check', '✓'))
      item.id = `bip39-candidate-${position}`
      item.setAttribute('role', 'option')
      item.setAttribute('aria-selected', 'false')
      fragment.append(item)
    })
    suggestList?.replaceChildren(fragment)
    suggestOptions = options
    completionMode = true
    setText(suggestLabel, t('toolUi.bip39.suggestCompleteLabel'))
    setText(suggestHint, t('toolUi.bip39.suggestCompleteHint'))
    setSelectedOption(0)
    toggleHidden(suggest, false)
    input.setAttribute('aria-expanded', 'true')
    placeSuggest()
  }

  /**
   * Repaints the marks and the popup. Runs on every keystroke, so it stays on
   * hash lookups and a single pass over an already-normalised wordlist.
   *
   * `marks: false` is the IME path. The overlay is still rebuilt — the
   * textarea's own glyphs are transparent, so a stale overlay would be the only
   * thing on screen — but nothing is flagged and no popup opens, because the
   * text under the caret is a candidate phrase rather than a word.
   */
  function renderEditor(options: { marks?: boolean } = {}) {
    if (!input) return
    const value = input.value
    const spans = tokenizeMnemonic(value)
    const caret = input.selectionStart ?? value.length
    const active = activeSpan(spans, caret)
    const marksWanted = options.marks !== false && !composing
    if (!marksWanted) {
      paintHighlight(value, spans, [], null)
      return
    }
    // A word is only a typo if *no* bundled list has it. Checking all four is
    // what makes this field usable for the CJK wordlists: marking 一 as a mistake
    // because the select still reads English would be wrong on nearly every
    // paste. Until all four have resolved, nothing is marked rather than
    // something marked against the wrong list.
    //
    // Which words to mark comes from the same inspection that writes the error
    // message, so the two can never describe different problems. Beyond a plain
    // typo that means the words pulled in from a second list get marked too:
    // saying "these come from different wordlists" without showing which is a
    // puzzle the user has to solve by eye.
    let flagged: number[] = []
    let skip: number | null = null
    if (everyListReady) {
      const fault = inspectMnemonic(
        spans.map((span) => span.text),
        listsWith
      )
      flagged = fault.indices
      // The word under the caret is normally still being typed, and flagging it
      // on every keypress reads as a broken field rather than as feedback — so
      // an unrecognised word there is left unmarked. A word from another list is
      // not that case: it is already a whole, valid word, no keystroke will turn
      // it into the one that was wanted, and the caret sits on the last word after
      // a paste. Leaving that one unmarked is how "these words come from different
      // wordlists, N are marked" could appear under a field with nothing marked.
      if (fault.reason === 'unknown') skip = active?.index ?? null
    }
    paintHighlight(value, spans, flagged, skip)
    setText(wordCount, String(spans.length))
    renderSuggest(active)
  }

  /** Replaces the word under the caret with a candidate, or appends a completion. */
  function applyCandidate(position = optionIndex) {
    const word = suggestOptions[position]
    if (!word || !input) return
    if (completionMode) {
      // There is no word under the caret to replace — the caret is parked in the
      // gap — so the word goes in at the caret with a separator after it, which
      // leaves the mnemonic complete and ready for the next one.
      const caret = input.selectionStart ?? input.value.length
      input.setRangeText(`${word} `, caret, caret, 'end')
      closeSuggest()
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return
    }
    const spans = tokenizeMnemonic(input.value)
    const active = activeSpan(spans, input.selectionStart ?? input.value.length)
    if (!active) return
    // A word span always stops at a separator or at the end of the field, so the
    // only case that needs a gap is the end of the field: applying a candidate to
    // the last word would otherwise leave the next keystroke glued to it. A word
    // that already has a separator after it gets nothing — a second space would
    // only be a stray one to clean up.
    const trailing = input.value.slice(active.end)
    const suffix = trailing === '' ? ' ' : ''
    // `setRangeText` swaps exactly the active word and leaves the caret after it.
    // It fires no `input` event, so one is raised by hand to keep the rest of
    // the panel in step.
    input.setRangeText(word + suffix, active.start, active.end, 'end')
    closeSuggest()
    input.dispatchEvent(new Event('input', { bubbles: true }))
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
      // Valid by construction, so no word is ever marked, but the count and the
      // popup still have to catch up with a value that changed without typing.
      await wordIndex(language)
      renderEditor()
      renderMnemonic()
      void refreshConversion()
      scheduleDerive(0)
      recordUsage()
    } catch {
      showError(errorBox, t('toolUi.bip39.errors.generateFailed'))
    }
  }

  /**
   * Explains why a mnemonic did not validate, rather than reporting that some
   * number of words are unknown.
   *
   * The causes need different remedies, and lumping them together leaves the
   * user guessing which one they have:
   *
   * - a word count that is not a BIP39 length means the paste was truncated,
   *   doubled, or was never a mnemonic;
   * - a word in no list has to be retyped, and the position and the word itself
   *   say which one;
   * - words drawn from more than one list can never validate, and no amount of
   *   retyping fixes that;
   * - a full set of individually valid words that still fails means the *order*
   *   is wrong, which is a different mistake entirely and the one most likely to
   *   be misread as a typo.
   */
  function diagnoseMnemonic(parts: string[]): string {
    const { reason, indices } = inspectMnemonic(parts, listsWith)
    if (reason === 'wordCount') {
      return t('toolUi.bip39.errors.wordCount').replace('{count}', String(parts.length))
    }
    if (reason === 'unknown') {
      return t('toolUi.bip39.errors.unknownWordAt')
        .replace('{count}', String(indices.length))
        .replace('{index}', String(indices[0] + 1))
        .replace('{word}', parts[indices[0]])
    }
    if (reason === 'mixed') {
      return t('toolUi.bip39.errors.mixedLanguages').replace('{count}', String(indices.length))
    }
    return t('toolUi.bip39.errors.checksum')
  }

  /** Detects which bundled wordlist a pasted mnemonic uses, then adopts it. */
  async function adoptMnemonic(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) {
      currentMnemonic = ''
      currentEntropyHex = ''
      clearError(errorBox)
      renderMnemonic()
      renderEditor()
      return
    }
    const parts = splitMnemonic(trimmed)
    setText(wordCount, String(parts.length))

    try {
      // Spreading the index gives `detectLanguage` the `words` it asks for, and
      // resolves all four lists so the live checks can mark words from here on.
      const loaded = await Promise.all(
        bip39Languages.map(async (language) => ({ language, ...(await wordIndex(language)) }))
      )
      const language = detectLanguage(trimmed, loaded)
      if (!language) {
        // Keep the words visible so they can be checked or corrected by hand.
        currentMnemonic = parts.join(' ')
        currentEntropyHex = ''
        showError(errorBox, diagnoseMnemonic(parts))
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
    } finally {
      renderEditor()
    }
  }

  function clearAll() {
    window.clearTimeout(deriveTimer)
    currentMnemonic = ''
    currentEntropyHex = ''
    if (input) input.value = ''
    closeSuggest()
    renderEditor()
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
  input?.addEventListener('input', (event) => {
    // `isComposing` is the flag that says an IME is mid-phrase, and it is not on
    // the `Event` lib.dom types the `input` event with, hence the narrowing. It
    // is kept alongside the tracked flag because some IMEs emit an `input` after
    // `compositionend` has already fired.
    const isComposing = composing || (event as InputEvent).isComposing === true
    // Three of the four wordlists are CJK, so the field has to stay usable under
    // an IME. While a candidate phrase is being composed, the overlay is still
    // repainted — the textarea's own glyphs are transparent, so a stale overlay
    // would be the only thing on screen — but nothing is marked and no popup
    // opens, because the text under the caret is not a word yet.
    if (isComposing) {
      renderEditor({ marks: false })
      return
    }
    renderEditor()
    window.clearTimeout(inputTimer)
    inputTimer = window.setTimeout(() => void adoptMnemonic(input.value), 200)
  })

  input?.addEventListener('compositionstart', () => {
    composing = true
    closeSuggest()
  })

  input?.addEventListener('compositionend', () => {
    composing = false
    renderEditor()
  })

  input?.addEventListener('blur', () => {
    // An IME does not reliably deliver `compositionend`: losing focus can end a
    // composition without it, and some platforms never report the paste of CJK
    // text as a composition at all. A flag left set is not a cosmetic problem —
    // it silently switches off every mark and the candidate popup for the rest of
    // the session, with the field looking perfectly healthy and no error to
    // explain it. Losing focus is a hard boundary on any composition, so treat it
    // as one here rather than waiting for an event that may not come.
    composing = false
    closeSuggest()
    renderEditor()
  })

  input?.addEventListener('keydown', (event) => {
    if (composing || event.isComposing || suggestOptions.length === 0) return
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setSelectedOption((optionIndex + 1) % suggestOptions.length)
        return
      case 'ArrowUp':
        event.preventDefault()
        setSelectedOption((optionIndex - 1 + suggestOptions.length) % suggestOptions.length)
        return
      case 'Enter':
      case 'Tab':
        // The first candidate is highlighted from the moment the list opens, so
        // either key applies it without an arrow press first. Over a word, the
        // list is only open while that word is not a valid one, so there is
        // always a correction on offer and never a valid word to overwrite. The
        // checksum-completion list is open with no word under the caret at all,
        // and appends rather than replaces.
        if (optionIndex < 0) return
        event.preventDefault()
        applyCandidate()
        return
      case 'Escape':
        event.preventDefault()
        closeSuggest()
        return
      default:
    }
  })

  // Pointer events rather than click: a plain `mousedown` would blur the field
  // and lose the caret, and the caret is what says which word to replace.
  suggestList?.addEventListener('pointerdown', (event) => {
    const item = (event.target as Element | null)?.closest<HTMLElement>('.bip39-suggest-option')
    if (!item) return
    event.preventDefault()
    applyCandidate(Number(item.id.replace('bip39-candidate-', '')))
  })

  suggestList?.addEventListener('pointerover', (event) => {
    const item = (event.target as Element | null)?.closest<HTMLElement>('.bip39-suggest-option')
    if (item) setSelectedOption(Number(item.id.replace('bip39-candidate-', '')))
  })

  input?.addEventListener('scroll', () => {
    if (!highlight) return
    highlight.scrollTop = input.scrollTop
    highlight.scrollLeft = input.scrollLeft
    if (suggestOptions.length > 0) placeSuggest()
  })

  // The caret also moves on arrow keys, a click or a drag, none of which fire
  // `input`, and the popup follows it.
  document.addEventListener('selectionchange', () => {
    if (document.activeElement !== input) return
    renderEditor()
  })

  // Not captured, so this is the page's own scroll and not the field's: the
  // field handles its own above. Moving the page would leave the popup behind.
  window.addEventListener('scroll', () => closeSuggest(), { passive: true })
  window.addEventListener('resize', () => {
    if (suggestOptions.length > 0) placeSuggest()
  })


  // Derivation is automatic, so Ctrl/Cmd+Enter is only a manual re-run.
  root.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      void derive()
    }
  })

  // Prime the selected list so the first keystroke can offer candidates without
  // waiting on a ~50 KB wordlist fetch. The remaining three load on the first
  // edit, which is when the marks start needing them.
  void wordIndex(selectedLanguage())
  renderMnemonic()
  renderWarnings()
}

document.addEventListener('astro:page-load', init)
init()
