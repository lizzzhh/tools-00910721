# 码间开发规范

## 1. 项目概览

码间是一个基于 Astro 的静态开发者工具聚合站。

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
- 组件默认保持无状态；需要状态时使用原生 DOM API、`localStorage` 或后续统一的状态模块。

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
- 任何 `hidden` 元素都必须使用全局 `[hidden] { display: none !important; }` 规则，避免被组件的 `display` 样式覆盖。
- 进度条、加载条必须显式设置 `display`、`width` 和 `height`，不能依赖内容撑开尺寸。
- 新增响应式规则时注意媒体查询作用域，避免基础样式误放进移动端媒体查询。

## 7. 状态与本地存储

当前使用的 `localStorage` 键：

| Key | 用途 |
| --- | --- |
| `code-space-theme` | 明暗主题 |
| `code-space-usage` | 工具使用统计 |
| `code-space-daily-fortune` | 每日运势结果 |
| `code-space-favorites` | 收藏工具列表 |

读写 `localStorage` 时必须进行异常处理，存储不可用时不能阻塞页面功能。

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
