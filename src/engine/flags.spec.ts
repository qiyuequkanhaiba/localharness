import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { engineSupportsNoOpen, officialWebArgs } from './flags'

describe('engineSupportsNoOpen', () => {
  it('is false when the engine docs do not mention --no-open', () => {
    const root = mkdtempSync(join(tmpdir(), 'localharness-noopen-'))
    expect(engineSupportsNoOpen(root)).toBe(false)
    expect(officialWebArgs(root)).toEqual(['web', '--host', '127.0.0.1', '--port', '0'])
  })

  it('is true when the web-app README documents --no-open', () => {
    const root = mkdtempSync(join(tmpdir(), 'localharness-noopen-'))
    const dir = join(root, 'node_modules', '@deepseek-ai', 'dsh-web-app')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'README.md'), 'Unless `--no-open` suppresses it, the default browser opens.\n')
    expect(engineSupportsNoOpen(root)).toBe(true)
    expect(officialWebArgs(root)).toEqual(['web', '--host', '127.0.0.1', '--port', '0', '--no-open'])
  })
})
