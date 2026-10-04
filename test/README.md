# test/ — ProfileImg-Plugin 回归套件

## 运行

```bash
cd app/plugins/ProfileImg-Plugin
pnpm test                        # = node test/run.mjs（任意 cwd 可跑）
node test/run.mjs --list         # 列清单
node test/run.mjs --filter=probe # 只跑文件名含 probe 的
node test/xxx.test.mjs           # 单跑（任意 cwd）
```

不启动 bot：直接跑真实生产代码路径。**缺前置打印「⏭ 跳过」并 exit 0**；断言失败 exit 1。

## 约定

- 命名 `<主题>.test.mjs`，主题写**被测行为**（如 `src-probe` / `default-segment-name`）
- 路径一律经 `test/_helper.mjs` 推导（`pluginRoot` / `appRoot` / `miaoConfigDir` / `tmpDir` / `mod()`），**禁止裸相对字面量与盘符绝对路径**
- 临时产物只写 `test/.test-tmp/`（已 gitignore）
- 需要临时改真实文件的套件必须**可逆**（如 `gallery-index` 在默认图库建测试角色目录，`finally` 清理；`migrate-precheck` 只读校验 miao 配置字节不变）
- 只走公开 API + `installFrameworkStubs()` 提供的框架全局桩（`logger` / `redis` / `cfg` / `segment` / `plugin`）
- **只测对外行为与契约**：不为测试给内部实现加导出（如节流/文案等内部函数不导出），不写只覆盖死代码的断言
- 必须有断言与退出码（只打印不判定的脚本不是回归）

## 套件清单

| 套件 | 覆盖 | 前置 |
|------|------|------|
| `src-probe.test.mjs` | 图库源结构探测：tier / 平铺 / 危险平铺（含图非角色目录）/ 空仓库 / 后缀大小写 / **一层分组**（不依赖命名、工具与隐藏目录跳过、分组内分层、角色目录里放图不误判、标签用原始目录名）/ `resolveSourceDirs` 展开（第三方可展开、主仓库不可）/ `resolveRoleFilePath` 定位（tier 分层 / 平铺 / 分组子源 / 未命中返回 null） | 无 |
| `profile-src.test.mjs` | miao `profile.js` 读写：能力探测、模板复制生成、声明段替换保留注释与其他 export、往返一致、追加模式、幂等、边界拒绝；源列表构建：一层分组展开为多个子图库、主仓库不支持分组（记 skipped） | miao-plugin 配置模板 |
| `migrate-precheck.test.mjs` | 迁移预检：三态判定、报告结构、**预检只读**（miao 配置字节与目录不变） | miao-plugin 配置模板 |
| `default-segment-name.test.mjs` | default 段位命名：有版权 / 有备注 / 无版权 / 非标准命名的重命名规则、原名「」备注、扩展名与段位号 | 无 |
| `gallery-index.test.mjs` | 多源索引：源列表（含第三方一层分组展开为 `图库名·gs-character` 等，标签用原始目录名）、跨源读取、段位升序、`.bak`/非图片排除、按序号寻址、统计（夹具建在默认图库与临时分组目录，可逆清理） | miao-plugin 配置模板 |
| `layout-guard.test.mjs` | 布局守卫：legacy 一律拦截、fresh 默认拦截但 `allowFresh` 放行、ready 放行（按当前环境状态分支断言） | miao-plugin 配置模板 |
| `layout-notice.test.mjs` | 启动布局提示：三个状态（legacy / fresh / srcPending）文案、24h 同状态节流与状态间独立、发送失败不记录（下次重试）、主人不可用不发送（只经 `notifyLayout` 公开入口） | 无 |
| `status-output.test.mjs` | 状态输出不回显绝对路径、`statSource` 规模口径（平铺跳过 `.git`、分层只算 normal/super、角色/图片计数、目录缺失归零） | 无 |
| `repo-branch.test.mjs` | 仓库默认分支探测：main / master / 自定义 / 空仓库 / 非仓库回退 | git 可执行文件 |
| `git-args.test.mjs` | Git 参数安全：分支名含 shell 元字符（`&`）或以 `-` 开头（`--upload-pack` 参数注入）一律拒绝、地址白名单（`-` 开头 / 空值拒绝且不启动 Git）、合法地址与多级分支不误伤、探测不可达地址回退 main、本地 HEAD 非法分支名回退 main | git 可执行文件 |
| `migrate-run.test.mjs` | **旧布局迁移实跑（沙箱）**：源码复制到 `test/.test-tmp/migrate-run/` 并 chdir，真实执行 `migrateToMultiSrc()`——损坏 junction 仍判 legacy、junction 移除与 default 搬迁/段位规范化、第三方副本清理、`.bak` 屏蔽状态迁移到第三方源（含一层分组与图库名含 `_`）、源内缺文件必须告警、各分组子源写入 `profileImgSrc`、重跑迁移时同名冲突保留 `.conflict` 且不覆盖目标 | 可创建 junction 的平台 |
| `gallery-lock.test.mjs` | 操作锁：锁 id 归属（第三方统一、路径→主仓库）、二次获取被拒、release 后可再取、多锁整体获取与失败回滚、过期与损坏锁可接管、锁文件名消毒 | 无 |
| `preview-panel.test.mjs` | 预览数据层：虚拟面板构造（原神 90 / 星铁 80 与 promote 不越界、伪造圣遗物生效、默认武器可用、不生成 PlayerData 文件）、渲染数据组装（模板必需字段齐备、属性 Base/Plus、评分、立绘换成该序号图、星铁行迹 9 格、伤害计算与无规则时安全跳过）、立绘定位与路径转换（命中序号 / 不存在返回 null、同盘相对路径编码、跨盘 `file://`）、命令解析与占位骨架（`#`=原神 / `*`=星铁 / `#星铁`、`#原神` / 非法命令 null；已知角色不受前缀影响，未收录角色按前缀借胡桃 / 三月七骨架且名字头像换成目标角色）、失败分支（角色不存在 / 序号不存在明确提示）；夹具为默认图库临时角色目录，可逆清理 | miao-plugin 内部模块与面板模板 |
| `replace-image.test.mjs` | 替换命令：同名覆盖后文件名/序号不变、PNG 源被转成目标扩展名格式（webp）、未带图片与序号无效的提示、同格式替换同样生效（图片走 data: URL，不联网） | 无 |
| `third-party-path.test.mjs` | 第三方图库目录解析：旧相对名 / 正反斜杠绝对路径 / UNC / 空值；安装目标目录为非 Git 且非空时拒绝覆盖（含场景提示与目录未改动） | 无 |
| `unregistered-repo.test.mjs` | 未登记目录发现与补登记：Git 仓库 / 非 git 但结构可直读（含一层分组）/ 主仓库保留名 / 旧布局 `default` 目录 / 已登记 / 非图库 / 隐藏目录排除，`addThirdPartyRepo` 按绝对路径幂等且回写绝对路径、`autoRegisterUnregisteredRepos` 扫描后写配置并保留模板注释（夹具在临时目录与临时配置内） | 无 |
| `guoba-schema.test.mjs` | 锅巴 schema 可加载、thirdParty 不含退役字段、defSet 模板变量与 defaultValues 一致、配置写入保留模板注释且可往返解析、注释刷新幂等与自定义键跳过 | 无 |
| `smoke-imports.test.mjs` | 全部 apps / model / modules / components 可加载、导出非空、`getDefaultDir()`/`LEGACY_DEFAULT_DIR` 路径语义、仓库级 `cron`/`autoRestart` 退役字段已清除、`buildSyncReport`/`restartHint` 文案统一且不含具体方式、四个命令模块复用统一文案来源、Git 调用一律 argv（无 `exec/execSync` 拼串）、第三方三类操作共用 `thirdPartyLockId`、更新失败必判 `result.ok` 且不记版本、主图库下载走分支探测、上传取号与写盘之间无 await、四个文件操作命令都取源级锁、预览改用本插件内渲染（不再改写消息、不依赖 fork 私有能力、只用相对路径 import miao） | 无 |
