import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import path from 'node:path'
import fs from 'node:fs'
import { buildCopyright } from './pluginVersion.js'

const pluginRoot = path.join(process.cwd(), 'plugins/ProfileImg-Plugin')

/**
 * 渲染出图（帮助图 / 状态图 / 可视化共用）
 * 页面视觉基调见 resources/common/ui.css
 * @param {string} app - 模板目录（resources/ 下的子目录）
 * @param {string} tpl - 模板名（不含 .html）
 * @param {object} data - 渲染数据
 * @param {string} imgType - jpeg / png（png 会置 omitBackground，浅色底会变透明）
 */
export async function render(app, tpl, data = {}, imgType = 'jpeg') {
  data._plugin = 'ProfileImg-Plugin'
  data._res_path = `../../../../../plugins/ProfileImg-Plugin/resources/`

  if (imgType === 'png') {
    data.omitBackground = true
  }
  data.imgType = imgType

  // 创建缓存目录
  const dataDir = path.join(process.cwd(), 'data', 'html', 'ProfileImg-Plugin', app, tpl)
  fs.mkdirSync(dataDir, { recursive: true })

  data.saveId = data.saveId || data.save_id || tpl
  data.tplFile = `./plugins/ProfileImg-Plugin/resources/${app}/${tpl}.html`
  data.pluResPath = data._res_path
  data.pageGotoParams = { waitUntil: 'networkidle0' }

  // 注入布局文件路径
  data.elemLayout = path.join(pluginRoot, 'resources', 'common', 'layout', 'elem.html')
  data.defaultLayout = path.join(pluginRoot, 'resources', 'common', 'layout', 'default.html')

  // 注入系统版权信息（框架名按 bot 根 package.json 判定，名称与版本号之间留空格）
  data.sys = { copyright: buildCopyright() }

  return await puppeteer.screenshot(`ProfileImg-Plugin/${app}/${tpl}`, data)
}