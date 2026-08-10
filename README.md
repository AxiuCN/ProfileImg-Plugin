# ProfileImg-Plugin / 面板图图库管理器

miao-plugin 角色面板图图库管理器。管理主图库（多仓库）、default 图库、第三方图库与屏蔽图库，支持面板图上传（含版权归属）、屏蔽/启用、状态查看、自动更新。

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

## 首次使用

安装插件后，发送 **`#图库初始化`**，然后按提示执行：

1. **`#图库初始化`** — 将 `miao-plugin/resources/profile` 与图库聚合目录接通（Windows junction），为已下载主仓库的角色创建角色级 junction
2. **`#下载主图库`** — 克隆主图库 git 仓库，并确保角色级 junction
3. **`#下载屏蔽图库`** — 克隆屏蔽图库

> 若之前已有面板图数据，先发送 `#备份图库`，初始化完成后再发送 `#迁移图库` 将旧数据迁入 default 图库并复制到主图库。
>
> 第三方图库用 `#下载第三方图库 <URL>` 自动克隆注册，下载后在锅巴后台配置其角色目录结构（normalPath/superPath），再用 `#更新第三方图库 <图库名>` 同步图片。

## 指令列表

### 初始化与迁移（仅主人）

| 指令 | 说明 |
|------|------|
| `#图库初始化` | 初始化 junction + 角色级 junction（两步交互式确认） |
| `#备份图库` | 备份旧 miao-plugin/resources/profile 数据 |
| `#迁移图库` | 将备份数据迁入 default 图库并复制到主图库 |
| `#下载主图库` | 克隆主图库仓库并确保角色级 junction |
| `#强制下载主图库` | 删除现有仓库后重新 clone |
| `#下载屏蔽图库` | 克隆屏蔽图库 |
| `#强制下载屏蔽图库` | 删除后重新克隆屏蔽图库 |

### 图库状态

| 指令 | 说明 |
|------|------|
| `#图库状态` | 主图库 + 屏蔽图库总览 |
| `#主图库状态` | 主图库各仓库详细信息（角色数/图片数/大小/SHA） |
| `#屏蔽图库状态` | 屏蔽图库详细信息 |

### 图库更新（仅主人）

| 指令 | 说明 |
|------|------|
| `#主图库更新` | 拉取所有主图库仓库最新版本 |
| `#屏蔽图库更新` | 拉取屏蔽图库最新版本 |
| `#主图库强制更新` | 强制同步所有主图库仓库 |
| `#屏蔽图库强制更新` | 强制同步屏蔽图库 |

> 主图库更新/下载后自动确保角色级 junction。

#### 统一自动更新（默认开启，cron `0 30 5 * * *` / 每天 5:30）

所有图库共用**一个** cron，按固定顺序执行：**主图库 → 屏蔽图库 → 第三方图库 → 刷新副本**。某个图库更新失败不会中断后续，完成后统一通知主人。

逐类开关（锅巴后台「图库更新」分组或 `config/config.yaml` 的 `gallery` 段）：

| 配置项 | 作用 | 默认 |
|--------|------|------|
| `gallery.autoUpdate.enabled` | 自动更新总开关 | 开 |
| `gallery.autoUpdate.cron` | 统一执行时间 | `0 30 5 * * *` |
| `gallery.repos[].autoUpdate` | 该主仓库是否参与自动更新 | 开 |
| `gallery.blocked.enabled` | 屏蔽图库是否参与自动更新 | 开 |
| `gallery.thirdPartyUpdate.enabled` | 第三方图库是否参与自动更新 | 开 |
| `gallery.refreshCopies.enabled` | 更新后是否自动刷新副本 | 开 |

### 第三方图库（仅主人）

| 指令 | 说明 |
|------|------|
| `#下载第三方图库 <URL>` | 克隆第三方图库到 `gallery/ProfileImg/` 并注册到配置 |
| `#删除第三方图库 <图库名>` | 删除第三方图库（清理主图库副本 + 删除仓库目录 + 移除配置），不允许删 default/主图库 |
| `#刷新图库副本 [default/图库名]` | 检查并修复角色级 junction + default/第三方副本遗漏；无后缀=除主图库外全部，`default` 后缀=仅 default，图库名后缀=仅该第三方 |
| `#更新第三方图库 [图库名]` | 拉取第三方图库并复制新图到主图库（缺省=全部；指定则仅更新单个） |

> 各第三方仓库目录结构不同，下载后需在锅巴后台「第三方图库」中配置该图库的 normalPath / superPath，配置后 `#更新第三方图库 <图库名>` 才能同步图片；`#刷新图库副本` 可用于校验修复。

### 面板图上传（版权可选，主人/授权成员）

| 指令 | 说明 |
|------|------|
| `#添加<角色名>面板图 <作者> <来源> [备注]` | 上传面板图，标注版权 |
| `#添加琴面板图` | 无版权上传（不标注作者/来源） |
| `#添加琴面板图 张三 米游社` | 示例：作者张三，来源米游社 |

> 上传/删除/屏蔽/启用为管理指令，默认仅主人可用；可在 `config/manager_config.yaml` 授权群成员，成员只能操作被允许图库内的图。

> 命名格式：`<角色名>_<序号>_<原作者>_<来源>[_<备注>].webp`
> 角色名与序号间用下划线 `_` 分隔，避免含数字角色名（如"银狼LV.999"）混淆。
> 上传默认写入 default 图库，并复制到主图库（带"本地默认图库"前缀）；未配置 `gallery.defaultDir` 时使用固定目录 `gallery/ProfileImg/default`。

### 面板图管理

| 指令 | 权限 | 说明 |
|------|------|------|
| `#<角色名>面板图列表` | 所有人 | 查看面板图（主图库角色目录，含版权信息，最多显示 20 张） |
| `#<角色名>面板图可视化` | 所有人 | HTML 网格浏览全部面板图（分页，每页 20 张） |
| `#删除<角色名>面板图<序号>` | 主人/授权成员 | 按序号段删除（主图库真删 / default 同步删 / 第三方 .bak） |
| `#重命名<角色名>面板图<序号> <作者> <来源> [备注]` | 主人 | 修改版权（主图库直接改 / default 同步改 / 第三方拒绝） |
| `#屏蔽<角色名>面板图 <序号>` | 主人/授权成员 | 移入屏蔽图库 / .bak 隐藏 |
| `#启用<角色名>面板图 <序号>` | 主人/授权成员 | 移回主图库 / .bak 恢复 |
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
- 上传统一写入 default 图库并复制主图库，成员需允许 `default` 才能添加
- 未授权成员执行管理指令会被拒绝；主人不受图库边界限制

### 其他

| 指令 | 说明 |
|------|------|
| `#图库帮助` | 查看帮助图片 |

## 架构

### 聚合层（角色级 junction + 复制聚合）

```
miao-plugin/resources/profile/                     ← junction（第一层）
  → ProfileImg-Plugin/resources/gallery/profile/   ← 聚合目录（真实目录）

gallery/profile/normal-character/琴/               ← 角色级 junction
  → miao-plugin-ProfileImg[-N]/normal-character/琴/ ← 主仓库角色目录（真实目录）

miao-plugin-ProfileImg[-N]/normal-character/琴/
├── 琴_1_张三_米游社.webp                      ← 主图库原始文件（段位 1~9999）
├── 琴_100001_第三方图库_某同人库_art01.png      ← 第三方复制（段位 100001+）
├── 琴_10001_本地默认图库_默认_fav01.webp        ← default 复制（段位 10001~99999）
└── 琴_10001_本地默认图库_默认_old.webp.bak     ← .bak 屏蔽（miao-plugin 不可见）
```

- **角色级 junction**：`gallery/profile/{normal,super}-character/角色/` 为目录 junction，指向对应主仓库的角色目录
- **复制聚合**：default / 第三方图库的图片通过**物理复制**进入主仓库角色目录，文件名前缀编码来源
- miao-plugin 读取面板图 → junction 解析到聚合目录 → 角色 junction → 主仓库真实文件；readdir 过滤 `\.(png|webp)$` → `.bak` 文件不可见。对 miao-plugin 完全透明

### 序号段位（n 编码来源）

| 图库 | 序号段 | 说明 |
|------|--------|------|
| 主图库 | 1 ~ 9999 | 主仓库原始文件 |
| default 图库 | 10001 ~ 99999 | default 复制文件 |
| 第三方图库 N | N×100000 + 1 起 | 第 N 个第三方仓库复制文件 |

- 序号 n 天然编码来源，无需解析文件名；列表/删除/屏蔽/启用共用同一套序号

### 图库分类

| 图库 | 目录 | git | 可写 | 屏蔽方式 |
|------|------|-----|------|---------|
| 主图库 | `miao-plugin-ProfileImg[-N]` | ✓ | ✓ push | 移入 blocked-character |
| default 图库 | `config.yaml` gallery.defaultDir | ✗ | ✓ 本地 | .bak |
| 第三方图库 N | 各自独立目录 | ✓ 只读 | ✗ | .bak |

- **仅主图库 push**。default 本地目录，第三方只读 pull（更新后复制到主仓库）。

### 目录结构

```
ProfileImg-Plugin/
├── config/
│   ├── config.yaml                    ← 主配置（统一自动更新/仓库元数据/屏蔽/第三方/刷新副本/上传压缩，运行时）
│   ├── gallery_config.yaml            ← 图库配置（default 路径 + 第三方列表，运行时）
│   └── manager_config.yaml            ← 成员管理权限（运行时）
├── defSet/
│   ├── config.yaml                    ← 主配置模板（锅巴保存时替换 ${变量}）
│   ├── gallery_config.yaml            ← 图库配置模板（锅巴保存时替换 ${变量}）
│   └── manager_config.yaml            ← 成员权限模板（锅巴保存时替换 ${变量}）
└── resources/
    └── gallery/
        ├── map.json                    ← 主仓库角色→仓库映射 {"琴":0, "胡桃":1}
        ├── profile/                    ← 聚合目录（miao-plugin junction 目标）
        │   ├── normal-character/       ← 真实目录，角色子目录为 junction
        │   ├── super-character/        ← 彩蛋面板图角色 junction
        │   └── blocked-character/      ← 屏蔽图库（自带 .git）
        ├── backup/                     ← #备份图库 产物
        └── ProfileImg/
            ├── miao-plugin-ProfileImg/     ← 仓库 0（默认，自带 .git）
            │   ├── normal-character/
            │   └── super-character/
            └── miao-plugin-ProfileImg-1/   ← 仓库 1（扩展）
```

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

- **角色→主仓库编号的唯一路由**（决定角色级 junction 指向哪个主仓库）
- 同一角色的 normal-character 和 super-character 必须在同一主仓库
- 新角色由 `autoAssignRepo` 自动分配角色数最少的仓库

### gallery_config.yaml

第三方图库配置（`config/gallery_config.yaml`，参考 `gallery_config.yaml.example`）。
default 图库路径在 `config.yaml` 的 `gallery.defaultDir` 中配置。

normalPath / superPath 指定角色目录相对**仓库根**的路径：

| 值 | 含义 |
|----|------|
| `"normal-character"` | 仓库根/normal-character/角色名/（有类型层） |
| `"."` | 角色目录直接挂在仓库根（仓库根/角色名/） |
| 空 | 该类型不存在 |

```yaml
# 第三方图库（只读，更新后复制到主图库）
thirdParty:
  - name: "某同人图库"
    dir: "xxx-fan-repo"             # gallery/ProfileImg/ 下的子目录名
    remoteUrl: "https://github.com/xxx/xxx.git"
    normalPath: "normal-character"  # normal 角色目录相对仓库根的路径（"."=角色目录在根，空=无）
    superPath: ""                   # super 角色目录相对仓库根的路径（空=无）
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