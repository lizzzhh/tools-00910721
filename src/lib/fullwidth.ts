export type WidthMode = 'to-half' | 'to-full'

export type WidthResult = {
  ok: true
  output: string
  converted: number
}

const widthMap: Record<string, string> = {
  '。': '.',
  '，': ',',
  '、': ',',
  '．': '.',
  '：': ':',
  '；': ';',
  '？': '?',
  '！': '!',
  '（': '(',
  '）': ')',
  '［': '[',
  '］': ']',
  '｛': '{',
  '｝': '}',
  '「': '"',
  '」': '"',
  '『': '"',
  '』': '"',
  '“': '"',
  '”': '"',
  '‘': "'",
  '’': "'",
  '・': '·',
  '〜': '~',
  '－': '-',
  '＋': '+',
  '＝': '=',
  '＊': '*',
  '／': '/',
  '＼': '\\',
  '＆': '&',
  '％': '%',
  '＃': '#',
  '＠': '@',
  '＄': '$',
  '＾': '^',
  '｜': '|',
  '＜': '<',
  '＞': '>',
}

const katakanaMap: Record<string, string> = {
  'ァ': '',
  'ア': 'ｱ',
  'イ': 'ｲ',
  'ウ': 'ｳ',
  'エ': 'ｴ',
  'オ': 'ｵ',
  'カ': 'ｶ',
  'キ': 'ｷ',
  'ク': 'ｸ',
  'ケ': 'ｹ',
  'コ': 'ｺ',
  'サ': 'ｻ',
  'シ': 'ｼ',
  'ス': 'ｽ',
  'セ': 'ｾ',
  'ソ': 'ｿ',
  'タ': 'ﾀ',
  'チ': 'ﾁ',
  'ツ': 'ﾂ',
  'テ': 'ﾃ',
  'ト': 'ﾄ',
  'ナ': 'ﾅ',
  'ニ': 'ﾆ',
  'ヌ': 'ﾇ',
  'ネ': 'ﾈ',
  'ノ': 'ﾉ',
  'ハ': 'ﾊ',
  'ヒ': 'ﾋ',
  'フ': 'ﾌ',
  'ヘ': 'ﾍ',
  'ホ': 'ﾎ',
  'マ': 'ﾏ',
  'ミ': 'ﾐ',
  'ム': 'ﾑ',
  'メ': 'ﾒ',
  'モ': 'ﾓ',
  'ヤ': 'ﾔ',
  'ユ': 'ﾕ',
  'ヨ': 'ﾖ',
  'ラ': 'ﾗ',
  'リ': 'ﾘ',
  'ル': 'ﾙ',
  'レ': 'ﾚ',
  'ロ': 'ﾛ',
  'ワ': 'ﾜ',
  'ン': 'ﾝ',
  'ー': 'ｰ',
  '・': '･'
}

const halfKatakanaMap = new Map(Object.entries(katakanaMap).filter(([, half]) => half.length > 0).map(([full, half]) => [half, full]))

const reverseWidthMap = new Map(Object.entries(widthMap).map(([full, half]) => [half, full]))

export function convertWidth(input: string, mode: WidthMode, options: { keepSpace?: boolean } = {}): WidthResult {
  const { keepSpace = true } = options
  let output = ''
  let converted = 0

  for (const character of input) {
    const code = character.codePointAt(0) ?? 0
    let replacement: string | undefined

    if (mode === 'to-half') {
      if (code === 0x3000) replacement = ' '
      else if (code >= 0xff01 && code <= 0xff5e) replacement = String.fromCharCode(code - 0xfee0)
      else if (katakanaMap[character]) replacement = katakanaMap[character]
      else replacement = widthMap[character]
    } else if (code === 0x20) {
      replacement = keepSpace ? undefined : '　'
    } else if (code >= 0x21 && code <= 0x7e) {
      replacement = String.fromCharCode(code + 0xfee0)
    } else {
      replacement = halfKatakanaMap.get(character) ?? reverseWidthMap.get(character)
    }

    if (replacement === undefined) output += character
    else {
      output += replacement
      converted += 1
    }
  }

  return { ok: true, output, converted }
}
