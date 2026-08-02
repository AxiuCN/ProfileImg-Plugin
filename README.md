# ProfileImg-Plugin

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
> 第三方图库需在 `config/gallery_config.yaml` 中配置后，使用 `#更新第三方图库` 同步。

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
| `#更新第三方图库` | 拉取第三方图库并复制新图到主图库 |
| `#屏蔽图库更新` | 拉取屏蔽图库最新版本 |
| `#主图库强制更新` | 强制同步所有主图库仓库 |
| `#屏蔽图库强制更新` | 强制同步屏蔽图库 |

> 主图库更新/下载后自动确保角色级 junction；第三方图库更新后复制新图到主仓库并清理已删除的孤儿副本。

### 面板图上传（版权可选）

| 指令 | 说明 |
|------|------|
| `#添加<角色名>面板图 <作者> <来源> [二改]` | 上传面板图，标注版权 |
| `#添加琴面板图` | 无版权上传（不标注作者/来源） |
| `#添加琴面板图 张三 米游社` | 示例：作者张三，来源米游社 |

> 命名格式：`<角色名>_<序号>_<原作者>_<来源>[_<二改>].webp`
> 角色名与序号间用下划线 `_` 分隔，避免含数字角色名（如"银狼LV.999"）混淆。
> 上传默认写入 default 图库，并复制到主图库（带"本地默认图库"前缀）；未配置 default 时直接写入主图库。

### 面板图管理

| 指令 | 权限 | 说明 |
|------|------|------|
| `#<角色名>面板图列表` | 所有人 | 查看面板图（主图库角色目录，含版权信息） |
| `#删除<角色名>面板图<序号>` | 所有人 | 按序号段删除（主图库真删 / default 同步删 / 第三方 .bak） |
| `#重命名<角色名><序号> <作者> <来源> [二改]` | 主人 | 修改版权（主图库直接改 / default 同步改 / 第三方拒绝） |
| `#屏蔽<角色名>面板图 <序号>` | 主人 | 移入屏蔽图库 / .bak 隐藏 |
| `#启用<角色名>面板图 <序号>` | 主人 | 移回主图库 / .bak 恢复 |
| `#<角色名>面板图屏蔽列表` | 所有人 | 查看被屏蔽的面板图 |

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
│   ├── config.yaml                    ← 主配置（仓库元数据/屏蔽/上传压缩，运行时）
│   └── gallery_config.yaml            ← 图库配置（default 路径 + 第三方列表，运行时）
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

```yaml
# 第三方图库（只读，更新后复制到主图库）
thirdParty:
  - name: "某同人图库"
    dir: "xxx-fan-repo"             # gallery/ProfileImg/ 下的子目录名
    remoteUrl: "https://github.com/xxx/xxx.git"
    normalPath: "normal-character"  # 仓库中 normal 角色目录相对路径（空=无）
    superPath: ""                   # 仓库中 super 角色目录相对路径（空=无）
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
