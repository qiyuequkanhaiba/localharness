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
  it('offers the newest published version even when it is on the alpha tag', async () => {
    vi.mocked(fetchOfficialVersions).mockResolvedValue({
      name: '@deepseek-ai/dsh',
      latest: '0.1.1-rc.2',
      versions: ['0.1.2-alpha.5', '0.1.2-alpha.3', '0.1.1-rc.2', '0.1.0-rc.6'],
    })

    const decision = await inspectOfficialUpdates('0.1.1-rc.2')

    expect(decision).toMatchObject({
      kind: 'available',
      current: '0.1.1-rc.2',
      target: '0.1.2-alpha.5',
      latestTag: '0.1.1-rc.2',
    })
  })

  it('stays current when already on the newest published version', async () => {
    vi.mocked(fetchOfficialVersions).mockResolvedValue({
      name: '@deepseek-ai/dsh',
      latest: '0.1.1-rc.2',
      versions: ['0.1.2-alpha.5', '0.1.1-rc.2'],
    })

    const decision = await inspectOfficialUpdates('0.1.2-alpha.5')

    expect(decision).toEqual({
      kind: 'current',
      current: '0.1.2-alpha.5',
      latest: '0.1.2-alpha.5',
    })
  })
})
