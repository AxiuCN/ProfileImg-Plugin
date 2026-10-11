# UI：出图页面与基调

> 常驻规范见 [`../AGENTS.md`](../AGENTS.md)；改模板 / 样式 / 出图命令前读本文。

## 基调（唯一来源：`resources/common/ui.css`）

以**面板图可视化**的浅色现代风为准，`help` / `status` / `visualize` 都只在自己 `index.css` 里写页面特有布局，新页面照此写。

- tokens：`--text-primary #1e3a8a` / `--accent #2563eb` / `--line-color` / `--card-bg` / `--warn` / `--error-*`
- 字体：标题 `NZBZ`、数字 `Number`（本地 woff）、正文微软雅黑；组件：`.container` / `.header` + `.stat-card` / `.card` / `.badge*` / `.metrics` / `.footer`
- **宽度按内容定**（`ui.css` 不写 `body` 宽度，各页面自己定）：可视化 **1000px**（一行四列必须够宽），帮助 / 状态 **750px**（贴近手机屏宽，整图不被缩小、字才看得清）
- **字号基准**：正文 15 / 页标题 40 / 分组标题 22 / 命令名 17 / 说明 14 / 源名 21 / 数值 24 / 数值标签 12 / 徽标 12 / 表头数值 28
- 标题旁的标记（如可视化的「已屏蔽」）要与标题**同字体同字号**（NZBZ 40px），否则大标题旁挂小号无衬线胶囊会很怪
- 一律 `render(app, 'index', data, 'jpeg')`：**png 会置 `omitBackground` 让浅色底变透明**

## `components/render.js` 契约

```js
render(app, tpl, data, imgType)   // app = resources/ 下的目录名，tpl = 不含 .html
```
- 注入 `_res_path`（模板里 `{{_res_path}}common/ui.css`）、`saveId`、`pluResPath`、`pageGotoParams`、`sys.copyright`
- 返回的是 **puppeteer 已经包好的图片段**（`lib/puppeteer/puppeteer.js:9-12` 的 `segment.image(img)`），**直接 `e.reply(img)`**；自己拼 `base64://${img}` 会得到 `base64://[object Object]`、适配器报 `unsupported file type`、图发不出去（生产踩过）
- 渲染失败回退一句文本提示；状态图**没有文本版**（决定：只出图）

## 页面一：图库帮助（`resources/help/`）

- `apps/help.js` 动态读 `help-cfg.js`（`file://` + 时间戳绕模块缓存 → 改配置免重启）
- `help-cfg.js`：`helpCfg{title,subTitle}` + `helpList[{group, auth?, list:[{title, desc}]}]`；**不设 icon 字段**（已舍弃图标雪碧图）
- 分组 `auth:'master'` 且非主人 → **整组不出现**（保持这一行为，不做「显示+徽标」）
- 模板：header（标题 + 分隔线 + 指令数 / 分组数）+ 分组卡片（分组标题 + 「仅主人」橙标 + 「N 条」灰标）+ 命令行（左侧 3px 渐变竖条，不用图片图标）

## 页面二：图库状态（`resources/status/`）

- `apps/status.js` 三条命令（`#图库状态` / `#主图库状态` / `#屏蔽图库状态`）共用一套模板，靠 `modules/statusPanel.js` 的 `buildStatusData({ mode, thirdParty })` 出数据
- 数据结构：`{ mode, title, subTitle, stats[], sources[], sourceCount, blocked, unregistered[], empty }`
- **源卡片**：两位**顺序号徽标**（= `profileImgSrc` 读取顺序）+ 名称 + 类型徽标 + 目录名 + 角色/图片/体积 + `版本 sha · 更新 YYYY-MM-DD HH:mm`
- **层级**：第三方图库展开出的子文件夹归到**父图库条目**下（父行给「N 个文件夹」+ 合计 + 更新时间，子行缩进挂连接线给各自规模）；父条目落在该图库第一个子源的位置
- **屏蔽图库**：警示色独立区块（红左条 + 淡红底 + 红名字/数值/版本）；未安装 → 灰色空态卡
- 版本口径：主仓库与第三方图库都取（`getLocalVersionAt`，`updatedAt` 截到分钟、去时区）；**默认图库不取**（它在 miao-plugin 仓库里，版本与本插件无关）
- 未登记目录 → 橙色警示卡
- **`#图库状态` 对所有人生效 → 渲染数据不得回显服务器绝对路径**（只给目录名 basename；`status-output` 套件钉住）
- `sourceCount`（表头「图库源」）把分组子源各算一个

## 页面三：面板图可视化（`resources/visualize/`）

| 写法 | 命中 | 数据源 |
|------|------|--------|
| `#<角色>面板图可视化` / `#可视化<角色>` | 普通页 | `listRoleImages(role,'normal')` |
| `#<角色>面板图屏蔽可视化` / `#<角色>屏蔽面板图可视化` / `#屏蔽可视化<角色>` | 屏蔽页（标题 +「已屏蔽」标记、统计标签「屏蔽总数」） | `getBlockedAggregated(role)` |
| 以上都兼容框架归一后的 `#星铁…` | — | — |

- 每页 20 张（4 列 × 5 行）逐页发送；文件名：段位内 → `<n>. 文件名`，否则 `[源名] 文件名`
- 空结果回文本提示，不出空图
- **rule 顺序**：`RE_BLOCKED[0..2]` 必须排在 `RE_NORMAL[0..1]` 之前，否则角色名会被吃进「屏蔽」二字（`#遐蝶屏蔽面板图可视化` → 「遐蝶屏蔽」、`#屏蔽可视化遐蝶` → 「屏蔽遐蝶」）；函数内 `_parse()` 用同一组正则按同样顺序回取捕获组

## 页脚版权行

`components/pluginVersion.js` 的 `buildCopyright()`：框架名按 **bot 根 `package.json` 包名**判定（`trss-yunzai` → `TRSS-Yunzai`，否则 `Yunzai-Bot`，不再写死），名称与版本号之间**必须留空格**（否则渲染成 `Yunzai-Bot3.1.3`）。`smoke-imports` 套件断言这三点。
