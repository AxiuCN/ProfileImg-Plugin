# ProfileImg-Plugin

miao-plugin 角色面板图图库管理器。管理主图库（多仓库）、屏蔽图库，支持面板图上传（含版权归属）、屏蔽/启用、状态查看、自动更新。

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

安装插件后，发送 **`#图库初始化`** 完成以下步骤：

1. 将 `miao-plugin/resources/profile` 替换为 Windows junction（目录符号链接）
2. 下载主图库 git 仓库到 `ProfileImg-Plugin/resources/gallery/ProfileImg/`
3. 下载屏蔽图库
4. 创建角色级别 junction，使 miao-plugin 透明访问面板图

> 若之前已有面板图数据，先发送 `#备份图库`，初始化完成后再发送 `#迁移图库` 将旧数据融入新结构。

## 指令列表

### 初始化与迁移（仅主人）

| 指令 | 说明 |
|------|------|
| `#图库初始化` | 创建 junction + 下载所有仓库（三步交互） |
| `#备份图库` | 备份旧 miao-plugin/resources/profile 数据 |
| `#迁移图库` | 将备份数据按 map.json 分散到各仓库 |
| `#强制下载主图库` | 删除现有仓库后重新 clone |

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

### 面板图上传（含版权归属）

| 指令 | 说明 |
|------|------|
| `#添加<角色名>面板图 <作者> <来源> [二改]` | 上传面板图，标注版权 |
| `#添加琴面板图 张三 米游社` | 示例：作者张三，来源米游社 |
| `#添加甘雨面板图 李四 lofter AI扩图` | 示例：含二改情况 |

> 命名格式：`<角色名><序号>_<原作者>_<来源>[_<二改>].webp`
> 各字段禁止空格，用下划线 `_` 分隔。

### 面板图管理

| 指令 | 权限 | 说明 |
|------|------|------|
| `#<角色名>面板图列表` | 所有人 | 查看面板图（含版权信息） |
| `#删除<角色名>面板图<序号>` | 所有人 | 删除指定序号面板图 |
| `#重命名<角色名>面板图 <序号> <作者> <来源> [二改]` | 主人 | 修改版权归属信息 |
| `#屏蔽<角色名>面板图 <序号>` | 主人 | 移入屏蔽图库 |
| `#启用<角色名>面板图 <序号>` | 主人 | 移回主图库 |
| `#<角色名>面板图屏蔽列表` | 所有人 | 查看被屏蔽的面板图 |

### 其他

| 指令 | 说明 |
|------|------|
| `#图库帮助` | 查看帮助图片 |

## 架构

### Junction 链

```
miao-plugin/resources/profile/                     ← junction
  → ProfileImg-Plugin/resources/gallery/profile/   ← 聚合目录

gallery/profile/normal-character/琴/               ← junction
  → gallery/ProfileImg/miao-plugin-ProfileImg/normal-character/琴/
```

miao-plugin 读取面板图 → 文件系统自动解析两层 junction → 实际访问到 git 仓库目录。对 miao-plugin 完全透明。

### 目录结构

```
ProfileImg-Plugin/
└── resources/
    └── gallery/
        ├── map.json                    ← 角色→仓库映射 {"琴":0, "胡桃":1}
        ├── profile/                    ← 聚合目录（miao-plugin junction 目标）
        │   ├── normal-character/       ← 角色级 junction → 各仓库角色目录
        │   ├── super-character/        ← 彩蛋面板图 junction
        │   └── blocked-character/      ← 屏蔽图库（自带 .git）
        ├── backup/                     ← #备份图库 产物
        └── ProfileImg/
            ├── miao-plugin-ProfileImg/     ← 仓库 0（默认，自带 .git）
            │   ├── normal-character/
            │   └── super-character/
            ├── miao-plugin-ProfileImg-1/   ← 仓库 1（扩展）
            └── ...
```

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

- 同一角色的 normal-character 和 super-character 必须在同一仓库
- 新角色默认分配仓库 0，同时更新 map.json
- `#迁移图库` 按 map.json 路由角色到对应仓库

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
