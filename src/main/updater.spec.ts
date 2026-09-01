import { describe, expect, it, vi } from 'vitest'
import { fetchOfficialVersions } from '../engine/registry'
import { inspectOfficialUpdates } from './updater'

vi.mock('electron', () => ({
  dialog: {
    showMessageBox: vi.fn(),
  },
}))

vi.mock('../engine/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../engine/registry')>()
  return {
    ...actual,
    fetchOfficialVersions: vi.fn(),
  }
})

describe('inspectOfficialUpdates', () => {
  it('uses the npm latest dist-tag instead of the highest alpha prerelease', async () => {
    vi.mocked(fetchOfficialVersions).mockResolvedValue({
      name: '@deepseek-ai/dsh',
      latest: '0.1.1-rc.2',
      versions: ['0.1.2-alpha.3', '0.1.2-alpha.2', '0.1.1-rc.2', '0.1.0-rc.6'],
    })

    const decision = await inspectOfficialUpdates('0.1.0-rc.6')

    expect(decision).toMatchObject({
      kind: 'available',
      current: '0.1.0-rc.6',
      target: '0.1.1-rc.2',
    })
  })

  it('stays current when only a higher alpha prerelease exists past latest', async () => {
    vi.mocked(fetchOfficialVersions).mockResolvedValue({
      name: '@deepseek-ai/dsh',
      latest: '0.1.1-rc.2',
      versions: ['0.1.2-alpha.3', '0.1.2-alpha.2', '0.1.1-rc.2'],
    })

    const decision = await inspectOfficialUpdates('0.1.1-rc.2')

    expect(decision).toEqual({
      kind: 'current',
      current: '0.1.1-rc.2',
      latest: '0.1.1-rc.2',
    })
  })
})
