# AGENTS.md

This file provides project-level guidance to AI coding agents (DSH) when working with code in this repository.

## 项目概况

ProfileImg-Plugin — miao-plugin 的面板图图库管理器：管理多个图库源（默认图库 / 各主仓库 / 第三方只读源 + 屏蔽图库），ESM（`"type": "module"`），依赖 `sharp` 与 `yaml`。

- **依赖 miao-plugin 2.5.20+** — 图库通过 `profileImgSrc`（`miao-plugin/config/profile.js`）注册给 miao 读；`#预览` 另需 miao 的面板模板与内部模块
- **可选依赖 Atlas-Plugin** — 角色别名来源优先用其 `modules/aliasApi.js` 门面（未安装 / 表为空则本地兜底），见 [`docs/模块-别名.md`](docs/模块-别名.md)
- **单入口** — 有 `index.js` 时框架不注册文件 watcher（无热重载），任何 `.js` / 模板改动都要**完整重启** Yunzai
- **文档入库范围** — `AGENTS.md` 与 `docs/` **入库**，与代码一同提交；`docs/private/` 放本机路径与部署（**不入库**，新克隆上不存在），因此入库文档只写占位（`<bot根>` / `<插件根>`）且不得依赖它

当前提供：图库状态图（`#图库状态` / `#主图库状态` / `#屏蔽图库状态`）、`#图库帮助`、`#图库初始化`、`#迁移图库`、图库下载 / 更新 / 删除、面板图上传 / 替换 / 删除 / 屏蔽 / 启用 / 重命名、`#xx面板图列表`（含屏蔽列表）、`#xx面板图可视化`（含屏蔽可视化）、`#预览xx面板图N`。

**新增功能**：`apps/` 下新建一个 `.js` 文件（export 一个继承 `plugin` 的 class），`index.js` 自动发现，无需改入口。

### 快速参考

| 功能 | 文件 | 命令 | 权限 |
|------|------|------|------|
| 面板图上传 / 替换 | `apps/upload.js` | `#添加xx面板图 [作者] [来源] [备注]` / `#替换xx面板图N` + 图片 | 主人 / 授权成员 |
| 面板图预览 | `apps/previewProfileImg.js` | `#预览xx面板图N`（`*`=星铁，见 docs/模块-预览.md） | all |
| 面板图删除 | `apps/delProfileImg.js` | `#删除xx面板图N` | 主人 / 授权成员 |
| 面板图列表 | `apps/profileImgList.js` | `#xx面板图列表` / `#xx面板图屏蔽列表` / `#xx屏蔽面板图列表` | all |
| 面板图可视化 | `apps/visualize.js` | `#xx面板图可视化` / `#可视化xx` + 屏蔽三种写法 | all |
| 屏蔽 / 启用 | `apps/moveBlockImg.js` | `#屏蔽xx面板图 N` / `#启用xx面板图 N` | 主人 / 授权成员 |
| 重命名 | `apps/renameProfileImg.js` | `#重命名xx面板图N 作者 来源 [备注]` | master |
| 图库状态（出图） | `apps/status.js` | `#图库状态` / `#主图库状态` / `#屏蔽图库状态` | all |
| 帮助图 | `apps/help.js` | `#图库帮助` | all |
| 初始化 / 迁移 | `apps/initGallery.js` / `apps/migrateGallery.js` | `#图库初始化` / `#迁移图库` | master |
| 下载 / 更新 / 删除图库 | `apps/download.js` / `apps/update.js` | `#下载主图库` / `#主图库更新` / `#下载第三方图库 <URL> [目标目录]` / `#删除第三方图库 <名>` … | master |

## 文档索引（按需阅读，别一次全读）

| 想了解 / 要改的东西 | 先读 |
|---|---|
| 图库源布局、入口加载 7 步、目录与分层职责、序号段位、数据流、框架全局变量 | [`docs/架构.md`](docs/架构.md) |
| 配置三层、第三方源结构探测、登记流程、路径约定、成员权限、命名格式、map.json、存储路径 | [`docs/图库源与配置.md`](docs/图库源与配置.md) |
| UI 基调（`ui.css` / 宽度 / 字号）、三套出图页面（帮助 / 状态 / 可视化）、页脚版权行 | [`docs/UI-出图.md`](docs/UI-出图.md) |
| 面板图预览：虚拟面板、占位骨架、miao 渲染契约 | [`docs/模块-预览.md`](docs/模块-预览.md) |
| 角色别名：Atlas 门面优先、本地兜底冻结、watcher 二选一、两条路径差异 | [`docs/模块-别名.md`](docs/模块-别名.md) |
| 初始化 / 迁移 / 更新 / 锁与并发 / Git 规范 / 待办清单 | [`docs/维护与迁移.md`](docs/维护与迁移.md) |
| 盘符、部署流程、出图 POC 做法 | `docs/private/`（不入库） |

## 约定

1. **ESM** — 全部 `import` / `export`
2. **日志** — 前缀 `[ProfileImg-Plugin]`，级别只用 `info` / `warn` / `error`（框架等级 info，`debug` 等于不输出）；**调试日志不进仓库**——排查时临时加、验证完还原
3. **中文** — 注释、`name` / `dsc` 等字段、沟通一律简体中文
4. **一个 `apps/` 文件只导出一个 class** — 其余导出（常量 / 工具函数）随意，但 `index.js` 用 `isPluginClass()` 选取；多导出一个常量（ESM key 按名字排序，大写在前）会顶掉 class → **该命令整条规则静默不注册**（#预览 被 Atlas 接走就是这么来的），`smoke-imports` 套件断言「恰好一个 class」
5. **配置三层** — `defSet/config.yaml`（模板）→ `config/config.yaml`（运行时，git-ignored）→ `config/config.yaml.example`（参考）；`getPluginConfig` 兜底读 `.example`，**禁止**解析模板过滤 `${变量}`（空占位会生成非法 YAML）
6. **运行时数据不入库** — `config/*.yaml`、`data/`、`resources/gallery/*`（`map.json` 例外，入库）
7. **版本号** — `components/pluginVersion.js` 读插件 `package.json`；出图页脚用 `buildCopyright()`（框架名按 bot 根包名判定）
8. **回归套件** — 改到数据口径或共享链路时同步补 / 更新 `test/` 套件（`pnpm test`），见「## 测试」
9. **文档同步** — 功能 / 命令变更时更新文档站插件页（`guide/yunzai/plugins/ProfileImg-Plugin.md`，本机路径见 `docs/private/`）
10. **不自行发挥** — 只做明确要求的改动；先设计再实现，用户说「分析 / 排查 / 总结」时只分析不写代码

## 硬约束速查（踩坑清单，改前必读；细节见 docs）

1. **上传 / 删除 / 列表优先级 = 1** — 必须高于 miao-plugin 默认优先级才能拦截
2. **图库源配置只由 `model/profileSrc.js` 写** — 文本级替换 `profileImgSrc` 声明段、保留其它 export 与注释；手改会被启动时的幂等同步覆盖；miao 只在模块加载时读一次 → **变更后必须重启**
3. **段位寻址** — 默认图库 10001~99999、主仓库 1~9999 参与 `#面板图N`；第三方源不参与（仅展示）
4. **第三方图库必须登记在 `gallery_config.yaml`（唯一凭证，`dir` 绝对路径）** — 目录扫描结果**永不**直接作为 miao 源；未登记目录只在状态 / 日志里提示
5. **不覆盖本地图库** — 目标目录存在、非空、且无 `.git` 时拒绝下载
6. **上传序号在写盘前取** — `_getNextSeq()` 与 `writeFileSync` 之间不得有 await（否则并发撞号，删 / 屏蔽打错目标）
7. **写入的字节必须匹配扩展名** — 上传 / 替换统一走 `_toTargetFormat()`
8. **文件操作与 Git 更新共用源级锁** — 下载 / 更新 / 删除用 `thirdPartyLockId()`；改动主仓库或屏蔽图库文件用 `mainRepoLockIdForPath()` + `acquireLocks()`
9. **Git 调用一律 argv 参数化 + 白名单** — 不拼 shell 字符串；地址与分支名拒绝 `-` 开头
10. **星铁前缀就地放行** — 框架只把 `*` / 星铁系写法归一成 `#星铁`（不剥离），所以命令层只认 `星铁` 一个词，就地加可选 `(?:星铁)`（rule 与解析共用同一正则）；**别把星铁系各种写法或 `原神` 抄进正则**（日常词汇会误命中）
11. **同族命令的正则顺序：屏蔽写法必须排在普通写法之前** — 否则角色名会被吃进「屏蔽」二字（`visualize-cmd` 套件按框架顺序钉住）
12. **预览** — 游戏以 miao 数据为准；虚拟数据（伪造 UID `100000009`、不走 miao Player、假圣遗物用真实 id）；未收录角色借占位骨架；**渲染结果直接 `e.reply(图片段)`，不要自拼 `base64://`**
13. **UI 基调唯一来源 `resources/common/ui.css`** — 帮助 / 状态 750px、可视化 1000px，一律 `render(..., 'jpeg')`（png 会透明底）；标题旁标记要与标题同字体同字号
14. **状态图对所有人生效 → 渲染数据不得回显服务器绝对路径**（只给目录名）
15. **重启提示统一 `restartHint()`**（只说「重启 Yunzai」）；同步结果统一 `buildSyncReport()`
16. **列表合并转发上限 20 张**；可视化每页 20 张（4 列 × 5 行）
17. **锅巴 schema 每个大 label（SOFT_GROUP_BEGIN）一个文件** — `guoba/index.js` 只做拼装；`defSet/config.yaml` 的每个 `${变量}` 必须在 `guoba/index.js` 的 defaultValues 里有对应项
18. **别名来源 Atlas 优先** — `modules/alias.js` 先走 Atlas 门面（**动态 import + try/catch**，静态 import 会让未装 Atlas 的机器整插件加载失败）；未命中 / 不可用才用本地冻结实现；**watcher 二选一**（Atlas 可用时不挂本地那套）；`resolveRoleName(name, game)` 的 game 由命令侧传（`#预览` 用 `cmd.game`，其余用 `e.game`）

## 测试

回归套件在 `test/`（**入仓库**）：`pnpm test`（= `node test/run.mjs`，任意 cwd 可跑，缺前置打印「跳过」并 exit 0）。

| 套件 | 覆盖 |
|------|------|
| `src-probe` | 源结构探测（tier / 平铺 / 危险平铺 / 一层分组不依赖命名 / `resolveSourceDirs` / `resolveRoleFilePath`） |
| `profile-src` | miao `profile.js` 读写与能力探测 + 源列表构建（分组展开、主仓库不支持分组） |
| `migrate-precheck` / `migrate-run` | 迁移预检只读性 / 旧布局迁移实跑（沙箱：损坏 junction、段位规范化、`.conflict`、`.bak` 状态、分组子源写入） |
| `default-segment-name` | default 段位命名（有版权 / 备注 / 无版权 / 非标准 +「」原名） |
| `gallery-index` | 多源索引（源列表含分组展开、跨源读取、段位升序、`.bak` 排除、统计；夹具可逆） |
| `gallery-lock` | 锁：id 统一、二次获取被拒、release 后可取、多锁回滚、过期 / 损坏可接管、文件名消毒 |
| `preview-panel` | 虚拟面板（不落 PlayerData、星铁 promote 不越界）+ 渲染数据齐备 + 立绘路径 + 命令解析与占位骨架 + 失败分支 |
| `command-prefix` | 星铁前缀就地放行（角色名捕获干净）+ 非归一写法负例 + 预览解析 |
| `visualize-cmd` | 可视化 / 屏蔽列表写法路由（屏蔽优先、捕获干净）+ 屏蔽数据源 `.bak` 定位 |
| `replace-image` | 替换不改名 + PNG 转目标格式 + 未带图 / 序号无效提示（走 data: URL，不联网） |
| `layout-guard` / `layout-notice` | 布局守卫三态 / 启动提示三状态与 24h 节流、失败重试 |
| `guoba-schema` | 锅巴 schema 可加载、无退役字段、模板变量与 defaultValues 一致、写入保注释与刷新幂等 |
| `status-output` | 状态图数据安全（不回显绝对路径等）+ 第三方分组层级与更新时间（git 夹具）+ `statSource` 口径 |
| `repo-branch` / `git-args` | 默认分支探测 / Git 参数安全（含 `-` 开头拒绝） |
| `third-party-path` / `unregistered-repo` | 第三方路径解析与防覆盖 / 未登记目录发现与补登记 |
| `alias-fallback` | 别名兜底（Atlas 移交后冻结，不依赖 Atlas）：预设别名 / 精确 / 大小写不敏感 / 模糊唯一命中 / 未知原样返回、对外入口（Atlas 与兜底同答案、空输入）、`getAliasSource()` 摘要、cfg 覆盖预设与坏行跳过（仅 cfg 原本不存在时临时夹具） |
| `smoke-imports` | 全模块可加载 + 每个 app 恰好一个 class 且规则非空 + 关键语义（argv、锁、取号、预览、版权行） |

约定：命名 `<主题>.test.mjs`；路径一律经 `test/_helper.mjs` 的 `pluginRoot` / `mod()` 推导，**禁止裸相对字面量与盘符绝对路径**；框架全局用 `installFrameworkStubs()` 的内存实现；临时产物只写 `test/.test-tmp/`（已 gitignore）；**断言必须能真的失败**——新增套件应临时还原被修的代码确认转红后再入库。细节见 `test/README.md`。

## 待办

见 [`docs/维护与迁移.md`](docs/维护与迁移.md) 末节（阶段 3：迁移能力退役时点、第三方寻址增强、map.json 降级、资源与旧样式清理；别名来源已移交 Atlas，见 [`docs/模块-别名.md`](docs/模块-别名.md)）。
