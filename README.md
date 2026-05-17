# ProfileImg-Plugin
一个用于管理喵喵插件角色面板图库（主图库/屏蔽图库）的面板图图库管理器，支持状态查看、更新、安装、屏蔽/启用面板图等功能

## 安装插件
在Yunzai根目录执行命令安装

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

## 面板图图库管理器

| 指令 | 权限 | 说明 |
|------|------|------|
| `#图库状态` | 所有人 | 查看主图库与屏蔽图库总览 |
| `#主图库状态` | 所有人 | 查看主图库详细信息 |
| `#屏蔽图库状态` | 所有人 | 查看屏蔽图库详细信息 |
| `#主图库更新` | 主人 | 拉取主图库最新版本 |
| `#屏蔽图库更新` | 主人 | 拉取屏蔽图库最新版本 |
| `#主图库强制更新` | 主人 | 强制同步主图库至远程版本 |
| `#屏蔽图库强制更新` | 主人 | 强制同步屏蔽图库至远程版本 |
| `#管理器更新` | 主人 | 检查并更新管理器插件自身 |
| `#管理器强制更新` | 主人 | 强制更新管理器插件自身 |
| `#下载主图库` | 主人 | 安装主图库，已安装则提示更新 |
| `#下载屏蔽图库` | 主人 | 安装屏蔽图库，已安装则提示更新 |
| `#<角色名>面板图屏蔽列表` | 所有人 | 查看该角色被屏蔽的面板图 |
| `#屏蔽<角色名>面板图 序号` | 主人 | 将主图库指定图片移入屏蔽图库 |
| `#启用<角色名>面板图 序号` | 主人 | 将屏蔽图库指定图片移回主图库 |

> 主图库地址：[miao-plugin-ProfileImg](https://github.com/AxiuCN/miao-plugin-ProfileImg)  
> 屏蔽图库地址：[miao-plugin-ProfileImg-Blocked](https://github.com/AxiuCN/miao-plugin-ProfileImg-Blocked)

---

## 免责声明
* **请勿将此模板图库用于任何以盈利为目的的场景.** 
* **图片与其他素材均来自于网络，图片资源严禁用于任何商业用途。如有侵权请联系删除**

## 交流与讨论

如有问题，请加入 QQ 群 **965272093** 交流反馈。
