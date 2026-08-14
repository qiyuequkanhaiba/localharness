const { existsSync } = require('node:fs')
const { join } = require('node:path')
const { engineFolder } = require('./engine-os.cjs')

/** @param {import('electron-builder').BeforePackContext} context */
module.exports = async function beforePack(context) {
  const folder = engineFolder(context.electronPlatformName, context.arch)
  const src = join(__dirname, '..', 'engine', folder)
  const dsh = join(src, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  if (!existsSync(dsh)) {
    throw new Error(`prepare the official engine first: missing ${dsh} (npm run prepare-engine)`)
  }
}
