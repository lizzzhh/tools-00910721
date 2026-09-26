import type { Dictionary } from '../index'

const zhTW: Dictionary = {
  meta: {
    siteName: '透明質的工具箱',
    tagline: '讓開發更專注',
    description: '一個純前端、資料不離開瀏覽器的開發者工具箱。'
  },
  locale: {
    switcherLabel: '切換語言',
    switcherTitle: '語言',
    current: '目前語言'
  },
  nav: {
    home: '首頁',
    tools: '工具中心',
    favorites: '我的收藏',
    about: '關於',
    brandHome: '{site}首頁',
    openMenu: '開啟工具選單',
    expanding: '工具持續擴充中',
    themeToggle: '切換淺色與深色主題',
    main: '主導覽'
  },
  sidebar: {
    allTools: '全部工具',
    closeMenu: '關閉工具選單',
    searchPlaceholder: '搜尋工具',
    toolCenter: '工具中心',
    soon: '即將上線',
    noResult: '沒有找到相關工具',
    updating: '持續更新中',
    updatingHint: '更多實用工具即將推出'
  },
  catalog: {
    eyebrow: 'TOOL DIRECTORY',
    title: '工具中心',
    subtitle: '按需選擇工具，提升日常開發效率。',
    favoritesTitle: '我的收藏',
    favoritesSubtitle: '收藏常用工具，快速回到工作流程。',
    count: '{available} 個可用 · {planned} 個即將上線',
    searchPlaceholder: '搜尋工具名稱或功能',
    filterLabel: '工具分類',
    all: '全部',
    favoritesEmptyTitle: '還沒有收藏工具',
    favoritesEmptyHint: '在工具中心點一下星號即可收藏。',
    emptyTitle: '沒有找到相關工具',
    emptyHint: '試試其他關鍵字或分類。',
    resultsCount: '{count} 個結果',
    favoritesCount: '{count} 個收藏工具',
    favoriteAction: { add: '收藏', remove: '取消收藏' },
    favoriteLabel: '收藏{name}'
  },
  footer: {
    motto: '{site} · 讓開發更專注',
    feedback: '工具持續擴充中 · 歡迎回饋'
  },
  home: {
    eyebrow: 'WORKSPACE / OVERVIEW',
    title: '開發者工作台',
    subtitle: '歡迎回來，今天也保持專注，讓工具處理瑣碎，讓程式碼保持清晰。',
    cta: '進入工具中心',
    soon: '即將上線',
    fortune: {
      eyebrow: 'DAILY CHECK',
      title: '今日運勢',
      draw: '抽取今日運勢',
      drawn: '今日已解鎖',
      idle: '等待今日簽到',
      idleMessage: '每天可以抽取一次今日運勢。'
    },
    usage: {
      eyebrow: 'LOCAL ACTIVITY',
      title: '工具使用統計',
      deviceOnly: '僅此裝置',
      total: '累計使用',
      today: '今日使用',
      favorite: '最常用',
      none: '暫無',
      times: '{count} 次',
      unit: '次',
      empty: '還沒有使用記錄',
      emptyHint: '使用工具後這裡會按次數顯示前五名'
    },
    quick: { eyebrow: 'QUICK ACCESS', title: '快速開始' },
    activity: {
      eyebrow: 'RECENT ACTIVITY',
      title: '最近使用',
      count: '{count} 條記錄',
      empty: '還沒有使用記錄',
      emptyHint: '去工具中心試試第一個工具吧',
      usedAt: '{time} 使用'
    }
  },
  fortunes: {
    online: { label: '狀態良好', message: '今天很適合把複雜問題拆小，逐個擊破。' },
    steady: { label: '穩步推進', message: '不追求靈感，先讓計畫裡的下一格完成。' },
    stutter: { label: '偶爾卡頓', message: '遇到難題時先喝口水，答案可能就在下一步。' },
    inspired: { label: '靈感充沛', message: '適合清理 TODO，也許一次重構就能省下半天。' },
    focus: { label: '專注模式', message: '關掉通知，把最重要的任務放在第一屏。' },
    smooth: { label: '超級順滑', message: '今天的手感和思路都很好，適合解決歷史遺留問題。' }
  },
  about: {
    eyebrow: 'ABOUT TRANSPARENT TOOLBOX',
    title: '關於{site}',
    body: '一個為程式設計師設計的輕量工具聚合站。所有計算均在瀏覽器本地完成，不上傳、不儲存你的輸入內容。',
    cta: '使用雜湊工具',
    notFoundTitle: '工具不存在',
    backToTools: '返回工具中心'
  },
  toolsPage: { comingSoonBody: '此工具仍在開發中，你可以先試用其他工具。', browseCatalog: '瀏覽工具中心' },
  theme: { toDark: '切換深色主題', toLight: '切換淺色主題' },
  toast: { success: '完成' },
  common: {
    copy: '複製',
    copied: '已複製',
    download: '下載',
    clear: '清空',
    sample: '示例',
    generate: '生成',
    encode: '編碼',
    decode: '解碼',
    input: '輸入',
    output: '輸出',
    options: '顯示選項',
    copyFailed: '複製失敗',
    emptyInput: '請輸入內容',
    localOnly: '本地處理',
    charactersUnit: '字元'
  },
  error: {
    title: '出錯了'
  },
  categories: {
    developer: '開發者工具',
    encoding: '編碼與資料',
    text: '文字處理',
    security: '安全與加密',
    media: '媒體處理',
    efficiency: '效率工具'
  },
  workspace: { result: '處理結果', waiting: '等待處理', readonly: '唯讀結果', copyResult: '複製結果', downloadResult: '下載結果', inputChars: '輸入字元', outputChars: '輸出字元', bytes: '位元組數', format: '格式', algorithm: '演算法', inputLabel: '輸入文字', startEncode: '開始編碼', startDecode: '開始解碼', encodedResult: '編碼結果', decodedResult: '解碼結果', outputLabel: '輸出結果' },
  toolUi: {
    'jwt-decode': { subtitle: '檢視權杖的標頭、內容與時間聲明', notice: '僅解析內容，不驗證簽章；請勿貼上真實金鑰或隱私資料。', inputLabel: 'JWT 權杖', inputPlaceholder: '貼上以 eyJ 開頭的 JWT 權杖…', decodeButton: '解析權杖', resultTitle: '解析結果', idleStatus: '等待解析', idleState: '等待輸入' },
    'uuid-parser': { subtitle: '拆解版本、變體與時間欄位，支援批次處理', noticeLead: '支援 v1 到 v8 與 Nil、Max 特殊格式，v1、v2、v6 解析 100 奈秒時間戳，v7、v8 解析 Unix 毫秒。需要產生識別碼請前往', noticeLink: 'UUID 產生器', inputLabel: '待解析 UUID', inputHint: '每行一個，也相容逗號與空格分隔', parseButton: '解析', resultTitle: '解析結果', idleStatus: '等待解析', statTotal: '辨識數量', statValid: '有效', statInvalid: '無效', statVersions: '版本', detailsTitle: '欄位明細', detailsHint: '逐一展開檢視每個 UUID' },
    base64: { subtitle: '在文字與 Base 編碼之間轉換', notice: '支援 UTF-8 文字、Base32、Base58、Base62、標準 Base64、Ascii85 與 Base91；內容不會離開目前裝置。', modeLabel: 'Base 編碼操作', algorithmHint: '支援 Base32、Base58、Base62、標準 Base64、Ascii85 和 Base91', inputPlaceholder: '輸入要編碼的文字…', outputAria: 'Base 編碼處理結果', algorithms: { base32: 'Base32（RFC 4648）', base58: 'Base58（Bitcoin）', base62: 'Base62', base64: 'Base64（標準）', base85: 'Base85（Ascii85）', base91: 'Base91' }, decodeInputPlaceholder: '輸入要解碼的{label}文字…', inputHintFor: '輸入{label}', charPosition: '第 {position} 個字元：', doneEncode: '編碼完成', doneDecode: '解碼完成', needInput: '請輸入{label}內容', utf8Text: 'UTF-8 文字', errors: { invalidChar: '包含無效的 {name} 字元', needInput: '請輸入 {name} 內容', base32Length: 'Base32 長度無效', base32Padding: 'Base32 填補字元位置無效', base32PaddingBits: 'Base32 填補位元無效', base85Length: 'Base85 長度無效', invalidBase85: '包含無效的 Base85 字元', base85Range: 'Base85 數值超出範圍', base85Boundary: 'Base85 邊界字元無效', base64Padding: 'Base64 填補字元位置無效', base64Length: 'Base64 長度無效', base64Invalid: 'Base64 內容無效', notUtf8: '解碼結果不是有效的 UTF-8 文字' }, toast: { copied: '處理結果已複製', manualCopy: '目前環境不支援自動複製，請手動選取內容', downloadReady: '結果檔案已準備下載' } },
  },
  tools: {
    hash: { name: '雜湊計算', description: '多演算法摘要與簽名' },
    'jwt-decode': { name: 'JWT 解析', description: '解析令牌內容' },
    'password-generator': { name: '密碼生成器', description: '生成安全隨機密碼' },
    'password-strength': { name: '密碼強度檢測', description: '評估密碼安全性' },
    'json-format': { name: 'JSON 格式化', description: '格式化與校驗 JSON' },
    base64: { name: 'Base 編解碼', description: '文字與 Base32、Base58、Base62、標準 Base64、Ascii85、Base91 轉換' },
    'url-encode': { name: 'URL 編解碼', description: '處理連結與查詢引數' },
    'html-entity': { name: 'HTML 實體轉換', description: '轉義與還原 HTML 字元' },
    'unicode-escape': { name: 'Unicode 轉義', description: '字元編碼、轉義與碼點查詢' },
    'query-string': { name: 'Query String 解析', description: '逐條編輯查詢引數並實時同步查詢串' },
    'number-base': { name: '進位制轉換', description: '2-36 進位制與 Base58、Base62 實時互轉' },
    'uuid-generator': { name: 'UUID 生成器', description: '批次生成 v1 至 v8 唯一標識' },
    'uuid-parser': { name: 'UUID 解析', description: '拆解版本、變體與時間' },
    'timestamp-converter': { name: '時間戳轉換', description: 'Unix 時間與日期互轉' },
    'text-case': { name: '大小寫轉換', description: '切換文字大小寫與命名風格' },
    'text-counter': { name: '文字統計', description: '統計字數、行數和詞數' },
    'text-deduplicate': { name: '文字去重排序', description: '刪除重複行並排序文字' },
    'text-replace': { name: '查詢替換', description: '批次替換文字內容' },
    'fullwidth-halfwidth': { name: '全形半形轉換', description: '在中文全形與西文半形字元之間轉換' },
    'yaml-format': { name: 'YAML 格式化', description: '校驗與整理 YAML' },
    'xml-format': { name: 'XML 格式化', description: '格式化與校驗 XML' },
    'sql-format': { name: 'SQL 格式化', description: '整理 SQL 查詢語句' },
    'cron-parser': { name: 'Cron 表示式解析', description: '解釋定時任務表示式' },
    'regex-tester': { name: '正規表示式測試', description: '匹配、分組與替換' },
    'diff-text': { name: '文字 Diff 比較', description: '對比兩段文字差異' },
    'markdown-preview': { name: 'Markdown 預覽', description: '即時預覽 Markdown' },
    'json-path': { name: 'JSONPath 查詢', description: '定位 JSON 資料節點' },
    'curl-builder': { name: 'cURL 生成器', description: '從參數生成 cURL 命令' },
    'http-request': { name: 'HTTP 請求測試', description: '傳送與除錯 HTTP 請求' },
    'code-beautify': { name: '程式碼格式化', description: '統一程式碼縮排與版面' },
    'json-to-typescript': { name: 'JSON 轉 TypeScript', description: '從樣例生成型別定義' },
    'openapi-viewer': { name: 'OpenAPI 檢視器', description: '閱讀與查詢 API 文件' },
    'json-schema-validator': { name: 'JSON Schema 驗證', description: '驗證資料結構與約束' },
    'markdown-toc': { name: 'Markdown 目錄生成', description: '產生文件標題目錄' },
    'random-string': { name: '隨機字串產生', description: '依規則產生隨機文字' },
    'timezone-converter': { name: '時區轉換', description: '跨時區轉換時間' },
    'date-calculator': { name: '日期計算器', description: '計算日期差與加減天數' },
    'scientific-calculator': { name: '科學計算器', description: '計算函式與表示式' },
    'text-sort': { name: '文字排序', description: '按規則排列文字行' },
    'color-converter': { name: '顏色轉換', description: '轉換 HEX、RGB 與 HSL' },
    'contrast-checker': { name: '對比度檢查', description: '檢查文字顏色可讀性' },
    'qr-code': { name: '二維碼生成', description: '生成與下載二維碼' },
    'image-compressor': { name: '圖片壓縮', description: '壓縮圖片並減小體積' },
    'image-cropper': { name: '圖片裁剪', description: '按比例裁剪圖片' },
    'image-converter': { name: '圖片格式轉換', description: '轉換常見圖片格式' },
    'exif-viewer': { name: 'EXIF 資訊檢視', description: '讀取圖片拍攝資訊' },
    'audio-converter': { name: '音訊格式轉換', description: '轉換音訊檔案格式' },
    'docker-compose': { name: 'Docker Compose 格式化', description: '驗證與整理容器設定' },
    'nginx-config': { name: 'Nginx 設定檢查', description: '檢查常見設定問題' }
  }
}

export default zhTW