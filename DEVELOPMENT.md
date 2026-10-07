# 透明质的工具箱开发规范

## 1. 项目概览

透明质的工具箱是一个基于 Astro 的静态开发者工具聚合站。

### 技术栈

- Astro 5：静态页面生成与组件渲染
- TypeScript：类型检查与客户端脚本
- CryptoJS：文本 MD5 计算
- hash-wasm：大文件流式 MD5 计算
- Iconify：通过 `astro-icon` 使用 Lucide、MDI 图标
- Node.js Test Runner：算法与数据逻辑测试

项目当前使用 `output: 'static'`，所有页面在构建时生成到 `dist/`，不依赖服务端运行环境。

## 2. 常用命令

```bash
npm run dev       # 启动开发服务器
npm run check     # Astro 类型与模板检查
npm test          # 运行 Node.js 单元测试
npm run build     # 构建静态文件到 dist/
npm run preview   # 预览 dist/ 构建结果
```

提交前至少执行：

```bash
npm run check
npm test
npm run build
```

## 3. 目录结构

```text
src/
├── components/
│   ├── ui/                 # 通用 UI 组件
│   ├── tools/              # 工具页面组件
│   ├── Dashboard.astro     # 首页工作台
│   ├── Header.astro        # 顶部导航
│   ├── Sidebar.astro       # 左侧工具导航
│   └── ...
├── data/
│   └── tools.ts            # 工具注册表与分类配置
├── layouts/
│   └── BaseLayout.astro    # 页面公共布局
├── pages/
│   ├── index.astro         # 首页
│   ├── favorites.astro     # 我的收藏
│   └── tools/              # 工具中心与动态工具页
├── scripts/                # 浏览器端交互脚本
├── styles/
│   └── global.css          # 全局样式与设计变量
└── icons/                  # 本地图标目录，可选
```

## 4. 页面与组件规范

### 4.1 页面

- 页面放在 `src/pages/`，文件名对应 URL。
- 页面统一使用 `BaseLayout.astro`，通过 `activeNav` 和 `activeTool` 设置导航状态。
- 工具详情页使用 `src/pages/tools/[tool].astro`，工具列表来自 `src/data/tools.ts` 的 `tools`。
- 不在页面中写工具业务逻辑，页面只负责组合组件和提供挂载点。

### 4.2 组件

- 通用组件放在 `src/components/ui/`。
- 业务组件放在 `src/components/` 或 `src/components/tools/`。
- 组件 Props 必须使用 TypeScript interface 定义。
- 组件通过 `class` 参数接收布局类，不在通用组件中写具体业务选择器。
- 可复用组件不得直接依赖某个页面的业务数据。
- 组件默认保持无状态；需要状态时使用原生 DOM API 或第 7 节的存储表。

当前通用组件包括：

- `Button.astro`
- `IconButton.astro`
- `Card.astro`
- `SectionHeading.astro`
- `CheckboxField.astro`
- `SelectField.astro`

### 4.3 客户端脚本

- 只在需要交互的组件或页面中加载脚本。
- 脚本使用 TypeScript，避免使用隐式 `any`。
- 事件监听使用明确的事件类型。
- 处理计算、拖拽、选择等异步流程时，必须提供取消、异常和状态恢复逻辑。
- 页面导航由 Astro 完成，不使用客户端路由模拟页面跳转。

## 5. 新增工具

新增工具时按以下顺序修改：

1. 在 `src/data/tools.ts` 的 `tools` 中添加工具信息。
2. 在 `src/components/tools/` 创建工具组件。
3. 在 `src/components/ToolPage.astro` 增加工具组件映射。
4. 为工具的纯逻辑补充 `tests/` 测试。
5. 在工具组件中引入必要的客户端脚本。
6. 执行检查、测试和静态构建。

工具信息至少包含：

```ts
{
  id: 'tool-id',
  name: '工具名称',
  description: '简短描述',
  category: '所属分类',
  icon: 'lucide:icon-name',
  keywords: ['搜索关键词'],
  available: true
}
```

`id` 必须稳定且唯一，URL 使用 `/tools/${id}/`。

## 6. 样式规范

视觉规范以 `ui-design-spec.md` 为准，开发实现遵循以下原则：

- 颜色使用 `global.css` 中的 OKLCH CSS 变量，不在组件中新增硬编码主题色。
- 使用 4px 基准间距系统和已有 spacing 变量。
- 当前项目采用锐利直角风格，组件默认 `border-radius: 0`。
- 不使用装饰性圆角、复杂缩放、位移或渐变 hover。
- hover 只允许改变颜色、背景、边框或透明度等轻量状态。
- 动效必须服务于状态反馈，并遵守 `prefers-reduced-motion`。
- 弹层、下拉列表和 Toast 使用 `--z-popover`、`--z-toast` 等层级变量。
- 全局浮层（如草稿纸）使用 `--z-scratchpad`，它高于 Toast，切换页面后必须由 `astro:before-swap` 迁移到新文档，不能留下重复节点。
- 任何 `hidden` 元素都必须使用全局 `[hidden] { display: none !important; }` 规则，避免被组件的 `display` 样式覆盖。
- 进度条、加载条必须显式设置 `display`、`width` 和 `height`，不能依赖内容撑开尺寸。
- 新增响应式规则时注意媒体查询作用域，避免基础样式误放进移动端媒体查询。

## 7. 状态与本地存储

所有需要记住的东西都放在同一个 IndexedDB 表里：数据库 `code-space`，对象仓库
`kv`（out-of-line 字符串键），入口是 `src/lib/storage.ts`。业务代码不要直接
调用 `localStorage`、`sessionStorage` 或 `indexedDB`，一律走
`readValue` / `writeValue` / `storage()`。

| Key | 用途 |
| --- | --- |
| `code-space-theme` | 明暗主题 |
| `code-space-locale` | 界面语言 |
| `code-space-usage` | 工具使用记录 |
| `code-space-fortune-seed` | 本机运势的随机种子（每人一份） |
| `code-space-fortune-unlock` | 已解锁今日运势的本地日期 `YYYY-MM-DD`（每天一次） |
| `code-space-favorites` | 收藏工具列表 |
| `code-space-scratchpad` | 草稿纸的标题、正文与字体（跨标签页共享） |
| `code-space-scratchpad-view:<tabId>` | 草稿纸的位置与折叠状态（按标签页独立） |
| `tron-lottery:stats` | TRON 抽奖记录 |
| `tron-lottery:posterior-basis` | TRON 推断方式 |

关于这张表的几条约定：

- 读取是同步的，因为整张表在启动时会被读进内存快照；写入先落快照，再以
  120ms 批量写回数据库。
- 打开数据库需要时间。页面构建期间就要读值的代码，必须用 `whenStorageReady`
  包一层，否则读到的是空表。
- 跨标签页同步走 `BroadcastChannel('code-space-storage')`；广播里空字符串表示
  「这个键被删了」。
- 主题和语言额外镜像到 `cs-code-space-theme` / `cs-code-space-locale` cookie，
  因为 `<head>` 里的内联脚本必须在首屏绘制前读到它们，而 IndexedDB 是异步的。
  cookie 只是镜像，真实数据仍以表为准。
- 旧版本的 `localStorage` / `sessionStorage` 数据在启动时自动搬进表里，搬完
  即删除；不属于本站前缀的键不动。`sessionStorage` 只保留 `code-space-tab-id`
  这一随机标签页身份，不是用户数据。
- 存储不可用（隐私模式、配额满）时不能阻塞页面功能：`StorageTable` 会退回空
  快照，页面照常工作。

### 今日运势的每日解锁

首页运势卡默认是**封**的：K 线、分数、较昨日涨跌和文案都是真实值，只是被
`filter: blur()` 和降透明度盖住（`--fortune-seal-*`），点击一次才揭晓。这是刻意的
取舍——模糊真实值而不是替换成假值，读者揭晓时看到的才是本来就在等他的那份运势，
不会出现「揭晓时换了一个人」的错觉。

`code-space-fortune-unlock` 只存**一个**本地日期 `YYYY-MM-DD`，就是最近一次解锁的
那天，日期键规则与 `src/lib/day-series.ts` 相同（用本地日期部分拼，不经过 UTC）。
只存一天就够：判断只需要「存的那天是不是今天」，不存历史，所以清表只会让读者多点
一次，而不会丢掉记录。

几条约定：

- 判定逻辑在 `src/lib/fortune-unlock.ts`，纯函数 + 表读写，node 里可测。
- 日期键走本地日历，而 K 线也是按本地午夜切的（`localOffsetMs`），两者必须同时翻页，
  否则东八区的读者会在 UTC 午夜后被提前八小时要求再点一次。
- 这是**一天**而不是一段时长：一周后再回来仍然是封的，这才是这条规则的意义。
- 封着的卡里那几个块带 `inert`（`.fortune-reveal` 与图表 figure），因为模糊做不到
  「移出 Tab 序」；解锁按钮居中盖在整张卡上，是唯一留在 Tab 序里的东西。
- 图形的 tooltip、峰值读数和 ECharts 的 aria 描述都由 `renderFortuneChart` 的第四个
  参数 `sealed` 关掉：模糊管不到 canvas 自己交出去的数字。
- 写走 `storage()`，同一读者的其他标签页会收到广播并跟着封上。

### 工具使用记录

`code-space-usage` 分三部分，含义不同，不要混用：

- `log`：**逐次**使用记录，每条是 `{ id, at }`，`id` 是工具 id，`at` 是该次使用的
  ISO 时间。它是关于「什么时候用了哪个工具」的唯一事实来源，今日次数、每日曲线
  和最近使用列表都在读取时从它算出来（`src/lib/usage-history.ts`），不另存一份，
  以免两份数据对不上。上限 `usageLogLimit` 条，满了丢最旧的。
- `total` / `byTool`：历史累计次数和每个工具的累计次数。这两个不能从 `log` 推导，
  否则 `log` 截断后「累计使用」会突然变小。
- `daily` 不再落盘：`dayCounts` 每次读取时按读者所在时区把 `log` 折算成每日次数，
  只保留 `usageDayHistory` 天。日期键一律用本地 `YYYY-MM-DD`，规则见
  `src/lib/day-series.ts`。

数据页会整表导出这条记录，所以 `log` 的长度直接影响那一行的体积。

数据页 `/[locale]/data/` 提供整表导出、合并导入和清空，格式见
`src/lib/storage-schema.ts`（`{ app, version, exportedAt, entries }`）。

## 8. 交互与可访问性

- 所有输入控件必须有关联的 `label` 或 `aria-label`。
- 键盘可操作控件必须支持 Enter、Space 和 Escape。
- 复选框必须明确表达选中状态，未选中状态不能显示对钩。
- 收藏按钮必须通过 `aria-pressed` 表达状态，并使用空心/实心图标切换。
- 自定义下拉列表必须提供 `listbox`、`option`、`aria-selected` 和 `aria-expanded`。
- 计算进行中应锁定会改变输入内容的交互，只保留必要的取消操作。
- 大文件计算必须流式处理、及时让出主线程并展示进度。
- 动态内容更新后要保证键盘焦点和可访问性属性仍然正确。

## 9. 测试要求

- MD5 文本结果必须与 Node.js `crypto` 结果对照。
- 至少覆盖空字符串、ASCII、UTF-8 和二进制数据。
- 新增纯函数优先使用 Node.js Test Runner 测试。
- 浏览器交互逻辑至少通过 `npm run check` 验证类型和模板。
- 不使用真实用户输入、密钥或敏感数据作为测试数据。

## 10. 提交规范

- 提交前确认 `git status` 无意外生成文件。
- 不提交 `node_modules/`、`dist/`、`.astro/` 和本地环境文件。
- 提交信息使用简洁的动词开头，可使用 emoji，例如：
  - `✨ 新增工具中心`
  - `🐛 修复大文件计算进度`
  - `🎨 调整工具卡片样式`
- 一个提交只包含一个明确的变更主题。

## 11. UI 规范位置

视觉颜色、字体、间距、圆角、阴影、动效、响应式和可访问性的完整设计要求见：

[`ui-design-spec.md`](./ui-design-spec.md)
