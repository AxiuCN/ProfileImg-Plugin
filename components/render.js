import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import path from 'node:path'
import fs from 'node:fs'
import { currentVersion, yunzaiVersion } from './pluginVersion.js'

const pluginRoot = path.join(process.cwd(), 'plugins/ProfileImg-Plugin')

export async function render(app, tpl, data = {}, imgType = 'png') {
  const dataDir = path.join(process.cwd(), 'data', 'html', 'ProfileImg-Plugin', app, tpl)
  fs.mkdirSync(dataDir, { recursive: true })

  data._plugin = 'ProfileImg-Plugin'
  data._res_path = `../../../../../plugins/ProfileImg-Plugin/resources/`
  data.pluResPath = data._res_path   // 框架内部依赖 pluResPath
  data.tplFile = path.join(pluginRoot, 'resources', app, `${tpl}.html`)
  data.saveId = data.saveId || data.save_id || tpl
  data.imgType = imgType
  if (imgType === 'png') data.omitBackground = true
  data.pageGotoParams = { waitUntil: 'networkidle0' }
  data.sys = {
    copyright: `Created By Yunzai-Bot<span class="version">${yunzaiVersion}</span> & ProfileImg-Plugin<span class="version">${currentVersion}</span>`
  }

  return await puppeteer.screenshot(`ProfileImg-Plugin/${app}/${tpl}`, data)
}