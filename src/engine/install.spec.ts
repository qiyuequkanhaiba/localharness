import { existsSync, mkdtempSync, mkdirSync, readlinkSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { copyRuntime, officialInstallEnv, splitOutputLines } from './install'

describe('officialInstallEnv', () => {
  it('puts the bundled node directory first on PATH so lifecycle scripts can run', () => {
    const node = '/tmp/engine/runtime/bin/node'
    const env = officialInstallEnv(node, { npm_config_cache: '/tmp/npm' }, { PATH: '/usr/bin', ELECTRON_RUN_AS_NODE: '1' })
    expect(env.PATH?.split(delimiter)[0]).toBe(dirname(node))
    expect(env.PATH).toContain('/usr/bin')
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(env.npm_config_scripts_prepend_node_path).toBe('true')
    expect(env.npm_config_prefer_online).toBe('true')
    expect(env.npm_config_prefer_offline).toBeUndefined()
    expect(env.npm_config_registry).toBe('https://registry.npmjs.org')
    expect(env.npm_config_cache).toBe('/tmp/npm')
    expect(env.NODE_OPTIONS).toContain('--max-old-space-size=4096')
  })
})

describe('splitOutputLines', () => {
  it('emits complete lines and keeps a trailing partial', () => {
    expect(splitOutputLines('http fetch GET 200 foo\nhttp fetch', '')).toEqual({
      lines: ['http fetch GET 200 foo'],
      pending: 'http fetch',
    })
  })

  it('treats carriage returns as line breaks so npm progress is visible', () => {
    expect(splitOutputLines('a\rb\n', '')).toEqual({
      lines: ['a', 'b'],
      pending: '',
    })
  })
})

describe('copyRuntime', () => {
  it('preserves relative symlink targets when copying the bundled runtime', async () => {
    const root = mkdtempSync(join(tmpdir(), 'localharness-copy-runtime-'))
    const source = join(root, 'source')
    const dest = join(root, 'dest')
    mkdirSync(join(source, 'bin'), { recursive: true })
    mkdirSync(join(source, 'lib', 'node_modules', 'npm', 'bin'), { recursive: true })
    writeFileSync(join(source, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'), '')
    symlinkSync('../lib/node_modules/npm/bin/npm-cli.js', join(source, 'bin', 'npm'))

    await copyRuntime(source, dest)

    expect(readlinkSync(join(dest, 'bin', 'npm'))).toBe('../lib/node_modules/npm/bin/npm-cli.js')
    expect(existsSync(join(dest, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'))).toBe(true)
  })
})
