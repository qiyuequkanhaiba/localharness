import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const NO_OPEN_MARK = '--no-open'

const HINT_FILES = [
  'node_modules/@deepseek-ai/dsh-web-app/README.md',
  'node_modules/@deepseek-ai/dsh-web-app/README.zh.md',
  'node_modules/@deepseek-ai/dsh/README.md',
  'node_modules/@deepseek-ai/dsh/README.zh.md',
] as const

/** True when this official engine documents `dsh web --no-open`. */
export function engineSupportsNoOpen(engineRoot: string): boolean {
  for (const relative of HINT_FILES) {
    const file = join(engineRoot, relative)
    if (!existsSync(file)) continue
    try {
      if (readFileSync(file, 'utf8').includes(NO_OPEN_MARK)) return true
    } catch {
      // unreadable hint file: try the next one
    }
  }
  return false
}

export function officialWebArgs(engineRoot: string): string[] {
  const args = ['web', '--host', '127.0.0.1', '--port', '0']
  if (engineSupportsNoOpen(engineRoot)) args.push('--no-open')
  return args
}
