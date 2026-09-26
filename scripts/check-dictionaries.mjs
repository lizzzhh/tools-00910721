import { flatten } from './flatten-dictionary.mjs'

const locales = {
  'zh-CN': (await import('../src/i18n/locales/zh-CN.ts')).default,
  en: (await import('../src/i18n/locales/en.ts')).default,
  ja: (await import('../src/i18n/locales/ja.ts')).default,
  'zh-TW': (await import('../src/i18n/locales/zh-TW.ts')).default
}

const tables = Object.fromEntries(Object.entries(locales).map(([tag, dict]) => [tag, flatten(dict)]))

/** Technical terms that legitimately appear inside Japanese strings. */
const jaLatinAllow = new Set([
  'Base', 'Base16', 'Base32', 'Base58', 'Base62', 'Base64', 'Base91', 'Ascii', 'Ascii85', 'JSON',
  'JWT', 'MD5', 'URL', 'HTML', 'Unicode', 'Query', 'String', 'UUID', 'Unix', 'HTTP', 'cURL',
  'Docker', 'Compose', 'Nginx', 'Markdown', 'EXIF', 'OpenAPI', 'JSONPath', 'TypeScript', 'Schema',
  'SHA', 'HMAC', 'GUID', 'ULID', 'CSV', 'XML', 'YAML', 'SQL', 'Cron', 'API', 'APIs', 'HEX', 'RGB',
  'HSL', 'QR', 'TODO', 'OAuth', 'CRC32', 'bcrypt', 'argon2', 'AES', 'RSA', 'EC', 'ES', 'HS', 'PS',
  'none', 'PBKDF2', 'scrypt', 'HTTPS', 'iOS', 'Web', 'ISO', 'RFC', 'plain', 'DEFLATE', 'GZIP',
  'eyJ', 'ey', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'Nil', 'Max', 'NilUUID', 'MaxUUID',
  'UTF', 'Bitcoin', 'RFC', 'DNS', 'Punycode', 'IDN', 'Nginx', 'WebP', 'SVG', 'PDF', 'OCR',
  'JavaScript', 'TypeScript', 'RegExp', 'Blob', 'URLSearchParams', 'CJK', 'Emoji', 'IME',
  'BigInt', 'base', 'kebab', 'camel', 'snake', 'pascal', 'train', 'dot', 'path', 'alternating',
  'uXXXX', 'uXXXXX', 'ASCII', 'UTF-8',, 'encodeURIComponent', 'encodeURI',
  'RAW', 'UTC', 'GMT', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'
])

/**
 * Japanese shinjitai that collide with simplified Chinese forms. 辞書 is correct
 * Japanese, so these must be exempt from the simplified-character scan or the
 * check produces false positives on legitimate copy.
 */
const jaKanjiAllow = new Set(
  ('会 覚 権 挙 効 図 雑 賛 残 歯 児 辞 湿 実 舎 写 釈 収 寿 従 渋 処 緒 乗 剰 浄 済 縄 転 伝 灯 盗 稲 徳 突 難 弐 悩 拝 廃 髪 秘 浜 払 仏 辺 弁 舗 穂 宝 豊 翻 嚢 脳 麦 発 変 別 訳 唯 揺 様 謡 覧 竜 両 猟 緑 涙 塁 齢 暦 歴 練 錬 郎 廊 録 湾 対 択 単 嘆 弾 遅 虫 鋳 庁 徴 聴 点 徳 匿 拝 麦 仏 変 弁 豊 翻 訳 陆续 単 竜 覧 両 涼 糧 ').split(/\s+/).filter(Boolean)
)

/**
 * Simplified forms whose Japanese shinjitai differs. Kanji valid in both
 * (会, 員, 条, 画 ...) are excluded to avoid false positives.
 */
const simplifiedOnly = `这说过时会对没义产务问简转换语录码验错处无开关现应见认为从发变东车马鸟乌乐买卖书门间闻闪队际陆陈险隐难仅杂岗毁汇汉沟灭沪灯灵灾炉热爱爷牵独狭狱猫环疗痒监盘确衬础碍礼祸离秃秆种积称税稳穷窃窍窑窝窥竞笔笼筑类粮紧纠红纪级纳纸纹纺线练组细织终绍经绑绒结绕绘给络绝统绢维绵绷绸综绿缀缓编缘缝缩缴罢罗羁职联聪肃肠肤肿胀胁胆胜胧脉脑脏脚脱脸腊腻腾舰舱艰艳艺苏范茎茧荆荐荚药莱莲获莹萝营萧萨葱蒋蓝蕴虚虫虽虾蚀蚁蚂蚕蛮蜕蜗蜡蝇蝉蝎衔补衮袄袜袭装裤规觅览触誉计订讨让训议讯记讲许讼论讽设访证评识诉诊词译试诗诚话诞诠诡询该详语误诰诱说请诸诺读课谁调谅谈谊谋谎谐谓谜谢谣谤谦谨谬谱贝贞负贡财责贤败账货质贩贪贫购贮贯贱贴贵贷贸费贺贼贾贿资赁赂赃赋赌赎赏赐赔赖赚赛赞赠赡赢赣赵赶趋跃践跷踪躯轧轨转轮软轰轴轻载轿较辅辆辈辉辍辐辑输辖辗辙辞辩辫辽达迁过迈运还进远违连迟适选逊递逻遗邓邮郑酝释鉴针钉钓钙钝钞钟钠钡钢钥钦钧钨钩钮钱钳钻钾铁铅铆铎铐铛铜铝铠铡铣铤铧铨铬铭铮铰铲铳银铸铺链铿销锁锂锄锅锈锋锌锐锑错锚锡锣锤锥锦键锯锰锲锴锶锷锻镀镁镂镇镊镍镑镖镜镞镰镶长门闭闯闰闲间闷闸闹闻阀阁阅阈阎阐阔队阳阴阵阶际陆陈险随隐隶雏雾霉静韦韧韵页顶项顺顽顾顿颂预领颇颈颊颐频颓颖颗题颜额颠颤风飘飙飞饿马驭驮驯驰驱驳驴驶驹驻驼驾驿骂骄骆骇骋验骏骑骗骚骤骥髅鱼鱿鲁鲂鲅鲆鲇鲈鲊鲋鲍鲏鲐鲑鲒鲔鲗鲙鲚鲛鲜鲟鲠鲡鲢鲣鲤鲥鲦鲧鲨鲩鲫鲭鲮鲯鲰鲱鲲鲳鲴鲵鲷鲸鲹鲻鲽鳀鳁鳂鳃鳄鳅鳇鳈鳉鳊鳌鳍鳎鳏鳐鳑鳒鳓鳔鳕鳖鳗鳘鳙鳚鳛鳜鳝鳞鳟鳠鳡鸠鸡鸣鸥鸦鸨鸩鸪鸫鸬鸭鸯鸰鸳鸵鸶鸷鸸鸹鸻鸽鸾鸿鹁鹂鹃鹄鹅鹆鹇鹈鹉鹊鹌鹍鹎鹏鹑鹒鹓鹔鹕鹖鹗鹘鹚鹛鹜鹝鹞鹟鹠鹡鹢鹣鹤鹥鹦鹧鹨鹩鹪鹫鹬鹭鹰鹳麦麸黄黉黡黩黪黾鼋鼍鼹齐齑齿龀龁龂龃龄龅龆龇龈龉龊龋龌龙龚龛龟`

const source = tables['zh-CN']
const problems = []
// Ideographs, kana and CJK punctuation only. Fullwidth ASCII (\uff01-\uff5e
// letters/digits/punctuation) is legitimate in English samples such as the
// fullwidth/halfwidth converter placeholder.
const cjkPattern = /[\u3005\u3007\u3041-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff01-\uff0f\uff1a-\uff20\uff3b-\uff40\uff5b-\uff65]/

const warn = []

for (const [tag, table] of Object.entries(tables)) {
  const keys = Object.keys(table)
  const missing = Object.keys(source).filter((key) => !(key in table))
  const extra = keys.filter((key) => !(key in source))
  if (missing.length) problems.push(`${tag}: ${missing.length} missing key(s): ${missing.slice(0, 10).join(', ')}`)
  if (extra.length) problems.push(`${tag}: ${extra.length} unexpected key(s): ${extra.slice(0, 10).join(', ')}`)

  for (const [key, value] of Object.entries(table)) {
    if (typeof value !== 'string' || !value.trim()) problems.push(`${tag}.${key}: empty or non-string value`)
    if (/[\u0400-\u04ff]/.test(value)) problems.push(`${tag}.${key}: CYRILLIC -> ${value}`)
    if (tag === 'en' && cjkPattern.test(value)) problems.push(`${tag}.${key}: CJK in english -> ${value}`)
    if (tag === 'ja') {
      const bad = [...value].find((ch) => simplifiedOnly.includes(ch) && !jaKanjiAllow.has(ch))
      if (bad) problems.push(`${tag}.${key}: SIMPLIFIED "${bad}" -> ${value}`)
      // A value with no Japanese characters at all is a locale-neutral token
      // (camelCase, path/case, an eyebrow label) and cannot contain stray Latin.
      const hasJapanese = /[\u3040-\u30ff\u4e00-\u9fff]/.test(value)
      if (!key.endsWith('.eyebrow') && hasJapanese) {
        const stray = (value.replace(/\{\w+\}/g, '').match(/[A-Za-z]{2,}/g) ?? []).find((run) => !jaLatinAllow.has(run))
        if (stray) problems.push(`${tag}.${key}: STRAY LATIN "${stray}" -> ${value}`)
      }
    }
    if (tag === 'zh-TW') {
      const bad = [...value].find((ch) => simplifiedOnly.includes(ch))
      if (bad) problems.push(`${tag}.${key}: SIMPLIFIED "${bad}" -> ${value}`)
    }
    // catch mojibake / replacement characters that survive charset round-trips
    if (value.includes('\ufffd')) {
      problems.push(`${tag}.${key}: contains U+FFFD replacement characters`)
    }
  }
  console.log(`${tag.padEnd(6)} ${keys.length} keys`)
}

// Traditional Chinese must genuinely differ from the simplified source,
// except for brand names and locale-neutral tokens that stay identical.
const identical = Object.keys(source).filter((key) => tables['zh-TW']?.[key] === source[key])
// Identical values are fine when the wording uses no script-distinct character
// (工具中心, 全部, eyebrows). Only flag ones that clearly needed conversion.
const untranslated = identical.filter((key) => [...source[key]].some((ch) => simplifiedOnly.includes(ch)))
console.log(`zh-TW: ${identical.length} key(s) identical to zh-CN (expected for shared wording), ${untranslated.length} untranslated`)
if (untranslated.length) problems.push(`zh-TW: ${untranslated.length} untranslated key(s): ${untranslated.slice(0, 12).join(', ')}`)

console.log('')
if (warn.length) for (const w of warn) console.log('  warn: ' + w)
if (problems.length) {
  console.log(`${problems.length} PROBLEM(S):`)
  for (const p of problems) console.log('  ' + p)
  process.exitCode = 1
} else {
  console.log('all dictionaries clean')
}
