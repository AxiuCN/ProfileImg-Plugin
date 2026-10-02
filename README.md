# ProfileImg-Plugin / 面板图图库管理器

miao-plugin 角色面板图图库管理器。基于 miao-plugin 2.5.20+ 的多图库源（`profileImgSrc`）机制，管理默认图库、主图库（多仓库）、第三方只读图库与屏蔽图库，支持面板图上传（含版权归属）、屏蔽/启用、状态查看、自动更新。

## 安装插件

在 Yunzai 根目录执行：

> Github
```bash
git clone --depth=1 https://github.com/AxiuCN/ProfileImg-Plugin ./plugins/ProfileImg-Plugin/
pnpm install -P --filter ProfileImg-Plugin
```

> Gitee
```bash
git clone --depth=1 https://gitee.com/AxiuCN/ProfileImg-Plugin ./plugins/ProfileImg-Plugin/
pnpm install -P --filter ProfileImg-Plugin
```

> Gitcode
```bash
git clone --depth=1 https://gitcode.com/AxiuCN/ProfileImg-Plugin ./plugins/ProfileImg-Plugin/
pnpm install -P --filter ProfileImg-Plugin
```

## 首次使用

安装插件后，发送 **`#图库初始化`**，然后按提示执行：

1. **`#图库初始化`** — 初始化多图库源布局（建默认图库目录 + 生成 miao 配置 `profile.js` + 注册图库源；源列表有变化需重启 Yunzai 生效）
2. **`#下载主图库`** — 克隆主图库 git 仓库并注册为图库源
3. **`#下载屏蔽图库`** — 克隆屏蔽图库

> 若之前是旧版图库布局，发送 `#迁移图库` 一次性升级到多图库源布局（完成后需重启 Yunzai）。
>
> 第三方图库用 `#下载第三方图库 <URL> [目标目录]` 克隆，插件会自动探测目录结构（`normal-character/{角色}/`、`super-character/{角色}/` 或平铺 `{角色}/`）并注册为图库源；目标目录可省略（默认落在 `gallery/ProfileImg/` 下），也可指定其他盘 / 网络盘路径；无法直读时会提示整理目录结构。
>
> 图库源列表变动后**必须重启 Yunzai**：miao 只在模块加载时读取一次 `profileImgSrc`。

## 指令列表

### 初始化与迁移（仅主人）

| 指令 | 说明 |
|------|------|
| `#图库初始化` | 初始化多图库源布局（生成 miao `config/profile.js` 并注册图库源） |
| `#迁移图库` | 旧版图库布局升级到多图库源布局（预检 `#确认` 后一次切换，完成后需重启 Yunzai） |
| `#下载主图库` | 克隆主图库仓库并注册为图库源 |
| `#强制下载主图库` | 删除现有仓库后重新 clone |
| `#下载屏蔽图库` | 克隆屏蔽图库 |
| `#强制下载屏蔽图库` | 删除后重新克隆屏蔽图库 |

### 图库状态

| 指令 | 说明 |
|------|------|
| `#图库状态` | 全部图库源（默认图库/主仓库/第三方）+ 屏蔽图库总览 + 未登记图库目录提示 |
| `#主图库状态` | 各主仓库规模与路径（角色数/图片数/大小/路径/SHA） |
| `#屏蔽图库状态` | 屏蔽图库详细信息 |

### 图库更新（仅主人）

| 指令 | 说明 |
|------|------|
| `#主图库更新` | 拉取所有主图库仓库最新版本 |
| `#屏蔽图库更新` | 拉取屏蔽图库最新版本 |
| `#主图库强制更新` | 强制同步所有主图库仓库 |
| `#屏蔽图库强制更新` | 强制同步屏蔽图库 |

> 主图库更新/下载后会重新注册图库源；源列表有变化时需重启 Yunzai 生效。

#### 统一自动更新（默认开启，cron `0 30 5 * * *` / 每天 5:30）

所有图库共用**一个** cron，按固定顺序执行：**主图库 → 屏蔽图库 → 第三方图库 → 图库源同步**。某个图库更新失败不会中断后续，完成后统一通知主人。

逐类开关（锅巴后台「图库更新」分组或 `config/config.yaml` 的 `gallery` 段）：

| 配置项 | 作用 | 默认 |
|--------|------|------|
| `gallery.autoUpdate.enabled` | 自动更新总开关 | 开 |
| `gallery.autoUpdate.cron` | 统一执行时间 | `0 30 5 * * *` |
| `gallery.repos[].autoUpdate` | 该主仓库是否参与自动更新 | 开 |
| `gallery.blocked.enabled` | 屏蔽图库是否参与自动更新 | 开 |
| `gallery.thirdPartyUpdate.enabled` | 第三方图库是否参与自动更新 | 开 |

### 第三方图库（仅主人）

| 指令 | 说明 |
|------|------|
| `#下载第三方图库 <URL> [目标目录]` | 克隆第三方图库（缺省落在 `gallery/ProfileImg/<仓库名>`），自动探测目录结构并注册为图库源 |
| `#删除第三方图库 <图库名>` | 移除配置并删除该图库的 Git 仓库目录，然后重新注册图库源；只删 Git 仓库目录，磁盘根 / 图库根 / 默认图库 / 主图库受保护 |
| `#更新第三方图库 [图库名]` | 拉取第三方图库最新版本（只读源，只 git pull，不复制图片；缺省=全部，指定则仅更新单个） |

> 第三方仓库目录结构由插件自动探测（支持 `normal-character/{角色}/`、`super-character/{角色}/` 与平铺 `{角色}/`）；无法直读的仓库不会注册为图库源，会提示整理目录结构。

#### 第三方图库路径（`thirdParty[].dir`）

`dir` 是**图库所在目录的绝对路径**，也是该图库在配置里的唯一凭证；`remoteUrl` 可留空（本地只读源，不参与更新）。

| 场景 | 用户操作 | 配置里写入 |
|------|---------|-----------|
| 本地已有图库（含跨盘、非 git 的图片目录） | 锅巴/配置文件新增条目，`dir` 填绝对路径，`remoteUrl` 留空 | 绝对路径 |
| 本地没有图库 | `#下载第三方图库 <URL> [目标目录]` | 绝对路径 + 远程地址 |
| 跨盘 / 网络盘 | 同上，目标目录填其他盘 / 网络盘路径 | 绝对路径 |

- **`gallery_config.yaml` 是唯一凭证**：只有列表中的条目会被读取，插件不做「以目录扫描为准」的发现；跨盘图库扫描不到，只能靠配置登记（这正是必须登记的原因）
- **自动补登记**：插件启动时扫描 `gallery/ProfileImg` 下已有、但尚未登记的图库目录（含 `.git` 的仓库，或结构可直读的分层/平铺目录），**先写进 `gallery_config.yaml`**（绝对路径，Git 仓库会回填其 origin 地址），再从配置注册 miao，最后私聊提示重启 —— 扫描结果永远不直接成为图库源
- 路径建议用正斜杠 `/`；网络盘（UNC）需先执行一次 `git config --global --add safe.directory <该路径>`，否则 git 会以 `dubious ownership` 拒绝下载 / 更新
- 旧配置里的相对子目录名仍兼容读取（相对 `gallery/ProfileImg`），新写入一律为绝对路径
- `#下载第三方图库 <URL> [目标目录]` 按 `remoteUrl` 匹配已有配置：命中则沿用该配置的目录，未命中则新增条目；目标目录已存在且**不是 Git 仓库**时会拒绝下载（避免覆盖本地图库），此时请直接在配置中登记
- `normalPath` / `superPath` 为旧字段，仍可读取但不再参与注册（结构由插件自动探测）
- 路径或条目变动后需重启 Yunzai 才会被 miao 读取

### 面板图上传（版权可选，主人/授权成员）

| 指令 | 说明 |
|------|------|
| `#添加<角色名>面板图 <作者> <来源> [备注]` | 上传面板图，标注版权 |
| `#添加琴面板图` | 无版权上传（不标注作者/来源） |
| `#添加琴面板图 张三 米游社` | 示例：作者张三，来源米游社 |

> 上传/删除/屏蔽/启用为管理指令，默认仅主人可用；可在 `config/manager_config.yaml` 授权群成员，成员只能操作被允许图库内的图。

> 命名格式：`<角色名>_<序号>_<原作者>_<来源>[_<备注>].webp`
> 角色名与序号间用下划线 `_` 分隔，避免含数字角色名（如"银狼LV.999"）混淆。
> 上传统一写入默认图库（`miao-plugin/resources/profile`，default 段位 10001+），不再复制到其他图库源；成员上传恒写默认图库，主人可将 `gallery.defaultDir` 配置为主仓库目录直写主图库。

### 面板图管理

| 指令 | 权限 | 说明 |
|------|------|------|
| `#<角色名>面板图列表` | 所有人 | 多源汇总（默认图库 / 主仓库 / 第三方只读源，含版权信息，最多显示 20 张） |
| `#<角色名>面板图可视化` | 所有人 | HTML 网格浏览全部面板图（分页，每页 20 张） |
| `#删除<角色名>面板图<序号>` | 主人/授权成员 | 按段位就地删除（主图库 / 默认图库真删；第三方源不参与序号） |
| `#重命名<角色名>面板图<序号> <作者> <来源> [备注]` | 主人 | 修改版权（主图库 / 默认图库就地重命名；第三方源不参与序号） |
| `#屏蔽<角色名>面板图 <序号>` | 主人/授权成员 | 主图库移入屏蔽图库 / 默认图库改 `.bak` 隐藏 |
| `#启用<角色名>面板图 <序号>` | 主人/授权成员 | 从屏蔽图库移回主图库 / 默认图库 `.bak` 恢复 |
| `#<角色名>面板图屏蔽列表` | 所有人 | 查看被屏蔽的面板图 |

### 成员管理权限（`config/manager_config.yaml`）

上传/删除/屏蔽/启用四类管理指令默认仅主人可用。可通过锅巴后台或手动编辑 `config/manager_config.yaml` 授权群成员：

```yaml
managers:
  - qq: 123456789                  # 群成员 QQ 号
    repos: "main,default,米游社"     # 允许操作的图库（逗号分隔，可多个）
```

- 图库类型：`main`（主图库，一体）/ `default`（default 图库）/ 第三方图库名（如 `米游社`）
- 成员只能操作**被允许图库**里的图；`repos` 留空 = 仅允许 `default` 图库
- 上传统一写入默认图库，成员需允许 `default` 才能添加
- 未授权成员执行管理指令会被拒绝；主人不受图库边界限制

### 其他

| 指令 | 说明 |
|------|------|
| `#图库帮助` | 查看帮助图片 |

## 架构

### 多图库源布局

```
miao-plugin/resources/profile/                  ← 默认图库（真实目录，唯一可写，源列表中的 'profile'）
gallery/ProfileImg/miao-plugin-ProfileImg[-N]/  ← 主仓库（独立只读源，可 push）
gallery/ProfileImg/<第三方仓库>/                 ← 第三方图库（独立只读源，可配置到其他盘 / 网络盘）
gallery/profile/blocked-character/              ← 屏蔽图库（自带 .git）

miao-plugin/config/profile.js
  export const profileImgSrc = ['profile', '<主仓库绝对路径>', '<第三方仓库绝对路径>', ...]
```

- **图库源列表**：miao-plugin 2.5.20+ 按 `config/profile.js` 的 `profileImgSrc`（有序数组）依次读取各源——默认图库用相对值 `'profile'`，主仓库/第三方仓库用绝对路径
- **默认图库可写**：上传 / 迁移的面板图落在这里（`miao-plugin/resources/profile`），文件名取 default 段位（10001~99999）
- **各主仓库 / 第三方仓库为独立源**：更新只做 `git pull`，图片留在各自仓库内，不做任何聚合
- **屏蔽**：主图库文件移入 `gallery/profile/blocked-character`；默认图库 / 第三方源文件改 `.bak` 后缀（miao 只认 webp/png/jpg/jpeg，天然不可见）
- **源列表变更需重启**：miao 只在模块加载时读一次 `profileImgSrc`；插件**每次启动**都会先补登记 `gallery/ProfileImg` 下已有但未登记的图库目录（写进 `gallery_config.yaml`），再按配置注册 miao——已注册过源的（`ready`）与首次发现本地可用图库的（`fresh`）都会同步，有变更就私聊主人要求重启（24h 节流，发送失败下次启动重试）；本地无可用图库时才提示 `#图库初始化`

### 序号段位（n 编码来源）

| 图库 | 序号段 | 说明 |
|------|--------|------|
| 主图库 | 1 ~ 9999 | 主仓库原始文件 |
| 默认图库 | 10001 ~ 99999 | 默认图库（`resources/profile`）内的文件 |
| 第三方图库 | — | 使用各仓库原生命名，不参与段位与 `#面板图N` 寻址（仅列表/可视化展示） |

- 序号 n 天然编码来源，无需解析文件名；列表/删除/屏蔽/启用共用同一套序号

### 图库分类

| 图库 | 目录 | git | 可写 | 屏蔽方式 |
|------|------|-----|------|---------|
| 默认图库 | `miao-plugin/resources/profile` | ✗ | ✓ 本地 | .bak |
| 主图库 | `gallery/ProfileImg/miao-plugin-ProfileImg[-N]` | ✓ | ✓ push | 移入 blocked-character |
| 第三方图库 | `gallery/ProfileImg/<仓库名>`（或自定义 / 跨盘路径） | ✓ 只读 | ✗ | .bak |

- **仅主图库 push**。默认图库是 miao 的唯一可写位置；第三方仓库只读 `git pull`，不复制到其他源。

### 目录结构

```
ProfileImg-Plugin/
├── config/
│   ├── config.yaml                    ← 主配置（统一自动更新/仓库元数据/屏蔽/第三方/上传压缩，运行时）
│   ├── gallery_config.yaml            ← 图库配置（默认图库 + 第三方列表，运行时）
│   └── manager_config.yaml            ← 成员管理权限（运行时）
├── defSet/
│   ├── config.yaml                    ← 主配置模板（锅巴保存时替换 ${变量}）
│   ├── gallery_config.yaml            ← 图库配置模板（锅巴保存时替换 ${变量}）
│   └── manager_config.yaml            ← 成员权限模板（锅巴保存时替换 ${变量}）
└── resources/
    └── gallery/
        ├── map.json                    ← 角色→主仓库映射 {"琴":0, "胡桃":1}
        ├── profile/                    ← 旧聚合目录（迁移后仅屏蔽图库在用）
        │   ├── normal-character/       ← 迁移后为空目录
        │   ├── super-character/        ← 迁移后为空目录
        │   └── blocked-character/      ← 屏蔽图库（自带 .git）
        ├── backup/                     ← #迁移图库 的配置备份产物
        └── ProfileImg/
            ├── miao-plugin-ProfileImg/     ← 仓库 0（默认主仓库，独立图库源，自带 .git）
            │   ├── normal-character/
            │   └── super-character/
            └── miao-plugin-ProfileImg-1/   ← 仓库 1（扩展主仓库，独立图库源）
```

miao-plugin 侧：`plugins/miao-plugin/resources/profile/` 为**默认图库**（真实目录，唯一可写，源列表首项 `'profile'`）。

`data/`（锁文件、仓库版本记录）位于插件根目录，不纳入版本控制。

### map.json

```json
{
  "version": 1,
  "mapping": {
    "琴": 0,
    "甘雨": 0,
    "胡桃": 1
  }
}
```

- **角色→主仓库编号的唯一路由**（决定角色归属哪个主仓库，即图库源归属）
- 同一角色的 normal-character 和 super-character 必须在同一主仓库
- 新角色由 `autoAssignRepo` 自动分配角色数最少的仓库

### gallery_config.yaml

第三方图库配置（`config/gallery_config.yaml`，参考 `gallery_config.yaml.example`）。
默认图库固定为 `miao-plugin/resources/profile`；`config.yaml` 的 `gallery.defaultDir` 仅用于指定主人手动上传面板图的存放目录。

第三方仓库的目录结构由插件自动探测（支持 `normal-character/{角色}/`、`super-character/{角色}/` 与平铺 `{角色}/`），可直读的仓库才会注册为图库源；`normalPath` / `superPath` 为旧字段，仅作兼容保留，注册图库源时不使用。

`dir` 取值与跨盘 / 网络盘注意事项见上文「第三方图库路径」。

```yaml
# 第三方图库（独立只读图库源，更新只做 git pull）
thirdParty:
  - name: "某同人图库"
    dir: "xxx-fan-repo"             # gallery/ProfileImg/ 下的子目录名
    remoteUrl: "https://github.com/xxx/xxx.git"
    enabled: true
  - name: "本地同人图库"
    dir: "E:/gallery/fan-repo"      # 也可填绝对路径（其他盘 / 网络盘，建议正斜杠）
    remoteUrl: "https://github.com/xxx/fan.git"
    enabled: true
```

## 图库仓库

| 仓库 | 地址 |
|------|------|
| 主图库（默认） | [miao-plugin-ProfileImg](https://github.com/AxiuCN/miao-plugin-ProfileImg) |
| 屏蔽图库 | [miao-plugin-ProfileImg-Blocked](https://github.com/AxiuCN/miao-plugin-ProfileImg-Blocked) |

## 免责声明

- **请勿将此模板图库用于任何以盈利为目的的场景。**
- **图片与其他素材均来自于网络，图片资源严禁用于任何商业用途。如有侵权请联系删除。**

## 交流与讨论

如有问题，请加入 QQ 群 **965272093** 交流反馈。

## 鸣谢

- [Miao-Plugin-MBT](https://github.com/GuGuNiu/Miao-Plugin-MBT) — 面板图可视化页的布局与分页思路参考自此项目