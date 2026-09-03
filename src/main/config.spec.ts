import { describe, expect, it } from 'vitest'
import { rememberDisabledPlugins, restoreActiveEngine, type ShellConfig } from './config'

describe('restoreActiveEngine', () => {
  it('puts the previous active engine back after a failed update', () => {
    const config: ShellConfig = {
      activeEngineVersion: '0.1.2-alpha.5',
      previousEngineVersion: '0.1.1-rc.2',
    }
    restoreActiveEngine(config, '0.1.1-rc.2', '0.1.2-alpha.5')
    expect(config.activeEngineVersion).toBe('0.1.1-rc.2')
    expect(config.previousEngineVersion).toBe('0.1.2-alpha.5')
  })

  it('clears the active version when rolling back to the shipped engine', () => {
    const config: ShellConfig = { activeEngineVersion: '0.1.2-alpha.5' }
    restoreActiveEngine(config, undefined, '0.1.2-alpha.5')
    expect(config.activeEngineVersion).toBeUndefined()
    expect(config.previousEngineVersion).toBe('0.1.2-alpha.5')
  })
})

describe('rememberDisabledPlugins', () => {
  it('merges plugin rows by package name', () => {
    const config: ShellConfig = {
      disabledPlugins: [{ packageName: 'dshmarket', entryIds: ['dsh-market'] }],
    }
    rememberDisabledPlugins(config, [
      { packageName: 'dsh-better-sidebar', entryIds: ['better-sidebar'], engineVersion: '0.1.2-alpha.5' },
      { packageName: 'dshmarket', entryIds: ['dsh-market'], engineVersion: '0.1.2-alpha.5' },
    ])
    expect(config.disabledPlugins).toEqual([
      { packageName: 'dshmarket', entryIds: ['dsh-market'], engineVersion: '0.1.2-alpha.5' },
      { packageName: 'dsh-better-sidebar', entryIds: ['better-sidebar'], engineVersion: '0.1.2-alpha.5' },
    ])
  })
})
