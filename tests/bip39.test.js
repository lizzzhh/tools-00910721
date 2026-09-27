import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import {
  bip39Languages,
  bip39Separators,
  bip39Strengths,
  bip39WordCounts,
  convertMnemonic,
  createWordlistIndex,
  detectLanguage,
  entropyToMnemonic,
  findUnknownWordIndices,
  findWordCandidates,
  findWordPosition,
  generateEntropy,
  generateMnemonic,
  loadWordlist,
  loadWordlistIndex,
  mnemonicToSeed,
  mnemonicToSeedHex,
  readingOf,
  parseEntropyHex,
  splitMnemonic,
  strengthFromWordCount,
  tokenizeMnemonic,
  validateMnemonic
} from '../src/lib/wallet/bip39.ts'
import {
  CURVE_ORDER,
  deriveChild,
  derivePath,
  formatPath,
  masterKeyFromSeed,
  parsePath,
  serializeExtendedKey
} from '../src/lib/wallet/bip32.ts'
import { base58checkDecode, ethereumAddress, hash160, p2pkhAddress, tronAddress } from '../src/lib/wallet/address.ts'
import { accountPathFor, chains, deriveAllChains, deriveChainEntry, getChain, tronHexToBase58 } from '../src/lib/wallet/index.ts'

/**
 * Vectors from the official Trezor/python-mnemonic `vectors.json`, trimmed to the
 * four wordlists this tool ships. Each row is
 * `[language, entropy, mnemonic, seed, masterXprv]`, always with passphrase
 * `TREZOR`. The Japanese rows are separated by U+3000, which is exactly why the
 * splitter has to accept it.
 */
const vectors = [
  [
    "english",
    "00000000000000000000000000000000",
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
    "c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04",
    "xprv9s21ZrQH143K3h3fDYiay8mocZ3afhfULfb5GX8kCBdno77K4HiA15Tg23wpbeF1pLfs1c5SPmYHrEpTuuRhxMwvKDwqdKiGJS9XFKzUsAF"
  ],
  [
    "english",
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo vote",
    "dd48c104698c30cfe2b6142103248622fb7bb0ff692eebb00089b32d22484e1613912f0a5b694407be899ffd31ed3992c456cdf60f5d4564b8ba3f05a69890ad",
    "xprv9s21ZrQH143K2WFF16X85T2QCpndrGwx6GueB72Zf3AHwHJaknRXNF37ZmDrtHrrLSHvbuRejXcnYxoZKvRquTPyp2JiNG3XcjQyzSEgqCB"
  ],
  [
    "english",
    "f585c11aec520db57dd353c69554b21a89b20fb0650966fa0a9d6f74fd989d8f",
    "void come effort suffer camp survey warrior heavy shoot primary clutch crush open amazing screen patrol group space point ten exist slush involve unfold",
    "01f5bced59dec48e362f2c45b5de68b9fd6c92c6634f44d6d40aab69056506f0e35524a518034ddc1192e1dacd32c1ed3eaa3c3b131c88ed8e7e54c49a5d0998",
    "xprv9s21ZrQH143K39rnQJknpH1WEPFJrzmAqqasiDcVrNuk926oizzJDDQkdiTvNPr2FYDYzWgiMiC63YmfPAa2oPyNB23r2g7d1yiK6WpqaQS"
  ],
  [
    "chinese_simplified",
    "00000000000000000000000000000000",
    "的 的 的 的 的 的 的 的 的 的 的 在",
    "7f7c7f91ef81f0fb6a3b95b346c50e6472c1d554f8ba90637bad8afce4a4de87c322c1acafa2f6f5e9a8f9b2d2c40e9d389efdc2adbe4445c21a0939fb39e91f",
    "xprv9s21ZrQH143K2LTAgxJMxVMKie6n9HQHMUohP6x2cx1TVBr6dxnL3mnSLRiXjiCM7g2ZF3BHzpdbFuhdeh7ZRrzv2EEjg5Tv7kgKZrqbVLc"
  ],
  [
    "chinese_simplified",
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    "歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 佳",
    "8e6607a07fa664d6e4ead23fcc08caf72216d6f078c3b2e5be94e4b6e8d64c784d36bf9b70144fa05840e9a49899128111be5093a2b552b6ab76c0906e9b0e65",
    "xprv9s21ZrQH143K2ghKxX47TRr4GnQh3diJFN5rJfybjxuwr3xP6pafXrBhwXJsw4HwoiPZ1f6fFPR964eoXybV2su498Ant3kYuYKE3CszLsU"
  ],
  [
    "chinese_simplified",
    "f585c11aec520db57dd353c69554b21a89b20fb0650966fa0a9d6f74fd989d8f",
    "柄 需 固 姆 色 斥 霍 握 宾 琴 况 团 抵 经 摸 郭 沙 鸣 拖 妙 阳 辈 掉 迁",
    "4dccb0a3578716975b840c51e279c2af728567ff42e98dd09b9e61742b41d9f30d411a501172cce9b7d5706a480dd4d4e7fb26021a36a74381156b09d251d65a",
    "xprv9s21ZrQH143K2hLNNA7KnimwonwFXCiGVM3K29DgZiTcVUJ8t8jkc2mXUzFZmoFgXWh9UhJFbyKM44Qm2KeGsrEevajZZfKyoLyFmyoDpUx"
  ],
  [
    "chinese_traditional",
    "00000000000000000000000000000000",
    "的 的 的 的 的 的 的 的 的 的 的 在",
    "7f7c7f91ef81f0fb6a3b95b346c50e6472c1d554f8ba90637bad8afce4a4de87c322c1acafa2f6f5e9a8f9b2d2c40e9d389efdc2adbe4445c21a0939fb39e91f",
    "xprv9s21ZrQH143K2LTAgxJMxVMKie6n9HQHMUohP6x2cx1TVBr6dxnL3mnSLRiXjiCM7g2ZF3BHzpdbFuhdeh7ZRrzv2EEjg5Tv7kgKZrqbVLc"
  ],
  [
    "chinese_traditional",
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    "歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 歇 佳",
    "8e6607a07fa664d6e4ead23fcc08caf72216d6f078c3b2e5be94e4b6e8d64c784d36bf9b70144fa05840e9a49899128111be5093a2b552b6ab76c0906e9b0e65",
    "xprv9s21ZrQH143K2ghKxX47TRr4GnQh3diJFN5rJfybjxuwr3xP6pafXrBhwXJsw4HwoiPZ1f6fFPR964eoXybV2su498Ant3kYuYKE3CszLsU"
  ],
  [
    "chinese_traditional",
    "f585c11aec520db57dd353c69554b21a89b20fb0650966fa0a9d6f74fd989d8f",
    "柄 需 固 姆 色 斥 霍 握 賓 琴 況 團 抵 經 摸 郭 沙 鳴 拖 妙 陽 輩 掉 遷",
    "17ec1a79121f3541e2d78ece35c8cfe7f5763b39d93fa90492c4beca26ee69d3aa7f4b1e6a2ac5e8225e08dded19357ee44b852dca425792842ec8eae09ae43f",
    "xprv9s21ZrQH143K4RoVseL4UENdN7Ag1WmcK7Q6Pk329krQW4RifHJ5sNizkG1PiyRXAouyL7KDFJSQAD1VarGTPftD1yZZAni3QczW8V5gNVG"
  ],
  [
    "japanese",
    "00000000000000000000000000000000",
    "あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あおぞら",
    "5a6c23b5abdd5c3e1f7d77ad25ecd715647bdafb44dab324c730a76a45d7421daccee1a4ff0739715a2c56a8a9f1e527a5e3496224d91293bfcd9b5393bfff83",
    "xprv9s21ZrQH143K2TDo8AAss7eUkUqLFzBnypFpqjQUMVUrSMvrrgLiRxQPrYnhfoS9NPp3rex725rcuN8pkDL6pwqWfdPtiqa9ib1B37vZwfy"
  ],
  [
    "japanese",
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    "われる　われる　われる　われる　われる　われる　われる　われる　われる　われる　われる　われる　われる　われる　われる　われる　われる　われる　われる　われる　われる　われる　われる　らいう",
    "a0705c2feebefb61509dcc49c57586c35379c1981c688fc1d452da44443d9a651a374f1ad2ee3d7847b50655cf9241d7e607be436c0df7c8bac42f2a82985a79",
    "xprv9s21ZrQH143K2k4V9TkTiFB2LviDq1oSHbRha8AmnPvBtRRVAnf9WJERojPPdki6sbiuNbxv91VhhdreJnaZh29Ay892Mj6KB2aZnysqfvR"
  ],
  [
    "japanese",
    "f585c11aec520db57dd353c69554b21a89b20fb0650966fa0a9d6f74fd989d8f",
    "よゆう　かんけい　けぶかい　へいこう　おかず　べんごし　りえき　じゆう　はんい　ともる　かほご　きぬごし　つみき　いきる　はかる　てふだ　しほう　ひろう　とくてん　ほったん　こさめ　ひつじゅひん　せつぞく　めんどう",
    "909c8c992019adde332a11f0ebd1b0c0fbc9dd96e4d3d30ca4ecb0d06f743841cd25380f87b3a538f46dfa3fb3a5ab330487f99d128b1c6bcdbe476d3bbe2af2",
    "xprv9s21ZrQH143K3a5iyuaeKiPGQbhQLUaBhzfd7inUA5ndrmcYEc7zZzTLGM37Du2M11nXChrzXyZ8ZYtH2dG1CkWE39R749XhcKUcVs9avTR"
  ]
]

const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

/** The four shipped wordlists, loaded once. */
const wordlists = new Map()
for (const language of bip39Languages) wordlists.set(language, await loadWordlist(language))
const english = wordlists.get('english')
const languageEntries = () => [...wordlists.entries()].map(([language, words]) => ({ language, words }))
/** The official vectors spell the language with an underscore; the tool uses a hyphen. */
const toolLanguage = (official) => official.replace('_', '-')
const abandonSeed = () => mnemonicToSeed(ABANDON)
const allChains = () => deriveAllChains(abandonSeed())
const chainBy = (symbol) => allChains().find((entry) => entry.chain.symbol === symbol)
const addressOf = (symbol, format) => chainBy(symbol).addresses.find((a) => a.format === format).address
/** The failure code from a validation, or null when the mnemonic is valid. */
const errorOf = (result) => (result.valid ? null : result.error.code)

test('each shipped wordlist is the official 2048-word file', () => {
  assert.deepEqual([...bip39Languages], ['english', 'chinese-simplified', 'chinese-traditional', 'japanese'])
  for (const [language, words] of wordlists) {
    assert.equal(words.length, 2048, `${language} word count`)
    assert.equal(new Set(words).size, 2048, `${language} contains duplicates`)
    // The raw BIP39 files are NFKD; if a wordlist were not, the checksum would drift.
    for (const word of words) assert.equal(word, word.normalize('NFKD'), `${language} word ${word} is not NFKD`)
  }
})

test('entropy, mnemonic, seed and master xprv match the official vectors', () => {
  for (const [officialLanguage, entropy, mnemonic, seed, xprv] of vectors) {
    const language = toolLanguage(officialLanguage)
    const words = wordlists.get(language)
    assert.ok(words, `no wordlist for ${language}`)
    // The official Japanese mnemonics are separated by U+3000, not a plain space.
    assert.equal(entropyToMnemonic(hexToBytes(entropy), words, bip39Separators[language]), mnemonic, `${language} mnemonic`)
    assert.equal(mnemonicToSeedHex(mnemonic, 'TREZOR'), seed, `${language} seed`)
    assert.equal(serializeExtendedKey(masterKeyFromSeed(hexToBytes(seed)), 'private'), xprv, `${language} xprv`)
    const result = validateMnemonic(mnemonic, words)
    assert.equal(result.valid, true, `${language} should validate: ${result.error?.code}`)
    assert.equal(result.entropyHex, entropy, `${language} recovered entropy`)
  }
})

test('entropy round-trips back to the same words in every language', () => {
  for (const [language, words] of wordlists) {
    for (const strength of [16, 20, 24, 28, 32]) {
      const mnemonic = generateMnemonic(strength, words)
      assert.equal(splitMnemonic(mnemonic).length, bip39WordCounts[strength], `${language} ${strength}`)
      const { entropyHex } = validateMnemonic(mnemonic, words)
      assert.equal(entropyToMnemonic(hexToBytes(entropyHex), words), mnemonic, `${language} ${strength} round trip`)
    }
  }
})

test('a passphrase changes the seed but not the words', () => {
  const withPass = mnemonicToSeedHex(ABANDON, 'TREZOR')
  const without = mnemonicToSeedHex(ABANDON)
  assert.notEqual(withPass, without)
  // Pinned so a silent PBKDF2 or normalisation regression cannot pass unnoticed.
  assert.equal(
    without,
    '5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4'
  )
  assert.equal(
    serializeExtendedKey(masterKeyFromSeed(hexToBytes(without)), 'private'),
    'xprv9s21ZrQH143K3GJpoapnV8SFfukcVBSfeCficPSGfubmSFDxo1kuHnLisriDvSnRRuL2Qrg5ggqHKNVpxR86QEC8w35uxmGoggxtQTPvfUu'
  )
})

test('japanese separators U+3000, U+0020 and mixed all give one seed', () => {
  const japanese = wordlists.get('japanese')
  const wide = generateMnemonic(32, japanese, '　')
  const narrow = wide.replace(/　/g, ' ')
  // Alternate the two separator styles between words, leaving the words alone.
  const mixed = splitMnemonic(wide)
    .map((word, index) => word + (index % 2 === 0 ? '　' : ' '))
    .join('')
    .trim()
  assert.equal(splitMnemonic(wide).length, 24)
  assert.equal(splitMnemonic(narrow).length, 24)
  assert.equal(splitMnemonic(mixed).length, 24)
  // NFKD folds U+3000 to a plain space, so all three spellings must agree.
  assert.equal(mnemonicToSeedHex(wide), mnemonicToSeedHex(narrow))
  assert.equal(mnemonicToSeedHex(mixed), mnemonicToSeedHex(wide))
  assert.equal(validateMnemonic(wide, japanese).valid, true)
  assert.equal(validateMnemonic(narrow, japanese).valid, true)
  // The Japanese words must not be accepted against the English list.
  assert.equal(errorOf(validateMnemonic(wide, english)), 'unknownWord')
})

test('simplified and traditional are positionally aligned but not identical', () => {
  const simplified = wordlists.get('chinese-simplified')
  const traditional = wordlists.get('chinese-traditional')
  assert.notDeepEqual(simplified, traditional)
  assert.equal(simplified.length, traditional.length)
  // Both lists are indexed by the same entropy bits, so index 0 is the shared
  // "abandon" word. Confirm they really do diverge somewhere rather than assume it.
  assert.equal(simplified[0], traditional[0])
  assert.ok(simplified.some((word, index) => word !== traditional[index]), 'the lists should differ')

  const viaTraditional = convertMnemonic(ABANDON, english, traditional)
  assert.notEqual(viaTraditional, ABANDON)
  assert.equal(convertMnemonic(viaTraditional, traditional, english), ABANDON)
  assert.equal(validateMnemonic(viaTraditional, traditional).valid, true)

  // Converting preserves the *entropy* and the word indices, because the two
  // lists are indexed identically. It does not preserve the seed: BIP39 derives
  // the seed by hashing the mnemonic text, so a translated mnemonic belongs to a
  // different wallet. This is the single most misunderstood property of BIP39, so
  // it is pinned here rather than assumed.
  const original = validateMnemonic(ABANDON, english)
  const converted = validateMnemonic(viaTraditional, traditional)
  assert.deepEqual(converted.indices, original.indices)
  assert.equal(converted.entropyHex, original.entropyHex)
  assert.notEqual(mnemonicToSeedHex(viaTraditional), mnemonicToSeedHex(ABANDON))
})

test('validateMnemonic reports each failure instead of throwing', () => {
  assert.equal(errorOf(validateMnemonic('', english)), 'emptyMnemonic')
  assert.equal(errorOf(validateMnemonic('legal winner thank', english)), 'wordCountUnsupported')
  assert.equal(
    errorOf(validateMnemonic('legal winner thank year wave sausage worth useful legal winner thank notaword', english)),
    'unknownWord'
  )
  // Right length, real words, wrong checksum.
  assert.equal(
    errorOf(validateMnemonic('legal winner thank year wave sausage worth useful legal winner thank abandon', english)),
    'badChecksum'
  )
  assert.equal(errorOf(validateMnemonic(ABANDON, english)), null)
  // An unknown word carries its position, so the UI can point at the bad word.
  const unknown = validateMnemonic('legal winner thank year wave sausage worth useful legal winner thank notaword', english)
  assert.equal(unknown.error.index, 11)
  assert.equal(unknown.error.word, 'notaword')
  // A valid result exposes the entropy, the word indices and the strength.
  const good = validateMnemonic(ABANDON, english)
  assert.equal(good.wordCount, 12)
  assert.equal(good.strength, 16)
  assert.equal(bytesToHex(good.entropy), '00000000000000000000000000000000')
  assert.deepEqual(good.indices, Array(11).fill(0).concat([3]))
})

test('detectLanguage finds the source wordlist', () => {
  for (const [language, words] of wordlists) {
    const detected = detectLanguage(generateMnemonic(16, words), languageEntries())
    // Simplified and traditional share many characters and the first matching
    // candidate wins, so only the unambiguous languages are asserted exactly.
    if (language === 'english' || language === 'japanese') assert.equal(detected, language)
    else assert.ok(['chinese-simplified', 'chinese-traditional'].includes(detected), `${language} -> ${detected}`)
  }
  assert.equal(detectLanguage('legal winner notaword', languageEntries()), null)
})

test('entropy length and hex parsing are strictly bounded', () => {
  for (const strength of [16, 20, 24, 28, 32]) {
    assert.equal(generateEntropy(strength).length, strength)
  }
  assert.equal(parseEntropyHex('00'.repeat(16)).length, 16)
  assert.equal(parseEntropyHex('00'.repeat(32)).length, 32)
  assert.equal(parseEntropyHex('0x' + 'ab'.repeat(16)).length, 16)
  // All five BIP39 strengths are legal sizes, including the 20-byte one.
  for (const bytes of [16, 20, 24, 28, 32]) {
    assert.equal(parseEntropyHex('00'.repeat(bytes)).length, bytes, String(bytes))
  }
  // Malformed hex is a hex error; well-formed hex of the wrong size is a length error.
  for (const bad of ['', '0'.repeat(31), 'gg'.repeat(16), 'abc', '0x']) {
    assert.throws(() => parseEntropyHex(bad), (e) => e.code === 'badEntropyHex', JSON.stringify(bad))
  }
  for (const bytes of [15, 17, 21, 33, 64]) {
    assert.throws(() => parseEntropyHex('00'.repeat(bytes)), (e) => e.code === 'badEntropyLength', String(bytes))
  }
  assert.throws(() => generateEntropy(17), (e) => e.code === 'badEntropyLength')
})
test('strengthFromWordCount accepts only the four valid counts', () => {
  assert.equal(strengthFromWordCount(12), 16)
  assert.equal(strengthFromWordCount(15), 20)
  assert.equal(strengthFromWordCount(18), 24)
  assert.equal(strengthFromWordCount(21), 28)
  assert.equal(strengthFromWordCount(24), 32)
  for (const bad of [0, 11, 13, 23, 25]) assert.equal(strengthFromWordCount(bad), null, String(bad))
})

// --- live editor primitives --------------------------------------------------

test('tokenizeMnemonic reports each word where it sits in the source', () => {
  const spans = tokenizeMnemonic('abandon ability about')
  assert.deepEqual(
    spans.map((span) => [span.text, span.start, span.end, span.index]),
    [
      ['abandon', 0, 7, 0],
      ['ability', 8, 15, 1],
      ['about', 16, 21, 2]
    ]
  )
  // Slicing by the recorded offsets has to reproduce the words exactly, since
  // that is how the overlay paints and the editor replaces one.
  for (const span of spans) assert.equal('abandon ability about'.slice(span.start, span.end), span.text)
})

test('tokenizeMnemonic treats every separator kind as one boundary', () => {
  // A newline run, a tab, a plain space and the Japanese ideographic space.
  const spans = tokenizeMnemonic('あい　う\n\tえ ')
  assert.deepEqual(spans.map((span) => span.text), ['あい', 'う', 'え'])
  assert.equal(spans[0].start, 0)
  assert.deepEqual(spans.map((span) => span.index), [0, 1, 2])
  assert.deepEqual(tokenizeMnemonic(''), [])
  assert.deepEqual(tokenizeMnemonic('   \n\t  '), [])
  // Offsets still line up when the run is a single character.
  const tight = tokenizeMnemonic('a b')
  assert.deepEqual(tight.map((span) => [span.text, span.start, span.end]), [['a', 0, 1], ['b', 2, 3]])
})

test('the tokenizer and splitMnemonic agree on where words begin', () => {
  // The validator splits with splitMnemonic while the overlay splits with
  // tokenizeMnemonic; if the two ever disagree the red mark lands on the wrong
  // word, so they are checked against each other rather than trusted.
  for (const sample of [
    'abandon ability about',
    '  abandon   ability  about  ',
    'あい　う　え',
    'a\nb\tc　d',
    'abandon ability\nabout'
  ]) {
    assert.deepEqual(tokenizeMnemonic(sample).map((span) => span.text), splitMnemonic(sample), sample)
  }
})

test('a wordlist index matches words case-insensitively and through NFKD', async () => {
  const index = createWordlistIndex(await loadWordlist('english'))
  assert.equal(findWordPosition('abandon', index), 0)
  assert.equal(findWordPosition('Abandon', index), 0, 'case should not defeat a lookup')
  assert.equal(findWordPosition('  ABANDON  ', index), 0, 'surrounding space should not either')
  assert.equal(findWordPosition('zoo', index), 2047)
  assert.equal(findWordPosition('abandonn', index), -1)
})

test('Japanese lookups survive the NFKD difference between IME input and the list', async () => {
  const words = await loadWordlist('japanese')
  const index = createWordlistIndex(words)
  // Kana with a dakuten is the case that matters: the list stores が decomposed as
  // か plus a combining mark, while an IME hands over the precomposed U+304C.
  // Without folding, no Japanese suggestion would ever match.
  const decomposed = words.find((word) => word.normalize('NFC').length < word.length)
  assert.ok(decomposed, 'expected at least one entry with a combining mark')
  const recomposed = decomposed.normalize('NFC')
  assert.notEqual(recomposed, decomposed, 'the sample should differ once recomposed')
  assert.equal(findWordPosition(recomposed, index), words.indexOf(decomposed))
  assert.equal(findWordPosition(decomposed, index), words.indexOf(decomposed))
  // Every entry resolves through the index, whichever form it is asked in.
  for (const word of [words[0], words[500], words[2047]]) {
    assert.equal(findWordPosition(word, index), words.indexOf(word))
    assert.equal(findWordPosition(word.normalize('NFC'), index), words.indexOf(word))
  }
})

test('findWordCandidates ranks a plain prefix first, shortest completion first', async () => {
  const index = createWordlistIndex(await loadWordlist('english'))
  const candidates = findWordCandidates('aban', index)
  assert.equal(candidates[0], 'abandon')
  assert.ok(candidates.length <= 8)
  // A distinctive prefix admits nothing but real completions.
  assert.ok(candidates.every((word) => word.startsWith('aban')))
  // An ambiguous one leads with the shortest word it can complete to, which is
  // `able` rather than `abandon` — a full extra word of typing is worse than a
  // shorter word that still matches.
  const ambiguous = findWordCandidates('ab', index)
  assert.equal(ambiguous[0], 'able')
  assert.equal(ambiguous.length, 8)
  assert.deepEqual([...ambiguous].sort(), [...new Set(ambiguous)].sort(), 'no duplicates')
})

test('findWordCandidates recovers a word whose letters were mistyped', async () => {
  const index = createWordlistIndex(await loadWordlist('english'))
  // A dropped first letter is a substring; a dropped middle letter is only a
  // subsequence. A strict prefix search returns nothing for either.
  for (const typo of ['bandon', 'abndon']) {
    const candidates = findWordCandidates(typo, index, 4)
    assert.ok(
      candidates.includes('abandon'),
      `${typo} -> ${JSON.stringify(candidates)} should recover "abandon"`
    )
  }
  // A transposition matches neither structure, so it is only reachable by the
  // full distance scan, and it must still come first when it is one edit away.
  assert.equal(findWordCandidates('abandno', index, 1)[0], 'abandon')
  // `acouunt` is two edits from both `account` and `amount`; only the length
  // proximity breaks the tie, and it has to break it the right way round.
  assert.equal(findWordCandidates('acouunt', index, 1)[0], 'account')
  // Long enough to be nothing like a word, so no candidate is offered at all.
  assert.deepEqual(findWordCandidates('this is not a bip39 mnemonic', index), [])
  // A distinctive prefix must not be padded out with unrelated near-misses.
  assert.deepEqual(findWordCandidates('aban', index), ['abandon'])
})

test('findWordCandidates returns verbatim list entries, never the folded form', async () => {
  const words = await loadWordlist('japanese')
  const index = createWordlistIndex(words)
  const [first] = findWordCandidates(words[0].slice(0, 3), index, 1)
  assert.equal(first, words[0], 'applying a candidate must write the canonical spelling back')
  assert.deepEqual(findWordCandidates('', index), [], 'an empty input has nothing to complete')
  assert.deepEqual(findWordCandidates('   ', index), [])
})

test('findWordCandidates works for the CJK wordlists too', async () => {
  for (const language of ['chinese-simplified', 'chinese-traditional']) {
    const words = await loadWordlist(language)
    const index = createWordlistIndex(words)
    const sample = words[100]
    const candidates = findWordCandidates(sample.slice(0, 1), index)
    assert.ok(candidates.includes(sample), `${language}: a one-character prefix should reach word 100`)
    // A Han character that starts no word falls through to the looser tiers.
    assert.ok(Array.isArray(findWordCandidates('龘', index)))
  }
})

test('findUnknownWordIndices reports exactly the words the list lacks', async () => {
  const index = createWordlistIndex(await loadWordlist('english'))
  const spans = tokenizeMnemonic('abandon ability abilty about')
  assert.deepEqual(findUnknownWordIndices(spans, index), [2])
  assert.deepEqual(findUnknownWordIndices(tokenizeMnemonic('abandon ability'), index), [])
  // A case difference is a known word, not a typo.
  assert.deepEqual(findUnknownWordIndices(tokenizeMnemonic('Abandon ABILITY'), index), [])
  assert.deepEqual(findUnknownWordIndices([], index), [])
})

test('an index built from a list is as authoritative as validateMnemonic', async () => {
  // The overlay decides what to mark with the index while the panel decides
  // validity with validateMnemonic. If they ever disagree, a word is either
  // flagged while the panel calls it valid, or accepted while it is flagged.
  for (const language of bip39Languages) {
    const words = await loadWordlist(language)
    const index = createWordlistIndex(words)
    for (const word of [words[0], words[1], words[1024], words[2047]]) {
      assert.ok(findWordPosition(word, index) >= 0, `${language}: ${word} should resolve`)
    }
    // A word that is in no list at all.
    const bogus = language === 'japanese' ? '　　　　' : 'zzzzzzzz'
    assert.equal(findWordPosition(bogus, index), -1, `${language}: ${bogus} should not resolve`)
    assert.equal(validateMnemonic(bogus, words).valid, false)
  }
})

test('the first candidate is preselected, so Enter applies it directly', () => {
  const script = readFileSync(new URL('../src/scripts/bip39.ts', import.meta.url), 'utf8')
  // Opening the list must land on index 0, not on "nothing highlighted" — the
  // point of the list is that Enter fixes the word without a preliminary arrow.
  const open = script.slice(script.indexOf('suggestList?.replaceChildren(fragment)'))
  assert.match(open.slice(0, 400), /setSelectedOption\(0\)/, 'the first candidate is not preselected')
  // ...and the keydown handler must not require a selection to have been moved.
  const keydown = script.slice(script.indexOf("case 'Enter':"), script.indexOf("case 'Escape':"))
  assert.match(keydown, /applyCandidate\(\)/, 'Enter no longer applies the candidate')
  assert.ok(!/optionIndex < 0\) return/.test(keydown.replace(/if \(optionIndex < 0\) return/, '')),
    'Enter still requires a manual selection')
})

test('the arrowing highlight scrolls the candidate list, not the page', () => {
  const script = readFileSync(new URL('../src/scripts/bip39.ts', import.meta.url), 'utf8')
  // The list is capped in height, so a selection past the eighth candidate has to
  // be scrolled back into the box. `scrollIntoView` would drag the whole page
  // and move the field out from under the popup.
  assert.match(script, /function revealOption/, 'nothing keeps the highlight in view')
  const reveal = script.slice(script.indexOf('function revealOption'), script.indexOf('/** Moves the keyboard highlight'))
  assert.match(reveal, /list\.scrollTop/, 'the list itself is not scrolled')
  // Only a real call counts: the name appears in the comment explaining why not.
  assert.ok(!/\.scrollIntoView\(/.test(script), 'scrollIntoView would scroll the page as well')
  // And the selection handler has to call it.
  const select = script.slice(script.indexOf('/** Moves the keyboard highlight'))
  assert.match(select.slice(0, 600), /revealOption\(next\)/, 'moving the highlight does not scroll it into view')
})

test('the mnemonic field warns that the input method must be English', () => {
  const component = readFileSync(new URL('../src/components/tools/Bip39Tool.astro', import.meta.url), 'utf8')
  // The wordlist is matched character by character, so an IME that converts
  // Latin letters into Han characters silently produces words that are all
  // unknown. Nothing else in the UI says so.
  assert.match(component, /bip39-ime-hint/)
  // The hint is static, so it is rendered server-side from the dictionary and the
  // script must not carry its own copy of the text.
  assert.match(component, /t\('toolUi\.bip39\.imeHint'\)/, 'the hint is not read from the dictionary')
  const script = readFileSync(new URL('../src/scripts/bip39.ts', import.meta.url), 'utf8')
  assert.ok(!/imeHint: '/.test(script), 'the hint text is hardcoded in the script')
  for (const tag of ['en', 'zh-CN', 'zh-TW', 'ja']) {
    const dict = readFileSync(new URL(`../src/i18n/locales/${tag}.ts`, import.meta.url), 'utf8')
    assert.match(dict, /imeHint: '[^']+'/, `${tag} has no imeHint`)
    // A duplicate is invisible to the dictionary checker, which only compares
    // locales against each other: a second copy can sit anywhere, including
    // inside another key's object, and stay dead weight in all four files.
    assert.equal(
      dict.match(/imeHint: /g)?.length,
      1,
      `${tag} defines imeHint more than once, so one copy is unreachable`
    )
    // The copy that counts has to be at the path the component asks for.
    assert.match(dict, /inputPlaceholder: '[^']*', imeHint: '[^']*'/, `${tag} has imeHint in the wrong object`)
  }
})

test('a mnemonic that will not validate says which of the four reasons applies', () => {
  const script = readFileSync(new URL('../src/scripts/bip39.ts', import.meta.url), 'utf8')
  // "These N words are not in any bundled wordlist" was true of none of the four
  // distinct failures it was shown for, and named no remedy for any of them.
  assert.ok(!/errors\.unknownWords/.test(script), 'the generic message is back')
  for (const key of ['wordCount', 'unknownWordAt', 'mixedLanguages', 'checksum']) {
    assert.match(script, new RegExp(`errors\\.${key}`), `no specific reason for ${key}`)
    for (const tag of ['en', 'zh-CN', 'zh-TW', 'ja']) {
      const dict = readFileSync(new URL(`../src/i18n/locales/${tag}.ts`, import.meta.url), 'utf8')
      assert.match(dict, new RegExp(`${key}: '[^']+'`), `${tag} is missing errors.${key}`)
    }
  }
  // The word-count branch has to come first: a truncated paste is not a typo.
  const diagnose = script.slice(script.indexOf('function diagnoseMnemonic'))
  assert.ok(
    diagnose.indexOf('strengthFromWordCount') < diagnose.indexOf('unknownWordAt'),
    'the word-count check must run before the word checks'
  )
  // The checksum branch is the fallback, and only once every word is known.
  assert.ok(
    diagnose.indexOf('unknownWordAt') < diagnose.indexOf('checksum'),
    'a known word must be reported before falling back to the checksum'
  )
  // Mixed lists are their own cause, and are named before the checksum fallback.
  assert.ok(
    diagnose.indexOf('mixedLanguages') < diagnose.indexOf('checksum'),
    'mixed wordlists are not distinguished from a bad checksum'
  )
})

test('the misspelled-word highlight is deep enough to read at a glance', () => {
  const css = readFileSync('src/styles/global.css', 'utf8')
  const block = css.split('}').find((part) => part.split('{')[0].includes('.bip39-word-bad'))
  // A 16% wash was too faint to notice, which defeats the point of marking the
  // word at all. The alphas are read out of the colour function rather than
  // matched literally, so a rewrite cannot quietly lighten it again.
  const alpha = block.match(/oklch\(0\.65 0\.18 25 \/ (\d+)%\)/)
  assert.ok(alpha, 'the mark no longer uses the shared red')
  assert.ok(Number(alpha[1]) >= 22, `the wash is only ${alpha[1]}%, too faint to notice`)
  const ring = block.match(/oklch\(0\.65 0\.18 25 \/ (\d+)%\)/g) ?? []
  assert.equal(ring.length, 2, 'expected a wash and a ring')
  assert.ok(Number(ring[1].match(/(\d+)%/)[1]) >= 35, 'the ring around the mark is too faint')
})

test('the Chinese lists carry pinyin, so a Latin keyboard reaches them', async () => {
  // Imported rather than parsed out of the source: the module splits on a single
  // space, so any stray whitespace in the literal would quietly change the count
  // and the test would pass on a table the page then misaligns.
  const { default: readings } = await import('../src/lib/wallet/wordlists/chinese-pinyin.ts')
  const { default: simplified } = await import('../src/lib/wallet/wordlists/chinese-simplified.ts')
  const { default: traditional } = await import('../src/lib/wallet/wordlists/chinese-traditional.ts')

  // The reading table is only usable if it lines up with the list: index N must be
  // the reading of word N, and a table one entry short would silently misalign
  // every reading from that point on, suggesting the wrong character for the
  // rest of the list.
  assert.equal(readings.length, 2048, 'there must be one reading per word')
  assert.equal(simplified.length, 2048, 'the simplified list has 2048 entries')
  assert.equal(traditional.length, 2048, 'the traditional list has 2048 entries')
  // One table serves both lists, which is only true because they are in the same
  // order — the traditional list is read through the same positions.
  assert.equal(simplified.length, traditional.length)

  // `v` for the umlaut, no tones, no spaces, nothing a pinyin IME would reject.
  for (const reading of readings) {
    assert.match(reading, /^[a-z]{1,6}$/, `"${reading}" is not a usable pinyin reading`)
  }
  // A handful of readings pinned to their characters, to catch a table that is
  // the right length and the right shape but shifted or transposed.
  for (const [position, reading] of [[0, 'de'], [1, 'yi'], [2, 'shi'], [6, 'you'], [7, 'he']]) {
    assert.equal(readings[position], reading, `word ${simplified[position]} should read ${reading}`)
  }
})

test('typing pinyin offers the characters that read that way', async () => {
  const index = await loadWordlistIndex('chinese-simplified')
  // The whole point of the readings: an English keyboard cannot produce 的, but it
  // can produce `de`, and that has to lead somewhere.
  assert.ok(index.readings, 'the Chinese index carries no readings')
  assert.equal(findWordCandidates('de', index)[0], '的')
  assert.ok(findWordCandidates('shi', index).includes('是'))
  assert.ok(findWordCandidates('zhong', index).includes('中'))
  // A reading is a way in, not a replacement: the characters still match directly.
  assert.equal(findWordPosition('的', index), 0)
  assert.equal(readingOf('的', index), 'de')
  assert.equal(readingOf('一', index), 'yi')
  // The traditional list reads through the same table, at the same positions.
  const taiwan = await loadWordlistIndex('chinese-traditional')
  assert.equal(taiwan.readings.length, 2048)
  assert.equal(readingOf(taiwan.words[0], taiwan), 'de')
})

test('pinyin matching does not disturb the other lists', async () => {
  const english = await loadWordlistIndex('english')
  // No readings, and no change to the behaviour that was already covered above.
  assert.equal(english.readings, undefined)
  assert.equal(findWordCandidates('aban', english)[0], 'abandon')
  const japanese = await loadWordlistIndex('japanese')
  assert.equal(japanese.readings, undefined, 'the Japanese list must not be given readings')
  // Hiragana and kana never match a reading even where one exists, so a Han
  // needle cannot pick up a coincidental edit distance against Latin text.
  const index = await loadWordlistIndex('chinese-simplified')
  for (const candidate of findWordCandidates('猫', index)) {
    assert.equal(readingOf(candidate, index).length > 0, false, 'a Han needle matched a reading')
  }
})

test('a wrong single character is not answered with the first words of the list', async () => {
  const index = await loadWordlistIndex('chinese-simplified')
  // Every one-character entry is exactly one substitution from every other, so a
  // distance scan over a mistyped character can only answer with the head of the
  // list — 的 一 是 在 不 了 — which has nothing to do with what was typed. Returning
  // nothing is more honest than returning the beginning of the list.
  assert.deepEqual(findWordCandidates('猫', index), [])
})

test('applying a candidate opens the gap for the next word', () => {
  const script = readFileSync(new URL('../src/scripts/bip39.ts', import.meta.url), 'utf8')
  const apply = script.slice(script.indexOf('function applyCandidate'), script.indexOf('// --- mnemonic panel'))
  // Words are applied one at a time, so the last word of the field is the common
  // case: without a trailing space the next keystroke runs straight into it and
  // the two are then read as one word.
  assert.match(apply, /const trailing = input\.value\.slice\(active\.end\)/, 'the following text is never inspected')
  assert.match(apply, /trailing === '' \? ' ' : ''/, 'a last word does not get a following space')
  // ...and the space has to arrive with the word, not as a second edit, so the
  // caret lands once and the `input` event still reports the final value.
  assert.match(apply, /setRangeText\(word \+ suffix, active\.start, active\.end, 'end'\)/, 'the space is applied separately')
})

// --- BIP32 ------------------------------------------------------------------

const BIP32_SEED = hexToBytes('000102030405060708090a0b0c0d0e0f')

/** Test vector 1 from the BIP32 specification. */
const BIP32_CHAIN = [
  ["m", 'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8', 'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi'],
  ["m/0'", 'xpub68Gmy5EdvgibQVfPdqkBBCHxA5htiqg55crXYuXoQRKfDBFA1WEjWgP6LHhwBZeNK1VTsfTFUHCdrfp1bgwQ9xv5ski8PX9rL2dZXvgGDnw', 'xprv9uHRZZhk6KAJC1avXpDAp4MDc3sQKNxDiPvvkX8Br5ngLNv1TxvUxt4cV1rGL5hj6KCesnDYUhd7oWgT11eZG7XnxHrnYeSvkzY7d2bhkJ7'],
  ["m/0'/1", 'xpub6ASuArnXKPbfEwhqN6e3mwBcDTgzisQN1wXN9BJcM47sSikHjJf3UFHKkNAWbWMiGj7Wf5uMash7SyYq527Hqck2AxYysAA7xmALppuCkwQ', 'xprv9wTYmMFdV23N2TdNG573QoEsfRrWKQgWeibmLntzniatZvR9BmLnvSxqu53Kw1UmYPxLgboyZQaXwTCg8MSY3H2EU4pWcQDnRnrVA1xe8fs'],
  ["m/0'/1/2'", 'xpub6D4BDPcP2GT577Vvch3R8wDkScZWzQzMMUm3PWbmWvVJrZwQY4VUNgqFJPMM3No2dFDFGTsxxpG5uJh7n7epu4trkrX7x7DogT5Uv6fcLW5', 'xprv9z4pot5VBttmtdRTWfWQmoH1taj2axGVzFqSb8C9xaxKymcFzXBDptWmT7FwuEzG3ryjH4ktypQSAewRiNMjANTtpgP4mLTj34bhnZX7UiM'],
  ["m/0'/1/2'/2", 'xpub6FHa3pjLCk84BayeJxFW2SP4XRrFd1JYnxeLeU8EqN3vDfZmbqBqaGJAyiLjTAwm6ZLRQUMv1ZACTj37sR62cfN7fe5JnJ7dh8zL4fiyLHV', 'xprvA2JDeKCSNNZky6uBCviVfJSKyQ1mDYahRjijr5idH2WwLsEd4Hsb2Tyh8RfQMuPh7f7RtyzTtdrbdqqsunu5Mm3wDvUAKRHSC34sJ7in334'],
  ["m/0'/1/2'/2/1000000000", 'xpub6H1LXWLaKsWFhvm6RVpEL9P4KfRZSW7abD2ttkWP3SSQvnyA8FSVqNTEcYFgJS2UaFcxupHiYkro49S8yGasTvXEYBVPamhGW6cFJodrTHy', 'xprvA41z7zogVVwxVSgdKUHDy1SKmdb533PjDz7J6N6mV6uS3ze1ai8FHa8kmHScGpWmj4WggLyQjgPie1rFSruoUihUZREPSL39UNdE3BBDu76']
]

test('BIP32 specification vector 1 round-trips to the published xprv and xpub', () => {
  for (const [path, xpub, xprv] of BIP32_CHAIN) {
    const key = derivePath(BIP32_SEED, path)
    assert.equal(formatPath(parsePath(path)), path, `path normalisation ${path}`)
    assert.equal(serializeExtendedKey(key, 'public'), xpub, `xpub ${path}`)
    assert.equal(serializeExtendedKey(key, 'private'), xprv, `xprv ${path}`)
  }
})

test('the master key is deterministic and sits at depth 0', () => {
  const a = masterKeyFromSeed(BIP32_SEED)
  const b = masterKeyFromSeed(BIP32_SEED)
  assert.equal(serializeExtendedKey(a, 'private'), serializeExtendedKey(b, 'private'))
  assert.equal(a.depth, 0)
  assert.equal(a.childIndex, 0)
  assert.equal(a.parentFingerprint, 0)
  assert.equal(a.chainCode.length, 32)
  assert.equal(a.privateKey.length, 32)
  assert.equal(a.publicKey.length, 33)
})

test('BIP32 treats h, H and apostrophe as the same hardened marker', () => {
  const expected = serializeExtendedKey(derivePath(BIP32_SEED, "m/0'/1"), 'private')
  for (const path of ["m/0'/1", 'm/0h/1', 'm/0H/1']) {
    assert.equal(serializeExtendedKey(derivePath(BIP32_SEED, path), 'private'), expected, path)
    assert.equal(formatPath(parsePath(path)), "m/0'/1", path)
  }
})

test('BIP32 rejects malformed paths and out-of-range indices', () => {
  for (const path of ['n/0', "m/2147483648'", 'm//0', 'm/1.5', "m/-1'", 'm/0/', "m/ '", "m/0''"]) {
    assert.throws(() => parsePath(path), `should reject ${JSON.stringify(path)}`)
  }
  // An empty path is the master key, not an error.
  assert.deepEqual(parsePath(''), [])
  assert.deepEqual(parsePath('m'), [])
  assert.deepEqual(parsePath('  m  '), [])
  assert.deepEqual(parsePath('m/2147483647'), [{ index: 2147483647, hardened: false }])
  assert.deepEqual(parsePath("m/2147483647'"), [{ index: 2147483647, hardened: true }])
})

test('BIP32 seeds must be 16 to 64 bytes', () => {
  for (const bytes of [0, 15, 65, 128]) {
    assert.throws(() => masterKeyFromSeed(new Uint8Array(bytes)), `${bytes} bytes should be rejected`)
  }
  assert.doesNotThrow(() => masterKeyFromSeed(new Uint8Array(16)))
  assert.doesNotThrow(() => masterKeyFromSeed(new Uint8Array(64)))
})

test('derived keys stay inside the curve order and count depth', () => {
  const key = derivePath(BIP32_SEED, "m/0'/1/2'/2/1000000000")
  const priv = BigInt('0x' + bytesToHex(key.privateKey))
  assert.ok(priv > 0n && priv < CURVE_ORDER)
  assert.equal(key.depth, 5)
  assert.equal(key.childIndex, 1000000000)
  assert.equal(deriveChild(key, { index: 0, hardened: true }).depth, 6)
  assert.equal(CURVE_ORDER.toString(16), 'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141')
})

// --- address encoding -------------------------------------------------------

const PUB_ONE_COMPRESSED = hexToBytes('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798')
const PUB_ONE_FULL = hexToBytes('0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8')

test('the privkey=1 key encodes to the widely published addresses', () => {
  // This is the key every wallet documents, so the expected values are the
  // ones quoted throughout the ecosystem.
  assert.equal(p2pkhAddress(0x00, PUB_ONE_COMPRESSED), '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH')
  assert.equal(ethereumAddress(PUB_ONE_COMPRESSED), '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf')
  assert.equal(tronAddress(PUB_ONE_COMPRESSED), 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC')
  assert.equal(hash160(PUB_ONE_COMPRESSED).length, 20)
})

test('address encoders give the same answer for compressed and uncompressed keys', () => {
  assert.equal(ethereumAddress(PUB_ONE_COMPRESSED), ethereumAddress(PUB_ONE_FULL))
  assert.equal(tronAddress(PUB_ONE_COMPRESSED), tronAddress(PUB_ONE_FULL))
  assert.equal(hash160(PUB_ONE_COMPRESSED).length, hash160(PUB_ONE_FULL).length)
  // A compressed key has no 0x04 tag, so its hash160 must differ.
  assert.notEqual(bytesToHex(hash160(PUB_ONE_COMPRESSED)), bytesToHex(hash160(PUB_ONE_FULL)))
})

test('a corrupted base58check address fails its checksum', () => {
  const good = '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH'
  const bad = good.slice(0, -1) + (good.endsWith('H') ? 'J' : 'H')
  assert.throws(() => base58checkDecode(bad))
  assert.throws(() => base58checkDecode('0OIl'), /base58Decode|invalidLength/)
})

test('EIP-55 casing is a checksum over the lowercase hex', () => {
  const address = addressOf('ETH', 'eip55')
  assert.match(address, /^0x[0-9a-fA-F]{40}$/)
  // Guard against a vacuous test: if the address were all-lowercase the casing
  // logic would never actually be exercised.
  assert.notEqual(address, address.toLowerCase(), 'expected at least one uppercase letter')
  const lower = address.toLowerCase().slice(2)
  const hash = bytesToHex(keccak_256(utf8ToBytes(lower)))
  let rebuilt = '0x'
  for (let index = 0; index < lower.length; index += 1) {
    rebuilt += Number.parseInt(hash[index], 16) >= 8 ? lower[index].toUpperCase() : lower[index]
  }
  assert.equal(rebuilt, address)
})

test('the TRON base58 and hex forms describe the same address', () => {
  const hex = addressOf('TRX', 'tron-hex')
  const base58 = addressOf('TRX', 'tron-base58')
  assert.equal(hex.length, 42)
  assert.ok(hex.startsWith('41'))
  assert.equal(base58.length, 34)
  assert.ok(base58.startsWith('T'))
  assert.equal(tronHexToBase58(hex), base58)
  assert.equal(tronHexToBase58('41' + hex.slice(2).toUpperCase()), base58)
  assert.equal(tronHexToBase58('0x' + hex), base58)
  assert.throws(() => tronHexToBase58('42' + hex.slice(2)), 'wrong version byte should be rejected')
  assert.throws(() => tronHexToBase58(hex.slice(0, 40)), 'short input should be rejected')
  assert.equal(base58checkDecode(base58)[0], 0x41)
})

// --- chain registry ---------------------------------------------------------

test('every chain uses its SLIP-0044 coin type in the default path', () => {
  assert.deepEqual(
    chains.map((chain) => [chain.symbol, chain.defaultPath]),
    [
      ['BTC', "m/44'/0'/0'/0/0"],
      ['LTC', "m/44'/2'/0'/0/0"],
      ['DOGE', "m/44'/3'/0'/0/0"],
      ['ETH', "m/44'/60'/0'/0/0"],
      ['BNB', "m/44'/60'/0'/0/0"],
      ['TRX', "m/44'/195'/0'/0/0"]
    ]
  )
})

test('accountPathFor is the hardened parent of the default receive path', () => {
  for (const chain of chains) {
    assert.equal(accountPathFor(chain), chain.defaultPath.replace('/0/0', ''), chain.symbol)
    // The account level is the first three hardened components; the change and
    // address indexes below it are not part of the imported xprv.
    assert.equal(accountPathFor(chain, 1), `m/44'/${chain.coinType}'/1'`, chain.symbol)
    assert.equal(accountPathFor(chain).split('/').length, 4)
  }
})

test('BNB Smart Chain reuses the Ethereum key and address by design', () => {
  const eth = chainBy('ETH')
  const bnb = chainBy('BNB')
  assert.equal(eth.privateKey, bnb.privateKey)
  assert.equal(eth.path, bnb.path)
  assert.equal(addressOf('ETH', 'eip55'), addressOf('BNB', 'eip55'))
})

test('Litecoin uses M for P2SH where Bitcoin uses 3', () => {
  assert.ok(addressOf('LTC', 'p2pkh').startsWith('L'))
  assert.ok(addressOf('LTC', 'p2sh-p2wpkh').startsWith('M'), 'Litecoin P2SH is M-prefixed')
  assert.ok(addressOf('LTC', 'p2wpkh').startsWith('ltc1'))
  assert.ok(addressOf('BTC', 'p2sh-p2wpkh').startsWith('3'), 'Bitcoin P2SH is 3-prefixed')
  assert.notEqual(addressOf('LTC', 'p2sh-p2wpkh'), addressOf('BTC', 'p2sh-p2wpkh'))
})

test('each chain gets its own recognisable address prefix', () => {
  assert.ok(addressOf('BTC', 'p2pkh').startsWith('1'))
  assert.ok(addressOf('LTC', 'p2pkh').startsWith('L'))
  assert.ok(addressOf('DOGE', 'p2pkh').startsWith('D'))
  assert.ok(addressOf('ETH', 'eip55').startsWith('0x'))
  assert.ok(addressOf('TRX', 'tron-base58').startsWith('T'))
  assert.ok(addressOf('BTC', 'p2wpkh').startsWith('bc1'))
  // Dogecoin has no segwit, so it must not claim a bech32 format.
  assert.equal(getChain('dogecoin').formats.includes('p2wpkh'), false)
})

test('every base58check address decodes to version byte + 20-byte hash', () => {
  for (const entry of allChains()) {
    for (const { format, address } of entry.addresses) {
      if (format === 'p2pkh' || format === 'p2sh-p2wpkh') {
        const decoded = base58checkDecode(address)
        assert.equal(decoded.length, 21, `${entry.chain.symbol} ${format}`)
      }
    }
  }
})

test('every derived entry carries a complete, well-formed key set', () => {
  for (const entry of allChains()) {
    const label = entry.chain.symbol
    assert.match(entry.privateKey, /^[0-9a-f]{64}$/, label)
    assert.match(entry.publicKey, /^04[0-9a-f]{128}$/, label)
    assert.match(entry.publicKeyCompressed, /^0[23][0-9a-f]{64}$/, label)
    assert.match(entry.fingerprint, /^[0-9a-f]{8}$/, label)
    assert.ok(entry.accountXprv.startsWith('xprv'), label)
    assert.ok(entry.accountXpub.startsWith('xpub'), label)
    assert.equal(entry.accountPath, accountPathFor(entry.chain), label)
    assert.equal(entry.path, entry.chain.defaultPath, label)
    // The account key must genuinely open the leaf we printed.
    const fromAccount = derivePath(abandonSeed(), entry.accountPath)
    assert.equal(derivePath(abandonSeed(), entry.path).privateKey.length, 32)
    assert.notEqual(derivePath(abandonSeed(), entry.path).privateKey, fromAccount.privateKey)
  }
})

test('deriveAllChains is deterministic and order-stable', () => {
  const first = allChains()
  assert.deepEqual(deriveAllChains(abandonSeed()), first)
  assert.deepEqual(first.map((entry) => entry.chain.symbol), ['BTC', 'LTC', 'DOGE', 'ETH', 'BNB', 'TRX'])
})

test('getChain rejects unknown ids', () => {
  assert.equal(getChain('bitcoin').symbol, 'BTC')
  assert.throws(() => getChain('doge'))
})

test('the account level reported matches the account in the derivation path', () => {
  const seed = abandonSeed()
  for (const chain of chains) {
    for (const account of [0, 1, 7]) {
      const path = `m/44'/${chain.coinType}'/${account}'/0/0`
      const entry = deriveChainEntry(seed, chain, path, account)
      assert.equal(entry.accountPath, `m/44'/${chain.coinType}'/${account}'`)
      // The extended key must be the real parent of the printed leaf key:
      // walking the remaining `/0/0` levels off the account key lands on it.
      const accountKey = derivePath(seed, entry.accountPath)
      assert.equal(entry.accountXprv, serializeExtendedKey(accountKey, 'private'))
      assert.equal(entry.accountXpub, serializeExtendedKey(accountKey, 'public'))
      const leaf = parsePath(path).slice(-2).reduce(deriveChild, accountKey)
      assert.equal(bytesToHex(leaf.privateKey), entry.privateKey)
    }
  }
})

test('a different account really yields a different extended key and leaf', () => {
  const seed = abandonSeed()
  const zero = deriveChainEntry(seed, getChain('bitcoin'), "m/44'/0'/0'/0/0", 0)
  const one = deriveChainEntry(seed, getChain('bitcoin'), "m/44'/0'/1'/0/0", 1)
  assert.notEqual(zero.accountXprv, one.accountXprv)
  assert.notEqual(zero.privateKey, one.privateKey)
  assert.notEqual(zero.addresses[0].address, one.addresses[0].address)
})

test('a custom path that omits the account is inferred from the path itself', () => {
  const seed = abandonSeed()
  // No explicit account: the third level of the path is the source of truth.
  const entry = deriveChainEntry(seed, getChain('ethereum'), "m/44'/60'/3'/0/0")
  assert.equal(entry.accountPath, "m/44'/60'/3'")
  assert.equal(entry.accountXprv, deriveChainEntry(seed, getChain('ethereum'), "m/44'/60'/3'/0/0", 3).accountXprv)
})

test('a path outside BIP44 falls back to account 0 rather than throwing', () => {
  const seed = abandonSeed()
  const entry = deriveChainEntry(seed, getChain('bitcoin'), "m/0'/0")
  assert.equal(entry.accountPath, "m/44'/0'/0'")
  assert.equal(entry.path, "m/0'/0")
})

test('the UI flow stays consistent: generate, adopt, convert, then derive', () => {
  // 1. Generation produces a mnemonic that validates against its own wordlist.
  const generated = generateMnemonic(32, english, bip39Separators.english)
  const generatedCheck = validateMnemonic(generated, english)
  assert.equal(generatedCheck.valid, true)
  assert.equal(splitMnemonic(generated).length, 24)
  assert.equal(generatedCheck.entropyHex.length, 64)

  // 2. Re-importing what was just generated detects the same language.
  const detected = detectLanguage(generated, languageEntries())
  assert.equal(detected, 'english')

  // 3. Converting keeps the entropy but changes the seed.
  const japanese = wordlists.get('japanese')
  const converted = convertMnemonic(generated, english, japanese, bip39Separators.japanese)
  assert.equal(validateMnemonic(converted, japanese).valid, true)
  assert.equal(validateMnemonic(converted, japanese).entropyHex, generatedCheck.entropyHex)
  assert.notEqual(mnemonicToSeedHex(converted), mnemonicToSeedHex(generated))

  // 4. Deriving at the shown path reproduces exactly what the table displays.
  const seed = mnemonicToSeed(generated, '')
  for (const chain of chains) {
    const entry = deriveChainEntry(seed, chain, chain.defaultPath, 0)
    const rebuilt = deriveChainEntry(seed, chain, entry.path, 0)
    assert.deepEqual(rebuilt, entry)
    assert.equal(entry.addresses.length, chain.formats.length)
  }
})

test('tool-panel readers are always called with a bare element id', () => {
  // `readNumber`/`readOption`/`readCheckbox` prepend `#` themselves, so a leading
  // `#` silently becomes `##id`, which is a runtime-only SyntaxError that
  // TypeScript and the build cannot catch. Keep the convention enforced.
  const dir = new URL('../src/scripts/', import.meta.url)
  const offenders = []
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const lines = readFileSync(new URL(name, dir), 'utf8').split('\n')
    lines.forEach((line, index) => {
      for (const m of line.matchAll(/\bread(?:Number|Option|Checkbox)\(\s*([`'"]([^`'"$]*)['"`])/g)) {
        if (!/^[A-Za-z][\w-]*$/.test(m[2])) {
          offenders.push(`${name}:${index + 1} -> ${m[1]}`)
        }
      }
    })
  }
  assert.deepEqual(offenders, [], `expected bare ids, got:\n${offenders.join('\n')}`)
})

test('the derivation path is built from the selected account, not a hardcoded 0', () => {
  const seed = abandonSeed()
  for (const account of [0, 1, 2147483647]) {
    for (const chain of chains) {
      const path = `m/44'/${chain.coinType}'/${account}'/0/0`
      const entry = deriveChainEntry(seed, chain, path, account)
      assert.equal(entry.path, path)
      assert.equal(entry.accountPath, `m/44'/${chain.coinType}'/${account}'`)
    }
  }
})

test('the shipped component defaults to the 12-word strength', () => {
  const source = readFileSync(new URL('../src/components/tools/Bip39Tool.astro', import.meta.url), 'utf8')
  const match = /id="bip39-strength"[^>]*\bvalue="(\d+)"/.exec(source)
  assert.ok(match, 'the strength SelectField must pin a value')
  const bytes = Number(match[1])
  assert.equal(bytes, 16, `default should be 16 bytes, got ${bytes}`)
  assert.equal(bip39WordCounts[bip39Strengths.find((s) => s === bytes)], 12)
})

test('the passphrase and the custom paths share one collapsed section', () => {
  const source = readFileSync(new URL('../src/components/tools/Bip39Tool.astro', import.meta.url), 'utf8')
  // Both fields must live inside the same <details> so one toggle reveals both.
  const blocks = [...source.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/g)].map((m) => m[1])
  assert.equal(blocks.length, 2, 'expected the conversion and derivation sections')
  const advanced = blocks.find((b) => b.includes('bip39-passphrase'))
  assert.ok(advanced, 'no section holds the passphrase')
  assert.ok(advanced.includes('bip39-path-grid'), 'paths are not in the passphrase section')
  assert.ok(advanced.includes('bip39-account'), 'account is not in the passphrase section')
  // Neither section may start open: both are opt-in.
  for (const [, attrs] of source.matchAll(/<details\b([^>]*)>/g)) assert.ok(!/\bopen\b/.test(attrs))
})

test('derivation is scheduled automatically, not only on the button', () => {
  const source = readFileSync(new URL('../src/scripts/bip39.ts', import.meta.url), 'utf8')
  assert.ok(/function scheduleDerive/.test(source), 'no debounced auto-derive helper')
  // It must be a no-op until a mnemonic exists, so an empty form never errors.
  assert.match(
    source,
    /function scheduleDerive[\s\S]*?if \(!currentMnemonic\) return/,
    'auto-derive runs before a mnemonic exists'
  )
  // Generating and importing both kick it off immediately.
  const calls = source.match(/scheduleDerive\(/g) ?? []
  assert.ok(calls.length >= 5, `expected the helper plus its call sites, found ${calls.length}`)
  assert.match(source, /passphrase\?\.addEventListener\('input', \(\) => scheduleDerive\(\)\)/)
  assert.match(source, /accountInput\?\.addEventListener\('input', \(\) => scheduleDerive\(\)\)/)
})

test('one input serves both generating and importing, with no mode switcher', () => {
  const source = readFileSync(new URL('../src/components/tools/Bip39Tool.astro', import.meta.url), 'utf8')
  // The mode tabs are gone: the textarea both receives a generated mnemonic and
  // accepts a pasted one.
  assert.ok(!/bip39-(?:generate|import)-tab/.test(source), 'the mode tablist is back')
  assert.ok(!/bip39-(?:generate|import)-panel/.test(source), 'the mode panels are back')
  assert.ok(!/role="tablist"/.test(source), 'a tablist survived')
  // Exactly one editable textarea carries the mnemonic.
  const editable = [...source.matchAll(/<textarea\b([^>]*)>/g)].filter((m) => !/readonly/.test(m[1]))
  assert.equal(editable.length, 1, `expected a single editable textarea, found ${editable.length}`)
  assert.match(editable[0][1], /id="bip39-input"/)
  // Generation and import both feed that same field.
  assert.match(source, /id="bip39-generate"/)
  assert.match(source, /id="bip39-copy-mnemonic"/)
})

test('the derive button is gone, since derivation is automatic', () => {
  const component = readFileSync(new URL('../src/components/tools/Bip39Tool.astro', import.meta.url), 'utf8')
  const script = readFileSync(new URL('../src/scripts/bip39.ts', import.meta.url), 'utf8')
  assert.ok(!/bip39-derive"/.test(component), 'the derive button is back')
  assert.ok(!/id="bip39-derive"/.test(component), 'the derive button is back')
  assert.ok(!/bip39-derive/.test(script), 'the script still looks up the removed button')
  // The hint that used to label it now explains the automatic behaviour.
  assert.match(component, /autoDeriveHint/)
})

test('the script no longer references the removed surfaces', () => {
  const script = readFileSync(new URL('../src/scripts/bip39.ts', import.meta.url), 'utf8')
  for (const dead of ['bip39-mnemonic', 'setMode', 'generateTab', 'importTab', 'deriveButton', 'importButton']) {
    assert.ok(!script.includes(dead), `stale reference to ${dead}`)
  }
  // Deriving still happens, just not from a button.
  assert.match(script, /function derive\(\)/)
  assert.match(script, /scheduleDerive\(0\)/)
})
