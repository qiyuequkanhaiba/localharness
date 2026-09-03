import { describe, expect, it, vi } from 'vitest'
import { inspectShellUpdates } from './shell-update'

describe('inspectShellUpdates', () => {
  it('offers a newer GitHub release', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: '0.1.9',
        html_url: 'https://github.com/qiyuequkanhaiba/localharness/releases/tag/0.1.9',
      }),
    })
    await expect(inspectShellUpdates('0.1.8', fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      kind: 'available',
      current: '0.1.8',
      latest: '0.1.9',
      url: 'https://github.com/qiyuequkanhaiba/localharness/releases/tag/0.1.9',
    })
  })

  it('stays current when already on the latest tag', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: '0.1.8', html_url: 'https://example.invalid' }),
    })
    await expect(inspectShellUpdates('0.1.8', fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      kind: 'current',
      current: '0.1.8',
      latest: '0.1.8',
    })
  })
})
