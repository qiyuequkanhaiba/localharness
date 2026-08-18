import { delimiter, dirname } from 'node:path'
import { describe, expect, it } from 'vitest'
import { officialInstallEnv } from './install'

describe('officialInstallEnv', () => {
  it('puts the bundled node directory first on PATH so lifecycle scripts can run', () => {
    const node = '/tmp/engine/runtime/bin/node'
    const env = officialInstallEnv(node, { npm_config_cache: '/tmp/npm' }, { PATH: '/usr/bin', ELECTRON_RUN_AS_NODE: '1' })
    expect(env.PATH?.split(delimiter)[0]).toBe(dirname(node))
    expect(env.PATH).toContain('/usr/bin')
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(env.npm_config_scripts_prepend_node_path).toBe('true')
    expect(env.npm_config_cache).toBe('/tmp/npm')
  })
})
