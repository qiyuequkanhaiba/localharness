import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { slimEngineTree } from './slim'

describe('slimEngineTree', () => {
  it('keeps the host prebuild and drops the others', () => {
    const root = mkdtempSync(join(tmpdir(), 'lh-slim-'))
    const pre = join(root, 'node_modules', 'node-pty', 'prebuilds')
    mkdirSync(join(pre, 'darwin-arm64'), { recursive: true })
    mkdirSync(join(pre, 'win32-x64'), { recursive: true })
    writeFileSync(join(pre, 'darwin-arm64', 'pty.node'), 'keep')
    writeFileSync(join(pre, 'win32-x64', 'pty.node'), 'drop')
    mkdirSync(join(root, 'runtime', 'include'), { recursive: true })
    slimEngineTree(root, 'darwin', 'arm64')
    expect(existsSync(join(pre, 'darwin-arm64', 'pty.node'))).toBe(true)
    expect(existsSync(join(pre, 'win32-x64'))).toBe(false)
    expect(existsSync(join(root, 'runtime', 'include'))).toBe(false)
  })
})
