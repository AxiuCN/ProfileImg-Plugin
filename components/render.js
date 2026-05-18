import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import path from 'node:path'
import fs from 'node:fs'
import { currentVersion, yunzaiVersion } from './pluginVersion.js'

const pluginRoot = path.join(process.cwd(), 'plugins/ProfileImg-Plugin')

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

  // 注入系统版权信息
  data.sys = {
    copyright: `Created By Yunzai-Bot<span class="version">${yunzaiVersion}</span> & ProfileImg-Plugin<span class="version">${currentVersion}</span>`
  }

  return await puppeteer.screenshot(`ProfileImg-Plugin/${app}/${tpl}`, data)
}