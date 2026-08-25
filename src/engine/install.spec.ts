import { delimiter, dirname } from 'node:path'
import { describe, expect, it } from 'vitest'
import { officialInstallEnv, splitOutputLines } from './install'

describe('officialInstallEnv', () => {
  it('puts the bundled node directory first on PATH so lifecycle scripts can run', () => {
    const node = '/tmp/engine/runtime/bin/node'
    const env = officialInstallEnv(node, { npm_config_cache: '/tmp/npm' }, { PATH: '/usr/bin', ELECTRON_RUN_AS_NODE: '1' })
    expect(env.PATH?.split(delimiter)[0]).toBe(dirname(node))
    expect(env.PATH).toContain('/usr/bin')
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(env.npm_config_scripts_prepend_node_path).toBe('true')
    expect(env.npm_config_prefer_offline).toBe('true')
    expect(env.npm_config_cache).toBe('/tmp/npm')
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
