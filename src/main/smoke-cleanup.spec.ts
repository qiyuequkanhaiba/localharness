import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mkdtempSync: vi.fn(),
  rmSync: vi.fn(),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    mkdtempSync: mocks.mkdtempSync,
    rmSync: mocks.rmSync,
  }
})

vi.mock('../engine/layout', () => ({
  resolveEngineFromRoot: vi.fn(() => ({
    root: 'engine-root',
    nodePath: 'node',
    dshBinPath: 'dsh',
    runtimeDir: 'runtime',
    version: '0.1.2-rc.1',
    source: 'user',
  })),
}))

vi.mock('./logs', () => ({
  EngineLog: class {
    open(): void {}
    close(): void {}
  },
}))

vi.mock('./session', () => ({
  startEngine: vi.fn(async () => ({ url: 'http://127.0.0.1:12345/?token=test' })),
  stopEngine: vi.fn(async () => {}),
}))

import { smokeTestEngine } from './smoke'

describe('smoke temp home cleanup', () => {
  beforeEach(() => {
    mocks.mkdtempSync.mockReturnValue('C:\\Users\\Nova\\AppData\\Local\\Temp\\localharness-smoke-test')
    mocks.rmSync.mockReset()
  })

  it('does not fail an otherwise successful smoke test when Windows leaves the temp profile non-empty', async () => {
    mocks.rmSync.mockImplementation(() => {
      throw Object.assign(new Error('ENOTEMPTY, Directory not empty'), {
        code: 'ENOTEMPTY',
        path: 'C:\\Users\\Nova\\AppData\\Local\\Temp\\localharness-smoke-test',
      })
    })

    await expect(smokeTestEngine('engine-root')).resolves.toBe('http://127.0.0.1:12345/?token=test')
  })
})
