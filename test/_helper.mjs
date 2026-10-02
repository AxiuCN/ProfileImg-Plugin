/**
 * 套件公共设施：路径推导 / 前置检查 / 断言计数 / 框架全局桩
 *
 * 套件约定：
 * - **任意 cwd 可跑**：路径一律由本文件位置推导，不写裸相对字面量、不写盘符绝对路径
 * - **缺前置就跳过、不算失败**：依赖 miao-plugin 配置的套件在缺依赖时打印「跳过」并 exit 0
 * - **不改动源数据**：临时产物一律写 `test/.test-tmp/`（gitignore）；
 *   配置读写类套件必须写临时目标文件，绝不改真实的 `miao-plugin/config/profile.js`
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** 套件目录 */
export const testDir = path.dirname(fileURLToPath(import.meta.url))
/** 插件根目录 */
export const pluginRoot = path.resolve(testDir, '..')
/** bot 根目录（app/）：生产代码按 process.cwd() 定位插件与 miao 目录 */
export const appRoot = path.resolve(pluginRoot, '../..')
/** 套件临时产物目录（gitignore） */
export const tmpDir = path.join(testDir, '.test-tmp')
/** miao-plugin 目录（本插件读写其 config/profile.js） */
export const miaoDir = path.join(appRoot, 'plugins/miao-plugin')
/** miao-plugin 配置目录 */
export const miaoConfigDir = path.join(miaoDir, 'config')

// 生产代码按 cwd（bot 根）解析 plugins/ 路径，套件与生产保持一致
process.chdir(appRoot)

/**
 * 生产代码的 file URL（套件 import 用，避免写死盘符）
 * @param {string} relPath - 相对插件根，如 'model/profileSrc.js'
 * @returns {string}
 */
export const mod = (relPath) => pathToFileURL(path.join(pluginRoot, relPath)).href

/** 确保临时目录存在并返回 */
export function ensureTmpDir () {
  fs.mkdirSync(tmpDir, { recursive: true })
  return tmpDir
}

/** 打印「跳过」并正常退出（不算失败） */
export function skip (reason) {
  console.log(`⏭ 跳过：${reason}`)
  process.exit(0)
}

/**
 * miao-plugin 配置模板是否就绪（能力探测与配置生成的前置）
 * @returns {boolean}
 */
export function hasMiaoPlugin () {
  return fs.existsSync(path.join(miaoConfigDir, 'profile_default.js'))
}

/** 前置：miao-plugin */
export function requireMiaoPlugin () {
  if (!hasMiaoPlugin()) skip('miao-plugin 未安装或缺少 config/profile_default.js')
}

/**
 * 建一个断言计数器
 * @returns {{check: Function, counts: Function, finish: Function}}
 */
export function checker () {
  let pass = 0
  let fail = 0
  return {
    check (name, ok, extra = '') {
      ok ? pass++ : fail++
      console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? `  ${extra}` : ''}`)
    },
    counts: () => ({ pass, fail }),
    /** 打印汇总并按失败数退出 */
    finish () {
      console.log(`\n结果：通过 ${pass} / 失败 ${fail}`)
      process.exit(fail === 0 ? 0 : 1)
    }
  }
}

/** 套件期间收集到的日志 */
export const logs = []

/**
 * 安装框架全局桩（logger / redis / cfg / segment）
 * 生产代码依赖 bot 注入的全局，套件里补桩即可不启动 bot 跑真实代码路径
 * @param {object} [opts]
 * @param {boolean} [opts.collect] - 是否把日志收进 logs（默认 true，不打印）
 * @param {boolean} [opts.echoError] - 是否把 logger.error 打到 stderr
 */
export function installFrameworkStubs (opts = {}) {
  const { collect = true, echoError = false } = opts
  const record = (level) => (...args) => {
    if (collect) logs.push(args)
    if (echoError && level === 'error') console.error('[error]', ...args.map(a => (a && a.stack) || String(a)))
  }
  const paint = () => (v) => String(v ?? '')
  globalThis.logger = {
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    mark: record('mark'),
    debug: record('debug'),
    green: paint(), red: paint(), cyan: paint(), yellow: paint(), blue: paint(),
    gray: paint(), magenta: paint(), white: paint(), bold: paint()
  }
  globalThis.plugin = class Plugin {
    constructor (cfg) { Object.assign(this, cfg || {}) }
    setContext () {}
    finish () {}
  }
  globalThis.redis = { get: async () => null, set: async () => {}, del: async () => {} }
  globalThis.cfg = { bot: {}, renderer: {} }
  globalThis.segment = { image: (x) => x, at: (qq) => ({ type: 'at', qq }) }
}
