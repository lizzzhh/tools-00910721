#!/usr/bin/env python3
"""Writes the `toolUi` entries for the seventeen preview tools into every locale.

The four dictionaries are edited in one place and spliced into
`src/i18n/locales/*.ts` between the markers below, so a missing translation is a
missing row here rather than a key that only one language has.
"""
from __future__ import annotations

import pathlib
import re
import sys

START = "    // preview-tools:start\n"
END = "    // preview-tools:end\n"

LANGUAGES = ['zh-CN', 'en', 'ja', 'zh-TW']

# tool -> key -> [zh-CN, en, ja, zh-TW]
TOOLS: dict[str, dict[str, list[str]]] = {}


def tool(tool_id: str, **keys: list[str]) -> None:
    for key, values in keys.items():
        if len(values) != 4:
            raise SystemExit(f'{tool_id}.{key} needs four languages')
    TOOLS[tool_id] = keys


tool(
    'yaml-format',
    notice=['解析、格式化与还原 YAML，锚点与多文档都会保留。内容不会离开当前设备。',
            'Parse, format and rebuild YAML, keeping anchors and multi-document files. Nothing leaves this device.',
            'YAML を解析・整形・再構築し、アンカーと複数ドキュメントもそのまま保持します。内容は端末から出ません。',
            '解析、格式化並重建 YAML，錨點與多文件也會保留。內容不會離開目前裝置。'],
    inputLabel=['待格式化 YAML', 'YAML to format', '整形する YAML', '待格式化的 YAML'],
    placeholder=['输入 YAML 文本…', 'Paste YAML…', 'YAML を貼り付け…', '貼上 YAML 文字…'],
    runButton=['格式化', 'Format', '整形する', '格式化'],
    outputTitle=['格式化结果', 'Formatted YAML', '整形結果', '格式化結果'],
    outputAria=['YAML 格式化结果', 'Formatted YAML result', 'YAML 整形の結果', 'YAML 格式化結果'],
    emptyInput=['请输入 YAML 文本', 'Paste some YAML first', '先に YAML を貼り付けてください', '請先貼上 YAML 文字'],
    formatOk=['YAML 结构正确', 'The YAML parses', 'YAML の構造は正しいです', 'YAML 結構正確'],
    formatBad=['无法解析为 YAML', 'This does not parse as YAML', 'YAML として解析できません', '無法解析為 YAML'],
    doneStatus=['格式化完成', 'YAML formatted', '整形が完了しました', '格式化完成'],
    opt_indent=['缩进', 'Indent', 'インデント', '縮排'],
    opt_indentValues_two=['2 空格', '2 spaces', 'スペース 2', '2 個空格'],
    opt_indentValues_four=['4 空格', '4 spaces', 'スペース 4', '4 個空格'],
    opt_indentValues_tab=['制表符', 'Tabs', 'タブ', '定位鍵'],
    opt_keepComments=['保留注释', 'Keep comments', 'コメントを保持', '保留註解'],
    stat_documents=['文档', 'Documents', 'ドキュメント', '文件'],
    stat_keys=['键', 'Keys', 'キー', '鍵'],
    stat_lines=['行', 'Lines', '行', '行數'],
    stat_comments=['注释', 'Comments', 'コメント', '註解'],
    stat_format=['结构', 'Parse', '構造', '結構'],
    errors_empty=['输入为空', 'The input is empty', '入力が空です', '輸入為空'],
    errors_tabIndent=['不能使用制表符缩进', 'Tabs cannot be used for indentation', 'インデントにタブは使えません', '縮排不可使用定位鍵'],
    errors_badIndent=['缩进层级不一致', 'The indentation levels do not line up', 'インデントの階層が合いません', '縮排層級不一致'],
    errors_unclosedQuote=['引号没有闭合', 'A quote was never closed', '閉じられていない引用符があります', '引號未閉合'],
    errors_unclosedFlow=['流式集合没有闭合', 'A flow collection was never closed', '閉じられていないフローコレクションがあります', '流式集合未閉合'],
    errors_duplicateKey=['存在重复的键', 'A key is defined twice', '同じキーが複数回あります', '存在重複的鍵'],
    errors_badStructure=['结构无法识别', 'The structure cannot be read', '構造を解釈できません', '結構無法辨識'],
    errors_badScalar=['标量写法无效', 'That scalar is not valid', 'このスカラー値が不正です', '純量寫法無效'],
    errors_unknownAnchor=['引用了不存在的锚点', 'An unknown anchor was referenced', '存在しないアンカーが参照されています', '參照了不存在的錨點'],
    errors_unsupported=['包含暂不支持的写法', 'Something here is not supported yet', '未対応の書き方が含まれています', '包含尚未支援的寫法'],
)

tool(
    'xml-format',
    notice=['解析并格式化 XML，标签、注释与 CDATA 都会保留。内容不会离开当前设备。',
            'Parse and format XML, keeping tags, comments and CDATA. Nothing leaves this device.',
            'XML を解析・整形し、タグ・コメント・CDATA をそのまま保持します。内容は端末から出ません。',
            '解析並格式化 XML，標籤、註解與 CDATA 都會保留。內容不會離開目前裝置。'],
    inputLabel=['待格式化 XML', 'XML to format', '整形する XML', '待格式化的 XML'],
    placeholder=['输入 XML 文本…', 'Paste XML…', 'XML を貼り付け…', '貼上 XML 文字…'],
    runButton=['格式化', 'Format', '整形する', '格式化'],
    outputTitle=['格式化结果', 'Formatted XML', '整形結果', '格式化結果'],
    outputAria=['XML 格式化结果', 'Formatted XML result', 'XML 整形の結果', 'XML 格式化結果'],
    emptyInput=['请输入 XML 文本', 'Paste some XML first', '先に XML を貼り付けてください', '請先貼上 XML 文字'],
    formatOk=['XML 结构正确', 'The XML is well formed', 'XML の構造は正しいです', 'XML 結構正確'],
    formatBad=['无法解析为 XML', 'This does not parse as XML', 'XML として解析できません', '無法解析為 XML'],
    doneStatus=['格式化完成', 'XML formatted', '整形が完了しました', '格式化完成'],
    opt_indent=['缩进', 'Indent', 'インデント', '縮排'],
    opt_indentValues_two=['2 空格', '2 spaces', 'スペース 2', '2 個空格'],
    opt_indentValues_four=['4 空格', '4 spaces', 'スペース 4', '4 個空格'],
    opt_indentValues_tab=['制表符', 'Tabs', 'タブ', '定位鍵'],
    opt_collapse=['压缩空元素', 'Collapse empty elements', '空要素を畳む', '壓縮空元素'],
    stat_elements=['元素', 'Elements', '要素', '元素'],
    stat_attributes=['属性', 'Attributes', '属性', '屬性'],
    stat_comments=['注释', 'Comments', 'コメント', '註解'],
    stat_textLength=['文本长度', 'Text length', 'テキスト長', '文字長度'],
    stat_format=['结构', 'Parse', '構造', '結構'],
    errors_empty=['输入为空', 'The input is empty', '入力が空です', '輸入為空'],
    errors_unclosedTag=['标签没有闭合', 'A tag was never closed', '閉じられていないタグがあります', '標籤未閉合'],
    errors_strayClose=['出现了多余的闭合标签', 'A closing tag has nothing to close', '対応する開始のない閉じタグです', '出現多餘的閉合標籤'],
    errors_mismatchedTag=['闭合标签与开始标签不匹配', 'A closing tag does not match its opening tag', '開始タグと閉じタグが一致しません', '閉合標籤與開始標籤不符'],
    errors_unclosedComment=['注释没有闭合', 'A comment was never closed', '閉じられていないコメントがあります', '註解未閉合'],
    errors_badAttribute=['属性写法无效', 'An attribute is not valid', 'この属性の書き方が不正です', '屬性寫法無效'],
)

tool(
    'sql-format',
    notice=['按方言整理 SQL 大小写与缩进，并给出语句概览。内容不会离开当前设备。',
            'Tidy SQL for a chosen dialect and summarise the statements. Nothing leaves this device.',
            '方言に合わせて SQL の大小文字とインデントを整え、文の概観も表示します。内容は端末から出ません。',
            '依方言整理 SQL 大小寫與縮排，並提供語句概覽。內容不會離開目前裝置。'],
    inputLabel=['待格式化 SQL', 'SQL to format', '整形する SQL', '待格式化的 SQL'],
    placeholder=['输入 SQL 文本…', 'Paste SQL…', 'SQL を貼り付け…', '貼上 SQL 文字…'],
    runButton=['格式化', 'Format', '整形する', '格式化'],
    outputTitle=['格式化结果', 'Formatted SQL', '整形結果', '格式化結果'],
    outputAria=['SQL 格式化结果', 'Formatted SQL result', 'SQL 整形の結果', 'SQL 格式化結果'],
    emptyInput=['请输入 SQL 文本', 'Paste some SQL first', '先に SQL を貼り付けてください', '請先貼上 SQL 文字'],
    doneStatus=['格式化完成', 'SQL formatted', '整形が完了しました', '格式化完成'],
    minifiedStatus=['已压缩为单行', 'Minified to one line', '1 行に圧縮しました', '已壓縮為單行'],
    opt_dialect=['方言', 'Dialect', '方言', '方言'],
    opt_dialectValues_standard=['标准 SQL', 'Standard SQL', '標準 SQL', '標準 SQL'],
    opt_dialectValues_mysql=['MySQL', 'MySQL', 'MySQL', 'MySQL'],
    opt_dialectValues_postgresql=['PostgreSQL', 'PostgreSQL', 'PostgreSQL', 'PostgreSQL'],
    opt_dialectValues_sqlite=['SQLite', 'SQLite', 'SQLite', 'SQLite'],
    opt_keywordCase=['关键字大小写', 'Keyword case', 'キーワードの大小文字', '關鍵字大小寫'],
    opt_keywordCaseValues_upper=['全部大写', 'Upper case', 'すべて大文字', '全部大寫'],
    opt_keywordCaseValues_lower=['全部小写', 'Lower case', 'すべて小文字', '全部小寫'],
    opt_keywordCaseValues_preserve=['保持原样', 'Leave as written', 'そのまま', '保持原樣'],
    opt_indent=['缩进', 'Indent', 'インデント', '縮排'],
    opt_indentValues_two=['2 空格', '2 spaces', 'スペース 2', '2 個空格'],
    opt_indentValues_four=['4 空格', '4 spaces', 'スペース 4', '4 個空格'],
    opt_wrapLists=['值列表换行', 'Wrap value lists', '値リストを折り返す', '值清單換行'],
    opt_logicalOnNewLine=['AND / OR 另起一行', 'AND / OR on its own line', 'AND / OR を改行する', 'AND / OR 另起一行'],
    opt_betweenQueries=['语句之间留空行', 'Blank line between statements', '文の間に空行を入れる', '語句之間留空行'],
    stat_statements=['语句', 'Statements', '文', '語句'],
    stat_keywords=['关键字', 'Keywords', 'キーワード', '關鍵字'],
    stat_tables=['表', 'Tables', 'テーブル', '資料表'],
    stat_placeholders=['占位符', 'Placeholders', 'プレースホルダー', '預留位置'],
    stat_linesIn=['输入行数', 'Lines in', '入力行数', '輸入行數'],
    stat_linesOut=['输出行数', 'Lines out', '出力行数', '輸出行數'],
    errors_empty=['输入为空', 'The input is empty', '入力が空です', '輸入為空'],
    errors_unterminatedString=['字符串没有闭合', 'A string literal was never closed', '閉じられていない文字列があります', '字串未閉合'],
    errors_unterminatedIdentifier=['引用标识符没有闭合', 'A quoted identifier was never closed', '閉じられていない引用識別子があります', '引用識別符未閉合'],
    errors_unterminatedComment=['块注释没有闭合', 'A block comment was never closed', '閉じられていないブロックコメントがあります', '區塊註解未閉合'],
    errors_unbalancedParenthesis=['括号没有配对', 'The parentheses do not balance', '括弧が対応していません', '括號未配對'],
    errors_emptyStatement=['存在空的语句', 'A statement has no content', '内容のない文があります', '存在空的語句'],
)

tool(
    'json-path',
    notice=['在 JSON 上运行 JSONPath，并把命中的节点单独列出来。内容不会离开当前设备。',
            'Run a JSONPath query over JSON and list whatever it matched. Nothing leaves this device.',
            'JSON に JSONPath を実行し、一致したノードを一覧表示します。内容は端末から出ません。',
            '在 JSON 上執行 JSONPath，並列出命中的節點。內容不會離開目前裝置。'],
    inputLabel=['待查询的 JSON', 'JSON to query', '問い合わせる JSON', '待查詢的 JSON'],
    placeholder=['输入 JSON 文本…', 'Paste JSON…', 'JSON を貼り付け…', '貼上 JSON 文字…'],
    runButton=['执行查询', 'Run query', '問い合わせる', '執行查詢'],
    outputTitle=['查询结果', 'Query result', '問い合わせ結果', '查詢結果'],
    outputAria=['JSONPath 查询结果', 'JSONPath result', 'JSONPath の結果', 'JSONPath 查詢結果'],
    emptyExpression=['请输入 JSONPath 表达式', 'Enter a JSONPath expression', 'JSONPath 式を入力してください', '請輸入 JSONPath 運算式'],
    doneStatus=['查询完成', 'Query finished', '問い合わせが完了しました', '查詢完成'],
    matched=['已匹配', 'matched', '件一致', '筆相符'],
    noMatch=['无匹配', 'no match', '該当なし', '無相符'],
    opt_expression=['表达式', 'Expression', '式', '運算式'],
    opt_example=['示例', 'Example', '例', '範例'],
    expressionPlaceholder=['例如 $.store.book[0].title', 'e.g. $.store.book[0].title', '例: $.store.book[0].title', '例如 $.store.book[0].title'],
    stat_matches=['命中数', 'Matches', '一致数', '相符數'],
    stat_kind=['结果', 'Result', '結果', '結果'],
    stat_resultPath=['首个路径', 'First path', '最初のパス', '第一個路徑'],
    stat_depth=['最深层级', 'Deepest level', '最も深い階層', '最深層級'],
    errors_syntax=['表达式语法无效', 'The expression cannot be parsed', '式を解析できません', '運算式語法無效'],
    errors_unknownFunction=['存在不支持的函数', 'That function is not supported', '未対応の関数です', '存在不支援的函式'],
    errors_badFilter=['筛选表达式无效', 'The filter expression is not valid', 'フィルタ条件が不正です', '篩選運算式無效'],
    errors_invalidJson=['JSON 无法解析', 'The JSON cannot be parsed', 'JSON を解析できません', 'JSON 無法解析'],
)

tool(
    'json-to-typescript',
    notice=['从样例 JSON 推断 TypeScript 类型，null 与数组会按所选策略处理。内容不会离开当前设备。',
            'Infer TypeScript types from sample JSON, with nulls and arrays handled as chosen. Nothing leaves this device.',
            'サンプル JSON から TypeScript の型を推論します。null と配列は選んだ方針で扱います。内容は端末から出ません。',
            '從範例 JSON 推斷 TypeScript 型別，null 與陣列會依所選策略處理。內容不會離開目前裝置。'],
    inputLabel=['样例 JSON', 'Sample JSON', 'サンプル JSON', '範例 JSON'],
    placeholder=['输入 JSON 文本…', 'Paste JSON…', 'JSON を貼り付け…', '貼上 JSON 文字…'],
    runButton=['生成类型', 'Generate types', '型を生成', '產生型別'],
    outputTitle=['类型定义', 'Generated types', '生成された型', '產生的型別'],
    outputAria=['TypeScript 类型定义', 'Generated TypeScript types', '生成された TypeScript の型', '產生的 TypeScript 型別'],
    emptyInput=['请输入 JSON 文本', 'Paste some JSON first', '先に JSON を貼り付けてください', '請先貼上 JSON 文字'],
    doneStatus=['类型已生成', 'Types generated', '型を生成しました', '型別已產生'],
    opt_flavour=['写法', 'Syntax', '書き方', '寫法'],
    opt_flavourValues_interface=['interface', 'interface', 'interface', 'interface'],
    opt_flavourValues_type=['type', 'type', 'type', 'type'],
    opt_nullPolicy=['null 字段', 'Null fields', 'null フィールド', 'null 欄位'],
    opt_nullPolicyValues_optional=['可选属性', 'Optional property', '省略可能', '選擇性屬性'],
    opt_nullPolicyValues_union=['联合 null', 'Union with null', 'null との合併', '與 null 聯合'],
    opt_semicolons=['加分号', 'Semicolons', 'セミコロン', '加分號'],
    opt_exports=['导出声明', 'Export declarations', 'export を付ける', '匯出宣告'],
    stat_types=['类型数', 'Types', '型の数', '型別數'],
    stat_properties=['字段数', 'Fields', 'フィールド数', '欄位數'],
    stat_nested=['嵌套类型', 'Nested types', '入れ子型', '巢狀型別'],
    stat_arrays=['数组类型', 'Array types', '配列型', '陣列型別'],
    stat_lines=['代码行数', 'Code lines', 'コード行数', '程式碼行數'],
    errors_empty=['输入为空', 'The input is empty', '入力が空です', '輸入為空'],
    errors_badName=['字段名不是合法的标识符', 'A field name is not a valid identifier', 'フィールド名が識別子として不正です', '欄位名稱不是合法的識別符'],
    errors_invalidJson=['JSON 无法解析', 'The JSON cannot be parsed', 'JSON を解析できません', 'JSON 無法解析'],
)

tool(
    'json-schema-validator',
    notice=['按 draft-07 校验文档，列出每一条不通过的 keyword。内容不会离开当前设备。',
            'Validate a document against draft-07 and list every keyword that failed. Nothing leaves this device.',
            'draft-07 で文書を検証し、失敗した keyword をすべて表示します。内容は端末から出ません。',
            '依 draft-07 驗證文件，列出每一條未通過的 keyword。內容不會離開目前裝置。'],
    inputLabel=['说明', 'Notes', '補足', '說明'],
    placeholder=['可以在这里记下这份 schema 的用途…', 'A note about what this schema is for…',
                 'このスキーマの用途などをメモ…', '可以記下這份 schema 的用途…'],
    runButton=['开始校验', 'Validate', '検証する', '開始驗證'],
    outputTitle=['校验结果', 'Validation result', '検証結果', '驗證結果'],
    outputAria=['JSON Schema 校验结果', 'JSON Schema validation result', 'JSON Schema の検証結果', 'JSON Schema 驗證結果'],
    schemaLabel=['JSON Schema', 'JSON Schema', 'JSON Schema', 'JSON Schema'],
    schemaHint=['draft-07', 'draft-07', 'draft-07', 'draft-07'],
    schemaPlaceholder=['输入 JSON Schema…', 'Paste a JSON Schema…', 'JSON Schema を貼り付け…', '貼上 JSON Schema…'],
    documentLabel=['待校验文档', 'Document', '検証する文書', '待驗證文件'],
    documentHint=['要检查的 JSON', 'the JSON to check', '確認する JSON', '要檢查的 JSON'],
    documentPlaceholder=['输入 JSON 文档…', 'Paste the JSON document…', 'JSON 文書を貼り付け…', '貼上 JSON 文件…'],
    emptySchema=['请输入 JSON Schema', 'Paste a JSON Schema first', '先に JSON Schema を貼り付けてください', '請先貼上 JSON Schema'],
    emptyDocument=['请输入 JSON 文档', 'Paste the document first', '先に文書を貼り付けてください', '請先貼上 JSON 文件'],
    valid=['通过', 'valid', '適合', '通過'],
    invalid=['未通过', 'invalid', '不適合', '未通過'],
    cannotRun=['无法校验', 'cannot run', '検証できません', '無法驗證'],
    validStatus=['文档符合 schema', 'The document matches the schema', '文書はスキーマに適合しています', '文件符合 schema'],
    invalidStatus=['发现 {count} 处问题', '{count} problem(s) found', '{count} 件の問題が見つかりました', '發現 {count} 處問題'],
    validDetail=['所有 keyword 均通过', 'Every keyword passed', 'すべての keyword に合格しました', '所有 keyword 均通過'],
    issuesTitle=['不通过的条目：', 'Failed keywords:', '不合格の項目：', '未通過的項目：'],
    notesTitle=['通过的条目：', 'Passed keywords:', '合格の項目：', '通過的項目：'],
    keywordsUsed=['使用的 keyword', 'Keywords used', '使用した keyword', '使用的 keyword'],
    stat_result=['结论', 'Verdict', '判定', '結論'],
    stat_issues=['问题数', 'Problems', '問題数', '問題數'],
    stat_keywords=['keyword 数', 'Keywords', 'keyword 数', 'keyword 數'],
    stat_checked=['检查次数', 'Checks', '検査回数', '檢查次數'],
    errors_badRef=['无法解析 $ref', 'A $ref could not be resolved', '$ref を解決できません', '無法解析 $ref'],
    errors_circularRef=['引用形成循环', 'The references form a cycle', '参照が循環しています', '參照形成循環'],
    errors_notAnObject=['schema 必须是对象或布尔值', 'The schema must be an object or a boolean',
                        'スキーマはオブジェクトかブール値である必要があります', 'schema 必須是物件或布林值'],
    errors_invalidJson=['JSON 无法解析', 'The JSON cannot be parsed', 'JSON を解析できません', 'JSON 無法解析'],
)

tool(
    'cron-parser',
    notice=['解析五段 cron 表达式，展开字段并算出接下来五次触发时间。内容不会离开当前设备。',
            'Read a five-field cron expression, expand the fields and list the next five runs. Nothing leaves this device.',
            '5 項目の cron 式を読み取り、フィールドを展開して次回 5 回の実行時刻を表示します。内容は端末から出ません。',
            '解析五段 cron 運算式，展開欄位並算出接下來五次觸發時間。內容不會離開目前裝置。'],
    inputLabel=['cron 表达式', 'Cron expression', 'cron 式', 'cron 運算式'],
    placeholder=['例如 0 9 * * 1-5', 'e.g. 0 9 * * 1-5', '例: 0 9 * * 1-5', '例如 0 9 * * 1-5'],
    runButton=['解析表达式', 'Read expression', '式を解析', '解析運算式'],
    outputTitle=['解析结果', 'Parsed expression', '解析結果', '解析結果'],
    outputAria=['cron 解析结果', 'Cron parse result', 'cron の解析結果', 'cron 解析結果'],
    emptyExpression=['请输入 cron 表达式', 'Enter a cron expression', 'cron 式を入力してください', '請輸入 cron 運算式'],
    doneStatus=['解析完成', 'Expression read', '解析が完了しました', '解析完成'],
    opt_expression=['表达式', 'Expression', '式', '運算式'],
    opt_preset=['常用表达式', 'Presets', 'よく使う式', '常用運算式'],
    opt_presetValues_everyMinute=['每分钟', 'Every minute', '毎分', '每分鐘'],
    opt_presetValues_everyFiveMinutes=['每 5 分钟', 'Every 5 minutes', '5 分ごと', '每 5 分鐘'],
    opt_presetValues_everyHour=['每小时', 'Every hour', '毎時', '每小時'],
    opt_presetValues_everyDay=['每天 03:00', 'Every day at 03:00', '毎日 03:00', '每天 03:00'],
    opt_presetValues_everyWeekday=['工作日 09:00', 'Weekdays at 09:00', '平日 09:00', '工作日 09:00'],
    opt_presetValues_everyWeek=['每周一 09:00', 'Mondays at 09:00', '毎週月曜 09:00', '每週一 09:00'],
    opt_presetValues_everyMonth=['每月 1 日', 'First of the month', '毎月 1 日', '每月 1 日'],
    opt_presetValues_everyYear=['每年 1 月 1 日', 'First of January', '毎年 1 月 1 日', '每年 1 月 1 日'],
    expressionPlaceholder=['0 9 * * 1-5', '0 9 * * 1-5', '0 9 * * 1-5', '0 9 * * 1-5'],
    stat_fields=['字段取值数', 'Field values', 'フィールド値数', '欄位取值數'],
    stat_matches=['触发时间', 'Upcoming runs', '実行時刻', '觸發時間'],
    stat_frequency=['频率', 'Frequency', '頻度', '頻率'],
    stat_seconds=['含秒字段', 'Has seconds', '秒フィールド', '含秒欄位'],
    frequencies_everySecond=['每秒', 'Every second', '毎秒', '每秒'],
    frequencies_everyMinute=['每分钟', 'Every minute', '毎分', '每分鐘'],
    frequencies_everyHour=['每小时', 'Every hour', '毎時', '每小時'],
    frequencies_everyDay=['每天', 'Every day', '毎日', '每天'],
    frequencies_everyWeek=['每周', 'Every week', '毎週', '每週'],
    frequencies_everyMonth=['每月', 'Every month', '毎月', '每月'],
    frequencies_everyYear=['每年', 'Every year', '毎年', '每年'],
    frequencies_custom=['自定义', 'Custom', 'カスタム', '自訂'],
    errors_empty=['输入为空', 'The input is empty', '入力が空です', '輸入為空'],
    errors_fieldCount=['需要五段字段', 'Five fields are required', 'フィールドは 5 段必要です', '需要五段欄位'],
    errors_badField=['字段无法解析', 'A field cannot be read', 'このフィールドは解析できません', '欄位無法解析'],
    errors_outOfRange=['取值超出范围', 'A value is out of range', '値が範囲外です', '取值超出範圍'],
)

tool(
    'regex-tester',
    notice=['实时运行正则，列出每一处匹配与捕获组，并预览替换结果。内容不会离开当前设备。',
            'Run a pattern live, list every match and capture group, and preview the replacement. Nothing leaves this device.',
            '正規表現を即座に実行し、一致箇所とキャプチャを一覧表示し、置換結果も確認できます。内容は端末から出ません。',
            '即時執行正規表示式，列出每處相符與擷取群組，並預覽取代結果。內容不會離開目前裝置。'],
    inputLabel=['待测试文本', 'Text to test', 'テストする文字列', '待測試文字'],
    placeholder=['输入要匹配的文本…', 'Paste the text to match…', '照合する文字列を貼り付け…', '貼上要比對的文字…'],
    runButton=['运行正则', 'Run pattern', '正規表現を実行', '執行正規表示式'],
    outputTitle=['匹配结果', 'Matches', '一致結果', '相符結果'],
    outputAria=['正则匹配结果', 'Regular expression matches', '正規表現の一致結果', '正規表示式相符結果'],
    emptyPattern=['请输入正则表达式', 'Enter a pattern first', '先に正規表現を入力してください', '請先輸入正規表示式'],
    doneStatus=['共 {count} 处匹配', '{count} match(es)', '{count} 件一致', '共 {count} 處相符'],
    noFlags=['无标志', 'no flags', 'フラグなし', '無旗標'],
    matchesTitle=['匹配列表：', 'Matches:', '一致一覧：', '相符列表：'],
    noMatches=['没有匹配到内容', 'Nothing matched', '一致はありません', '沒有相符內容'],
    replacedTitle=['替换结果：', 'After replacement:', '置換後：', '取代結果：'],
    opt_pattern=['正则表达式', 'Pattern', '正規表現', '正規表示式'],
    patternPlaceholder=['例如 \\d{4}-\\d{2}-\\d{2}', 'e.g. \\d{4}-\\d{2}-\\d{2}', '例: \\d{4}-\\d{2}-\\d{2}', '例如 \\d{4}-\\d{2}-\\d{2}'],
    opt_flags=['标志', 'Flags', 'フラグ', '旗標'],
    opt_flagsValues_g=['全局 g', 'Global g', '全体 g', '全域 g'],
    opt_flagsValues_i=['忽略大小写 i', 'Ignore case i', '大文字小文字を無視 i', '忽略大小寫 i'],
    opt_flagsValues_m=['多行 m', 'Multiline m', '複数行 m', '多行 m'],
    opt_flagsValues_s=['跨行 s', 'Dotall s', 'ドット全一致 s', '跨行 s'],
    opt_flagsValues_u=['Unicode u', 'Unicode u', 'Unicode u', 'Unicode u'],
    opt_replacement=['替换文本', 'Replacement', '置換文字列', '取代文字'],
    replacementPlaceholder=['可用 $1 与 $<name>', 'may use $1 and $<name>', '$1 と $<name> を使えます', '可用 $1 與 $<name>'],
    stat_matches=['匹配数', 'Matches', '一致数', '相符數'],
    stat_groups=['捕获组', 'Groups', 'キャプチャ数', '擷取群組'],
    stat_replaced=['替换数', 'Replaced', '置換数', '取代數'],
    stat_flags=['生效标志', 'Flags in effect', '有効なフラグ', '生效旗標'],
    errors_empty=['输入为空', 'The input is empty', '入力が空です', '輸入為空'],
    errors_invalid=['正则表达式无效', 'The pattern is not a valid regular expression',
                    'この正規表現は不正です', '正規表示式無效'],
)

tool(
    'curl-builder',
    notice=['按选项拼出一条可读的 curl 命令，请求不会真的发出。内容不会离开当前设备。',
            'Assemble a readable curl command from the options; the request is never sent. Nothing leaves this device.',
            '設定から読める curl コマンドを組み立てます。リクエストは送信しません。内容は端末から出ません。',
            '依選項組出一條可讀的 curl 指令，請求不會真的送出。內容不會離開目前裝置。'],
    inputLabel=['请求说明', 'Request notes', 'リクエストのメモ', '請求說明'],
    placeholder=['记下这次请求要做什么…', 'A note about what this request does…',
                 'このリクエストの概要をメモ…', '記下這次請求要做什麼…'],
    runButton=['生成命令', 'Build command', 'コマンドを生成', '產生指令'],
    outputTitle=['curl 命令', 'curl command', 'curl コマンド', 'curl 指令'],
    outputAria=['生成的 curl 命令', 'Generated curl command', '生成された curl コマンド', '產生的 curl 指令'],
    emptyUrl=['请输入请求地址', 'Enter a request URL', 'リクエスト URL を入力してください', '請輸入請求網址'],
    doneStatus=['命令已生成', 'Command built', 'コマンドを生成しました', '指令已產生'],
    opt_url=['请求地址', 'URL', 'リクエスト URL', '請求網址'],
    urlPlaceholder=['https://api.example.com/v1/items', 'https://api.example.com/v1/items',
                    'https://api.example.com/v1/items', 'https://api.example.com/v1/items'],
    opt_method=['方法', 'Method', 'メソッド', '方法'],
    opt_pretty=['多行排版', 'Pretty print', '整形して表示', '多行排版'],
    opt_headers=['请求头', 'Headers', 'ヘッダー', '請求標頭'],
    headersHint=['每行一个 Name: value', 'one Name: value per line', '1 行に 1 つずつ Name: value', '每行一個 Name: value'],
    headersPlaceholder=['Accept: application/json\nAuthorization: Bearer …', 'Accept: application/json\nAuthorization: Bearer …',
                        'Accept: application/json\nAuthorization: Bearer …', 'Accept: application/json\nAuthorization: Bearer …'],
    opt_body=['请求体', 'Body', 'ボディ', '請求本文'],
    bodyHint=['POST 时使用', 'used when a body is sent', 'ボディとして送信します', 'POST 時使用'],
    bodyPlaceholder=['{\n  "name": "riverside"\n}', '{\n  "name": "riverside"\n}',
                     '{\n  "name": "riverside"\n}', '{\n  "name": "riverside"\n}'],
    opt_followRedirects=['跟随重定向', 'Follow redirects', 'リダイレクトに従う', '跟隨重新導向'],
    opt_compressed=['请求压缩', 'Ask for compression', '圧縮を要求', '要求壓縮'],
    opt_showErrors=['HTTP 错误视为失败', 'Fail on HTTP errors', 'HTTP エラーを失敗扱い', 'HTTP 錯誤視為失敗'],
    opt_insecure=['跳过证书校验', 'Skip certificate checks', '証明書の検証を省略', '略過憑證驗證'],
    stat_flags=['使用的标志', 'Flags used', '使用したフラグ', '使用的旗標'],
    stat_length=['命令长度', 'Command length', 'コマンド長', '指令長度'],
    stat_query=['查询参数', 'Query params', 'クエリパラメーター', '查詢參數'],
    stat_headers=['请求头数', 'Headers', 'ヘッダー数', '請求標頭數'],
    errors_emptyUrl=['请求地址为空', 'The URL is empty', 'URL が空です', '請求網址為空'],
    errors_badUrl=['请求地址无法解析', 'The URL cannot be parsed', 'URL を解析できません', '請求網址無法解析'],
    errors_badHeader=['请求头名称无效', 'That header name is not valid', 'ヘッダー名が不正です', '請求標頭名稱無效'],
)

tool(
    'markdown-toc',
    notice=['扫描 Markdown 标题，生成目录并可插回原文。内容不会离开当前设备。',
            'Scan Markdown headings, build a table of contents and insert it back. Nothing leaves this device.',
            'Markdown の見出しを探して目次を作り、本文に挿入できます。内容は端末から出ません。',
            '掃描 Markdown 標題，產生目錄並可插回原文。內容不會離開目前裝置。'],
    inputLabel=['Markdown 原文', 'Markdown', 'Markdown 本文', 'Markdown 原文'],
    placeholder=['输入 Markdown 文本…', 'Paste Markdown…', 'Markdown を貼り付け…', '貼上 Markdown 文字…'],
    runButton=['生成目录', 'Build contents', '目次を生成', '產生目錄'],
    outputTitle=['目录', 'Table of contents', '目次', '目錄'],
    outputAria=['Markdown 目录结果', 'Table of contents result', '目次の結果', 'Markdown 目錄結果'],
    emptyInput=['请输入 Markdown 文本', 'Paste some Markdown first', '先に Markdown を貼り付けてください', '請先貼上 Markdown 文字'],
    noHeadings=['没有找到任何标题', 'No headings were found', '見出しが見つかりません', '找不到任何標題'],
    doneStatus=['目录已生成', 'Contents built', '目次を生成しました', '目錄已產生'],
    insertedStatus=['目录已生成，可整段替换首段之后的正文', 'Contents built; paste it after your first paragraph',
                    '目次を生成しました。冒頭の段落の後ろに貼り付けてください', '目錄已產生，可整段取代首段之後的正文'],
    opt_depth=['最深层级', 'Deepest level', '最も深い階層', '最深層級'],
    opt_depthValues_depth2=['H1–H2', 'H1–H2', 'H1–H2', 'H1–H2'],
    opt_depthValues_depth3=['H1–H3', 'H1–H3', 'H1–H3', 'H1–H3'],
    opt_depthValues_depth4=['H1–H4', 'H1–H4', 'H1–H4', 'H1–H4'],
    opt_depthValues_depth6=['H1–H6', 'H1–H6', 'H1–H6', 'H1–H6'],
    opt_marker=['插入位置注释', 'Insertion marker', '挿入位置マーカー', '插入位置註解'],
    markerPlaceholder=['例如 TOC', 'e.g. TOC', '例: TOC', '例如 TOC'],
    opt_numbered=['编号', 'Numbered', '番号を付ける', '編號'],
    opt_slugLinks=['链接到锚点', 'Link to anchors', '見出しへリンク', '連結到錨點'],
    stat_headings=['标题数', 'Headings', '見出し数', '標題數'],
    stat_levels=['涉及层级', 'Levels used', '含まれる階層', '涉及層級'],
    stat_maxDepth=['最深层级', 'Deepest level', '最も深い階層', '最深層級'],
    stat_lines=['目录行数', 'Contents lines', '目次行数', '目錄行數'],
)

tool(
    'diff-text',
    notice=['逐行比较两段文本，可忽略大小写或空白，并生成统一 diff。内容不会离开当前设备。',
            'Compare two texts line by line, optionally ignoring case or whitespace, and emit a unified diff. Nothing leaves this device.',
            '2 つのテキストを行ごとに比較し、大文字小文字や空白を無視する指定や unified diff の出力もできます。内容は端末から出ません。',
            '逐行比較兩段文字，可忽略大小寫或空白，並產生 unified diff。內容不會離開目前裝置。'],
    inputLabel=['原文 A', 'Text A', '文字列 A', '原文 A'],
    placeholder=['输入第一段文本…', 'Paste the first text…', '最初のテキストを貼り付け…', '貼上第一段文字…'],
    runButton=['比较文本', 'Compare', '比較する', '比較文字'],
    outputTitle=['差异结果', 'Differences', '差分結果', '差異結果'],
    outputAria=['文本差异结果', 'Text differences', 'テキスト差分の結果', '文字差異結果'],
    emptyInput=['请至少输入一段文本', 'Provide at least one text', '少なくとも一方を入力してください', '請至少輸入一段文字'],
    identical=['两段文本完全相同', 'The two texts are identical', '2 つのテキストは同一です', '兩段文字完全相同'],
    identicalStatus=['没有差异', 'No differences', '差分なし', '沒有差異'],
    doneStatus=['新增 {added} 行，删除 {removed} 行', '{added} added, {removed} removed',
                '{added} 行追加、{removed} 行削除', '新增 {added} 行，刪除 {removed} 行'],
    opt_after=['原文 B', 'Text B', '文字列 B', '原文 B'],
    afterHint=['要和上方文本比较的内容', 'compared with the text above', '上との比較対象', '要與上方文字比較的內容'],
    afterPlaceholder=['输入第二段文本…', 'Paste the second text…', '2 つ目のテキストを貼り付け…', '貼上第二段文字…'],
    opt_mode=['输出形式', 'Output', '出力形式', '輸出形式'],
    opt_modeValues_rows=['逐行标记', 'Row markers', '行ごとに印', '逐行標記'],
    opt_modeValues_unified=['统一 diff', 'Unified diff', 'Unified diff', '統一 diff'],
    opt_ignore=['忽略', 'Ignore', '無視する項目', '忽略'],
    opt_ignoreValues_none=['不忽略', 'Nothing', 'なし', '不忽略'],
    opt_ignoreValues_space=['空白差异', 'Whitespace', '空白', '空白差異'],
    opt_ignoreValues_case=['大小写', 'Case', '大文字小文字', '大小寫'],
    opt_context=['上下文行数', 'Context lines', 'コンテキスト行数', '上下文行數'],
    contextValue=['3', '3', '3', '3'],
    stat_same=['相同行', 'Same', '一致行', '相同行'],
    stat_added=['新增行', 'Added', '追加行', '新增行'],
    stat_removed=['删除行', 'Removed', '削除行', '刪除行'],
    stat_similarity=['相似度', 'Similarity', '類似度', '相似度'],
    errors_tooLarge=['文本超过 {lines} 行，请先拆分', 'The text is longer than {lines} lines; split it first',
                     '{lines} 行を超えています。先に分割してください', '文字超過 {lines} 行，請先拆分'],
)

tool(
    'text-sort',
    notice=['按字典序、数字、大小等规则排序每一行，并统计重复项。内容不会离开当前设备。',
            'Sort every line by dictionary, number, length or at random, and count the repeats. Nothing leaves this device.',
            '辞書順・数値順・長さなどで各行を並べ替え、重複を数えます。内容は端末から出ません。',
            '依字典序、數字、長度等規則排序每一行，並統計重複項。內容不會離開目前裝置。'],
    inputLabel=['待排序文本', 'Text to sort', '並べ替える文字列', '待排序文字'],
    placeholder=['每行一条记录…', 'One record per line…', '1 行に 1 レコード…', '每行一筆記錄…'],
    runButton=['排序', 'Sort', '並べ替え', '排序'],
    outputTitle=['排序结果', 'Sorted lines', '並べ替え結果', '排序結果'],
    outputAria=['文本排序结果', 'Sorted text result', '並べ替えの結果', '文字排序結果'],
    emptyInput=['请输入要排序的文本', 'Paste the text to sort first', '先に並べ替える文字列を入力してください', '請先輸入要排序的文字'],
    doneStatus=['排序完成', 'Lines sorted', '並べ替えが完了しました', '排序完成'],
    summaryLine=['共 {total} 行，去重后 {unique} 行，{moved} 行位置有变化',
                 '{total} lines, {unique} unique, {moved} moved',
                 '{total} 行、重複なしで {unique} 行、{moved} 行が移動',
                 '共 {total} 行，去重後 {unique} 行，{moved} 行位置有變化'],
    duplicatesTitle=['重复项：', 'Duplicates:', '重複：', '重複項：'],
    opt_order=['排序规则', 'Order', '並べ替えの基準', '排序規則'],
    opt_orderValues_lexical=['字典序', 'Dictionary', '辞書順', '字典序'],
    opt_orderValues_natural=['自然序', 'Natural', '自然順', '自然序'],
    opt_orderValues_numeric=['数字大小', 'Numeric', '数値', '數字大小'],
    opt_orderValues_length=['长度', 'Length', '長さ', '長度'],
    opt_orderValues_random=['随机', 'Random', 'ランダム', '隨機'],
    opt_direction=['方向', 'Direction', '方向', '方向'],
    opt_directionValues_asc=['升序', 'Ascending', '昇順', '升冪'],
    opt_directionValues_desc=['降序', 'Descending', '降順', '降冪'],
    opt_caseSensitive=['区分大小写', 'Case sensitive', '大文字小文字を区別', '區分大小寫'],
    opt_trim=['忽略首尾空白', 'Trim ends', '前後の空白を無視', '忽略首尾空白'],
    opt_unique=['去除重复行', 'Drop duplicates', '重複行を除く', '去除重複行'],
    opt_ignoreBlank=['忽略空行', 'Skip blank lines', '空行を無視', '忽略空行'],
    opt_pinned=['置顶前缀', 'Pinned prefix', '先頭に固定する文字', '置頂前綴'],
    pinnedPlaceholder=['例如 #', 'e.g. #', '例: #', '例如 #'],
    stat_lines=['总行数', 'Lines', '行数', '總行數'],
    stat_sorted=['位置变化', 'Moved', '移動した行', '位置變化'],
    stat_duplicates=['重复项', 'Duplicates', '重複', '重複項'],
    stat_blank=['空行', 'Blank lines', '空行', '空行'],
)

tool(
    'timezone-converter',
    notice=['把某个时区的墙上时间换算到另一个时区，并列出同一时刻的常见时区。内容不会离开当前设备。',
            'Read a wall clock time in one zone in another zone, and list the common zones sharing that instant. Nothing leaves this device.',
            'あるタイムゾーンの時刻を別のゾーンに換算し、同じ瞬間の主なゾーンも表示します。内容は端末から出ません。',
            '把某個時區的牆上時間換算到另一個時區，並列出同一時刻的常見時區。內容不會離開目前裝置。'],
    inputLabel=['转换说明', 'Conversion notes', '換算のメモ', '換算說明'],
    placeholder=['记下这次换算的用途…', 'A note about why you are converting…',
                 'この換算の目的をメモ…', '記下這次換算的用途…'],
    runButton=['换算时间', 'Convert', '時刻を換算', '換算時間'],
    outputTitle=['换算结果', 'Converted times', '換算結果', '換算結果'],
    outputAria=['时区换算结果', 'Time zone conversion result', 'タイムゾーン換算の結果', '時區換算結果'],
    doneStatus=['已换算到 {zone}', 'Converted to {zone}', '{zone} に換算しました', '已換算到 {zone}'],
    dayShifted=['跨日', 'next day', '日付が変わる', '跨日'],
    sameDay=['同一天', 'same day', '同一天', '同一天'],
    opt_moment=['时间', 'Moment', '時刻', '時間'],
    opt_source=['源时区', 'From zone', '変換元ゾーン', '來源時區'],
    opt_target=['目标时区', 'To zone', '変換先ゾーン', '目標時區'],
    stat_sourceTime=['源时区时间', 'From', '変換元の時刻', '來源時區時間'],
    stat_targetTime=['目标时区时间', 'To', '変換先の時刻', '目標時區時間'],
    stat_sourceOffset=['源时区偏移', 'From offset', '変換元のオフセット', '來源時區偏移'],
    stat_targetOffset=['目标时区偏移', 'To offset', '変換先のオフセット', '目標時區偏移'],
    stat_difference=['时差', 'Difference', '時差', '時差'],
    stat_dayShift=['日期变化', 'Day shift', '日付の移動', '日期變化'],
    errors_badDate=['时间格式无法识别', 'That moment cannot be read',
                    '時刻の形式が分からないです', '時間格式無法辨識'],
    errors_badZone=['时区无效：{zone}', 'Unknown time zone: {zone}', '未知のゾーン: {zone}', '無效的時區：{zone}'],
)

tool(
    'date-calculator',
    notice=['计算日期之间的天数、月数、工作日与 ISO 周，并可做日期加减。内容不会离开当前设备。',
            'Work out days, months, business days and ISO weeks between two dates, and shift a date. Nothing leaves this device.',
            '2 つの日付の日数・月数・営業日・ISO 週を求め、日付の加算減算もできます。内容は端末から出ません。',
            '計算兩日期之間的天數、月數、工作日與 ISO 週，並可做日期加減。內容不會離開目前裝置。'],
    inputLabel=['日期说明', 'Date notes', '日付のメモ', '日期說明'],
    placeholder=['记下这两个日期的用途…', 'A note about what these dates are for…',
                 'この 2 つの日付の用途をメモ…', '記下這兩個日期的用途…'],
    runButton=['开始计算', 'Calculate', '計算する', '開始計算'],
    outputTitle=['计算结果', 'Result', '計算結果', '計算結果'],
    outputAria=['日期计算结果', 'Date calculation result', '日付計算の結果', '日期計算結果'],
    doneStatus=['计算完成', 'Dates compared', '計算が完了しました', '計算完成'],
    days=['天', 'days', '日', '天'],
    weekend=['周末', 'weekend', '週末', '週末'],
    opt_from=['起始日期', 'From', '開始日', '起始日期'],
    opt_to=['目标日期', 'To', '比較日', '目標日期'],
    opt_operation=['操作', 'Operation', '操作', '操作'],
    opt_operationValues_diff=['相差多久', 'Difference', '差分', '相差多久'],
    opt_operationValues_plusDays=['加若干天', 'Add days', '日数を足す', '加若干天'],
    opt_operationValues_plusMonths=['加若干月', 'Add months', '月数を足す', '加若干月'],
    opt_operationValues_age=['算年龄', 'Age', '年齢', '算年齡'],
    opt_operationValues_businessDays=['工作日数', 'Business days', '営業日数', '工作日數'],
    opt_operationValues_isoWeek=['ISO 周', 'ISO week', 'ISO 週', 'ISO 週'],
    opt_amount=['数量', 'Amount', '数量', '數量'],
    amountValue=['30', '30', '30', '30'],
    stat_resultLabel=['结果', 'Result', '結果', '結果'],
    stat_days=['相差天数', 'Days', '日数', '相差天數'],
    stat_weeks=['相差周数', 'Weeks', '週数', '相差週數'],
    stat_weekday=['起始星期', 'Weekday', '曜日', '起始星期'],
    stat_isoWeekValue=['ISO 周', 'ISO week', 'ISO 週', 'ISO 週'],
    line_start=['起始', 'From', '開始', '起始'],
    line_end=['目标', 'To', '目標', '目標'],
    line_epoch=['起始时间戳', 'From timestamp', '開始の UNIX 時間', '起始時間戳'],
    line_leap=['起始年为闰年', 'From is a leap year', '開始年は閏年', '起始年為閏年'],
    results_diff=['日期相差', 'Difference', '日付の差', '日期相差'],
    results_months=['个月零', 'months and', 'か月と', '個月零'],
    results_restDays=['天', 'days', '日', '天'],
    results_plusDays=['{amount} 天后', 'In {amount} days', '{amount} 日後', '{amount} 天後'],
    results_plusMonths=['{amount} 个月后', 'In {amount} months', '{amount} か月後', '{amount} 個月後'],
    results_age=['年龄', 'Age', '年齢', '年齡'],
    results_business=['其间的工作日', 'Business days between', 'その間の営業日', '其間的工作日'],
    results_isoWeek=['所属 ISO 周', 'ISO week', '所属 ISO 週', '所屬 ISO 週'],
    results_weekYear=['周所属年份', 'week year', '週の年', '週所屬年份'],
    results_summary=['见下方明细', 'see the detail below', '詳細は下に記載', '見下方明細'],
    errors_empty=['日期为空', 'The date is empty', '日付が空です', '日期為空'],
    errors_notADate=['日期格式无法识别', 'That date cannot be read', '日付の形式が分かりません', '日期格式無法辨識'],
    errors_outOfRange=['日期超出范围', 'That date is out of range', '日付が範囲外です', '日期超出範圍'],
)

tool(
    'scientific-calculator',
    notice=['按表达式求值，支持三角函数、对数与幂运算，全部在本地完成。',
            'Evaluate an expression with trigonometry, logs and powers, entirely on this device.',
            '三角関数・対数・べき乗に対応した式を、この端末だけで計算します。',
            '依運算式求值，支援三角函式、對數與冪運算，全部在本地完成。'],
    inputLabel=['算式', 'Expression', '計算式', '運算式'],
    placeholder=['例如 sqrt(144) / 0.5 + sin(30) ^ 2', 'e.g. sqrt(144) / 0.5 + sin(30) ^ 2',
                 '例: sqrt(144) / 0.5 + sin(30) ^ 2', '例如 sqrt(144) / 0.5 + sin(30) ^ 2'],
    runButton=['计算', 'Evaluate', '計算する', '計算'],
    outputTitle=['计算结果', 'Result', '計算結果', '計算結果'],
    outputAria=['科学计算结果', 'Scientific calculation result', '科学計算の結果', '科學計算結果'],
    emptyInput=['请输入算式', 'Enter an expression', '計算式を入力してください', '請輸入運算式'],
    doneStatus=['计算完成', 'Evaluated', '計算が完了しました', '計算完成'],
    exact=['精确值', 'Exact value', '正確な値', '精確值'],
    precisionUsed=['有效数字', 'Significant digits', '有効数字', '有效位數'],
    atChar=['位于第 {position} 个字符', 'at character {position}', '{position} 文字目', '位於第 {position} 個字元'],
    opt_angle=['三角函数角度', 'Angle unit', '三角関数の角度', '三角函式角度'],
    opt_angleValues_degree=['角度 deg', 'Degrees deg', '度数 deg', '角度 deg'],
    opt_angleValues_radian=['弧度 rad', 'Radians rad', 'ラジアン rad', '弧度 rad'],
    opt_precision=['有效数字位数', 'Significant digits', '有効数字の桁数', '有效位數位數'],
    precisionValue=['12', '12', '12', '12'],
    modes_deg=['按角度计算', 'degrees', '度数で計算', '按角度計算'],
    modes_rad=['按弧度计算', 'radians', 'ラジアンで計算', '按弧度計算'],
    stat_valueLabel=['结果', 'Value', '値', '結果'],
    stat_degreeLabel=['角度', 'Degrees', '度数', '角度'],
    stat_radianLabel=['弧度', 'Radians', 'ラジアン', '弧度'],
    stat_expressionLabel=['算式', 'Expression', '計算式', '運算式'],
    errors_empty=['算式为空', 'The expression is empty', '計算式が空です', '運算式為空'],
    errors_unexpected=['出现意外的符号', 'An unexpected token', '予期しない記号があります', '出現非預期的符號'],
    errors_unbalanced=['括号没有配对', 'The parentheses do not balance', '括弧が対応していません', '括號未配對'],
    errors_unknownName=['未知名称', 'Unknown name', '不明な名前です', '未知名稱'],
    errors_badArguments=['函数的参数个数不对', 'Wrong number of arguments', '引数の個数が違います', '函式的參數個數不對'],
    errors_notFinite=['结果不是一个有限的数', 'The result is not a finite number', '結果が有限の数になりません', '結果不是有限的數'],
)

tool(
    'color-converter',
    notice=['在 HEX、rgb()、hsl() 与 OKLCH 之间换算，并给出相对亮度。内容不会离开当前设备。',
            'Convert between HEX, rgb(), hsl() and OKLCH, with relative luminance. Nothing leaves this device.',
            'HEX・rgb()・hsl()・OKLCH を相互変換し、相対輝度も表示します。内容は端末から出ません。',
            '在 HEX、rgb()、hsl() 與 OKLCH 之間換算，並給出相對亮度。內容不會離開目前裝置。'],
    inputLabel=['待转换颜色', 'Colour to convert', '変換する色', '待換算顏色'],
    placeholder=['#3b82f6、rgb(59 130 246) 或 hsl(217 91% 60%)', '#3b82f6, rgb(59 130 246) or hsl(217 91% 60%)',
                 '#3b82f6、rgb(59 130 246)、hsl(217 91% 60%)', '#3b82f6、rgb(59 130 246) 或 hsl(217 91% 60%)'],
    runButton=['转换颜色', 'Convert', '色を変換', '換算顏色'],
    outputTitle=['转换结果', 'Converted colour', '変換結果', '換算結果'],
    outputAria=['颜色转换结果', 'Colour conversion result', '色の変換結果', '顏色換算結果'],
    emptyInput=['请输入颜色值', 'Enter a colour first', '先に色を入力してください', '請先輸入顏色值'],
    doneStatus=['转换完成', 'Colour converted', '変換が完了しました', '換算完成'],
    luminance=['相对亮度', 'Relative luminance', '相対輝度', '相對亮度'],
    readableInk=['在此时可读的文字色', 'Most readable ink', '最も読みやすい文字色', '此時可讀的文字色'],
    opt_color=['取色器', 'Picker', 'ピッカー', '取色器'],
    colorPlaceholder=['#3b82f6', '#3b82f6', '#3b82f6', '#3b82f6'],
    opt_shortHex=['使用短 HEX', 'Short HEX', '短縮 HEX', '使用短 HEX'],
    opt_withAlpha=['包含透明度', 'Include alpha', 'アルファを含める', '包含透明度'],
    stat_hexLabel=['HEX', 'HEX', 'HEX', 'HEX'],
    stat_rgbLabel=['rgb()', 'rgb()', 'rgb()', 'rgb()'],
    stat_hslLabel=['hsl()', 'hsl()', 'hsl()', 'hsl()'],
    stat_oklchLabel=['OKLCH', 'OKLCH', 'OKLCH', 'OKLCH'],
    stat_luminanceLabel=['亮度', 'Luminance', '輝度', '亮度'],
    errors_empty=['输入为空', 'The input is empty', '入力が空です', '輸入為空'],
    errors_notAColor=['无法识别这个颜色值', 'That colour cannot be read', 'この色は読み取れません', '無法辨識這個顏色值'],
    errors_outOfRange=['通道值超出范围', 'A channel is out of range', 'チャネル値が範囲外です', '通道值超出範圍'],
)

tool(
    'contrast-checker',
    notice=['计算两种颜色之间的 WCAG 对比度，并给出等级与建议。内容不会离开当前设备。',
            'Work out the WCAG contrast between two colours, with the grade and what to do about it. Nothing leaves this device.',
            '2 色の WCAG コントラストを計算し、判定と対策を表示します。内容は端末から出ません。',
            '計算兩種顏色之間的 WCAG 對比度，並給出等級與建議。內容不會離開目前裝置。'],
    inputLabel=['配色说明', 'Palette notes', '配色のメモ', '配色說明'],
    placeholder=['记下这套配色的用途…', 'A note about where this palette is used…',
                 'この配色の用途をメモ…', '記下這套配色的用途…'],
    runButton=['检查对比度', 'Check contrast', 'コントラストを確認', '檢查對比度'],
    outputTitle=['对比度结果', 'Contrast report', 'コントラスト結果', '對比度結果'],
    outputAria=['WCAG 对比度结果', 'WCAG contrast report', 'WCAG コントラストの結果', 'WCAG 對比度結果'],
    doneStatus=['对比度 {ratio}:1', 'Contrast {ratio}:1', 'コントラスト {ratio}:1', '對比度 {ratio}:1'],
    opt_foreground=['文字颜色', 'Text colour', '文字色', '文字顏色'],
    foregroundPlaceholder=['#1f2937 或 white', '#1f2937 or white', '#1f2937 または white', '#1f2937 或 white'],
    opt_background=['背景颜色', 'Background colour', '背景色', '背景顏色'],
    backgroundPlaceholder=['#ffffff 或 paper', '#ffffff or paper', '#ffffff または paper', '#ffffff 或 paper'],
    opt_textSize=['文字大小', 'Text size', '文字サイズ', '文字大小'],
    opt_textSizeValues_normalText=['普通文字', 'Normal text', '通常の文字', '一般文字'],
    opt_textSizeValues_largeText=['大号文字（18pt 以上或 14pt 粗体）', 'Large text (18pt+, or 14pt bold)',
                                   '大きな文字（18pt 以上、または 14pt の太字）', '大號文字（18pt 以上或 14pt 粗體）'],
    stat_ratioLabel=['对比度', 'Ratio', 'コントラスト', '對比度'],
    stat_gradeLabel=['等级', 'Grade', '判定', '等級'],
    stat_foregroundLabel=['文字色', 'Text', '文字色', '文字色'],
    stat_backgroundLabel=['背景色', 'Background', '背景色', '背景色'],
    grades_aaa=['AAA（7:1 以上）', 'AAA (7:1 or more)', 'AAA（7:1 以上）', 'AAA（7:1 以上）'],
    grades_aa=['AA（4.5:1 以上）', 'AA (4.5:1 or more)', 'AA（4.5:1 以上）', 'AA（4.5:1 以上）'],
    **{'grades_aa~large': ['AA 大号文字（3:1 以上）', 'AA large text (3:1 or more)', 'AA 大きな文字（3:1 以上）', 'AA 大號文字（3:1 以上）']},
    grades_fail=['未达标', 'Fails', '不合格', '未達標'],
    row_foreground=['文字颜色', 'Text', '文字色', '文字顏色'],
    row_background=['背景颜色', 'Background', '背景色', '背景顏色'],
    row_composited=['叠加后的文字色', 'Text over background', '合成後の文字色', '疊加後的文字色'],
    row_luminance=['相对亮度', 'Relative luminance', '相対輝度', '相對亮度'],
    row_grade=['判定', 'Verdict', '判定', '判定'],
    row_required=['需要的比值', 'Ratio needed', '必要な比', '需要的比值'],
    row_ink=['建议的文字色', 'Suggested ink', '推奨する文字色', '建議的文字色'],
    row_flipped=['反过来看', 'Swapped', '逆向き', '反過來看'],
    errors_notAColor=['颜色值无法识别', 'A colour cannot be read', '色を読み取れません', '顏色值無法辨識'],
)


def path_of(name: str) -> str:
    """`opt_indentValues_two` -> `opt.indentValues.two`, `grades_aa~large` -> `grades.aa-large`."""
    prefix, rest = '', name
    for candidate in ('opt_', 'stat_', 'errors_'):
        if name.startswith(candidate):
            prefix, rest = candidate[:-1], name[len(candidate):]
            break
    parts = [prefix] if prefix else []
    if '_' in rest:
        group, leaf = rest.rsplit('_', 1)
        parts.append(group)
    else:
        leaf = rest
    parts.append(leaf)
    return '.'.join(part.replace('~', '-') for part in parts if part)


def literal(value: str) -> str:
    """Single-quoted TypeScript source for one value."""
    return value.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n')


def name_of(raw: str) -> str:
    return raw if re.fullmatch(r'[A-Za-z_$][A-Za-z0-9_$]*', raw) else f"'{raw}'"


def render(tool_id: str, keys: dict[str, list[str]], language: int) -> str:
    """One `toolUi` entry per tool, with nested groups, in the existing dictionary style."""
    groups: dict[str, list[tuple[str, str]]] = {}
    for name, values in keys.items():
        key = path_of(name)
        head, _, leaf = key.rpartition('.')
        groups.setdefault(head, []).append((leaf, values[language]))

    lines = [f"    '{tool_id}': {{\n"]
    for head, entries in groups.items():
        body = ', '.join(
            f"{name_of(leaf)}: '{literal(value)}'" for leaf, value in entries
        )
        lines.append(f"      {name_of(head)}: {{ {body} }},\n" if head else f"      {body},\n")
    lines.append('    },\n')
    return ''.join(lines)


def main() -> None:
    root = pathlib.Path('src/i18n/locales')
    for language, code in enumerate(LANGUAGES):
        path = root / f'{code}.ts'
        text = path.read_text()
        block = ''.join(render(tool_id, keys, language) for tool_id, keys in TOOLS.items())
        if START in text:
            head, _, rest = text.partition(START)
            _, _, tail = rest.partition(END)
            text = head + START + block + END + tail
        else:
            anchor = '  toolUi: {\n'
            if anchor not in text:
                raise SystemExit(f'no toolUi block in {path}')
            text = text.replace(anchor, anchor + START + block + END, 1)
        path.write_text(text)
        print('updated', path)


if __name__ == '__main__':
    main()