# ProfileImg-Plugin

miao-plugin 角色面板图图库管理器。管理主图库（多仓库）、迁移图库、default 图库、第三方图库与屏蔽图库，支持面板图上传（含版权归属）、屏蔽/启用、状态查看、自动更新。

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

1. **`#图库初始化`** — 将 `miao-plugin/resources/profile` 替换为 Windows junction（目录符号链接），创建聚合目录
2. **`#下载主图库`** — 克隆主图库 git 仓库，并建立逐图聚合链接
3. **`#下载屏蔽图库`** — 克隆屏蔽图库

> 若之前已有面板图数据，先发送 `#备份图库`，初始化完成后再发送 `#迁移图库` 将旧数据迁移到 Profile-old。

## 指令列表

### 初始化与迁移（仅主人）

| 指令 | 说明 |
|------|------|
| `#图库初始化` | 创建 junction + 聚合目录（两步交互式确认） |
| `#备份图库` | 备份旧 miao-plugin/resources/profile 数据 |
| `#迁移图库` | 将备份数据迁移到 Profile-old（普通目录，无 git） |
| `#下载主图库` | 克隆主图库仓库并建立聚合链接 |
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

> 更新/下载完成后自动重建聚合链接，仅处理当前更新的仓库（增量）。

### 面板图上传（版权可选）

| 指令 | 说明 |
|------|------|
| `#添加<角色名>面板图 <作者> <来源> [二改]` | 上传面板图，标注版权 |
| `#添加琴面板图` | 无版权上传（不标注作者/来源） |
| `#添加琴面板图 张三 米游社` | 示例：作者张三，来源米游社 |

> 命名格式：`<角色名>_<序号>_<原作者>_<来源>[_<二改>].webp`
> 角色名与序号间用下划线 `_` 分隔，避免含数字角色名（如"银狼LV.999"）混淆。
> 上传默认写入 default 图库（锅巴配置），n 从 20001 起。

### 面板图管理

| 指令 | 权限 | 说明 |
|------|------|------|
| `#<角色名>面板图列表` | 所有人 | 查看面板图（聚合所有图库，含版权信息） |
| `#删除<角色名>面板图<序号>` | 所有人 | 删除指定序号面板图（主图库删源文件，其他 .bak 隐藏） |
| `#重命名<角色名><序号> <作者> <来源> [二改]` | 主人 | 修改版权归属信息（仅主图库） |
| `#屏蔽<角色名>面板图 <序号>` | 主人 | 移入屏蔽图库 / .bak 隐藏 |
| `#启用<角色名>面板图 <序号>` | 主人 | 移回主图库 / .bak 恢复 |
| `#<角色名>面板图屏蔽列表` | 所有人 | 查看被屏蔽的面板图 |

### 其他

| 指令 | 说明 |
|------|------|
| `#图库帮助` | 查看帮助图片 |

## 架构

### 聚合层（逐图硬链接）

```
miao-plugin/resources/profile/                     ← junction（第一层）
  → ProfileImg-Plugin/resources/gallery/profile/   ← 聚合目录（真实目录）

gallery/profile/normal-character/琴/               ← 真实目录，逐图 hard link
├── 琴_1_张三_米游社.webp   ← hardlink → 主仓库 normal-character/琴/
├── 琴_10001.webp          ← hardlink → Profile-old/normal-character/琴/
├── 琴_20001.webp          ← hardlink → default/normal-character/琴/
├── xyz.webp               ← hardlink → 第三方仓库/normal-character/琴/
└── 琴_1.webp.bak          ← .bak 后缀（屏蔽，miao-plugin 不可见）
```

同一角色可横跨多个图库（主图库 / 迁移 / default / 第三方），聚合目录用 hard link 汇集所有来源。

miao-plugin 读取面板图 → junction 解析到聚合目录 → readdir 过滤 `\.(png|webp)$` → `.bak` 文件不可见。对 miao-plugin 完全透明。

### 图库分类

| 图库 | 目录 | git | 可写 | 屏蔽方式 | 序号段 |
|------|------|-----|------|---------|--------|
| 主图库 | `miao-plugin-ProfileImg[-N]` | ✓ | ✓ push | 移入 blocked-character | 1~9999 |
| 迁移图库 | `Profile-old` | ✗ | ✗ | .bak | 10001~19999 |
| default 图库 | 锅巴配置 | ✗ | ✓ 本地 | .bak | 20001~49999 |
| 第三方图库 N | 各自独立目录 | ✓ 只读 | ✗ | .bak | N×100000+1 起 |

- **仅主图库 push**。迁移图库为普通目录（原 miao-plugin 图库迁入），第三方只读 pull，default 本地目录。
- 第三方图库 display n 从 500001 起按仓库序号分段。

### 目录结构

```
ProfileImg-Plugin/
└── resources/
    └── gallery/
        ├── map.json                    ← 主图库角色→仓库映射 {"琴":0, "胡桃":1}
        ├── repos.json                  ← 仓库注册表（运行时）
        ├── profile/                    ← 聚合目录（miao-plugin junction 目标）
        │   ├── normal-character/       ← 真实目录，逐图 hard link
        │   ├── super-character/        ← 彩蛋面板图 hard link
        │   └── blocked-character/      ← 屏蔽图库（自带 .git）
        ├── backup/                     ← #备份图库 产物
        └── ProfileImg/
            ├── miao-plugin-ProfileImg/     ← 仓库 0（默认，自带 .git）
            │   ├── normal-character/
            │   └── super-character/
            ├── miao-plugin-ProfileImg-1/   ← 仓库 1（扩展）
            └── Profile-old/                ← 迁移图库（普通目录）
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

- 仅用于主图库内部角色→仓库路由（main 仓库之间）
- 同一角色的 normal-character 和 super-character 必须在同一主仓库
- 聚合层遍历 `repos.json` 注册表，不再依赖 map.json 做全局路由

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
