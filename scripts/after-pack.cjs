const { execSync } = require('node:child_process')
const { cpSync, existsSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { engineFolder } = require('./engine-os.cjs')

function engineDest(context) {
  if (context.electronPlatformName === 'darwin') {
    const appName = context.packager.appInfo.productFilename
    return join(context.appOutDir, `${appName}.app`, 'Contents', 'Resources', 'engine')
  }
  return join(context.appOutDir, 'resources', 'engine')
}

/** @param {import('electron-builder').AfterPackContext} context */
module.exports = async function afterPack(context) {
  const folder = engineFolder(context.electronPlatformName, context.arch)
  const src = join(__dirname, '..', 'engine', folder)
  const dest = engineDest(context)
  const dsh = join(src, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  if (!existsSync(dsh)) {
    throw new Error(`official engine incomplete at ${src}`)
  }

  rmSync(dest, { recursive: true, force: true })
  cpSync(src, dest, { recursive: true, verbatimSymlinks: true })

  const packedDsh = join(dest, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  if (!existsSync(packedDsh)) {
    throw new Error(`failed to copy official engine into ${dest}`)
  }

  if (context.electronPlatformName === 'darwin') {
    const node = join(dest, 'runtime', 'bin', 'node')
    if (existsSync(node)) execSync(`chmod +x "${node}"`)
    execSync(`find "${dest}" -name spawn-helper -exec chmod +x {} +`)
  }
}
