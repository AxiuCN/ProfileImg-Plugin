import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import path from 'node:path'
import fs from 'node:fs'
import { currentVersion, yunzaiVersion } from './pluginVersion.js'

const plugin = 'ProfileImg-Plugin'
const _path = process.cwd()

data.elemLayout = path.join(pluginRoot, 'resources', 'common', 'layout', 'elem.html')
data.defaultLayout = path.join(pluginRoot, 'resources', 'common', 'layout', 'default.html')

export async function render(app = '', tpl = '', data = {}, imgType = 'jpeg') {
  data._plugin = plugin
  data._res_path = `../../../../../plugins/${plugin}/resources/`
  if (imgType == "png") {
    data.omitBackground = true
  }
  data.imgType = imgType

  // 对齐 Data.createDir 的行为
  const dataDir = path.join(_path, 'data', 'html', plugin, app, tpl)
  fs.mkdirSync(dataDir, { recursive: true })

  data.saveId = data.saveId || data.save_id || tpl
  data.tplFile = `./plugins/${plugin}/resources/${app}/${tpl}.html`
  data.pluResPath = data._res_path
  data.pageGotoParams = {
    waitUntil: 'networkidle0'
  }

  // 注入系统版权信息
  data.sys = {
    copyright: `Created By Yunzai-Bot<span class="version">${yunzaiVersion}</span> & ProfileImg-Plugin<span class="version">${currentVersion}</span>`
  }

  return await puppeteer.screenshot(`${plugin}/${app}/${tpl}`, data)
}