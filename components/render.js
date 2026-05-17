import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import path from 'node:path'
import { currentVersion, yunzaiVersion } from './Changelog.js'

const pluginRoot = path.join(process.cwd(), 'plugins/ProfileImg-Plugin')

export async function render(app, tpl, data = {}, imgType = 'png') {
  data._plugin = 'ProfileImg-Plugin'
  data._res_path = `../../../../../plugins/ProfileImg-Plugin/resources/`
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