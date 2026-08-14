const { cpSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')

const src = join(__dirname, '..', 'src', 'renderer')
const dest = join(__dirname, '..', 'out', 'renderer')
mkdirSync(dest, { recursive: true })
cpSync(src, dest, { recursive: true })
