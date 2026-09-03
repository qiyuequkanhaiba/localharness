import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isReady: () => true, getVersion: () => '0.1.9' },
  net: { fetch: vi.fn() },
}))

import { net } from 'electron'
import { appFetch, describeFetchError } from './app-fetch'

beforeEach(() => {
  vi.mocked(net.fetch).mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('describeFetchError', () => {
  it('includes nested cause and code from Node fetch failures', () => {
    const cause = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' })
    const error = new Error('fetch failed', { cause })
    expect(describeFetchError(error)).toBe('fetch failed: connect ETIMEDOUT: ETIMEDOUT')
  })
})

describe('appFetch', () => {
  it('uses Electron net.fetch and sends a LocalHarness user agent', async () => {
    vi.mocked(net.fetch).mockResolvedValue(new Response('{}', { status: 200 }))
    await appFetch('https://registry.npmjs.org/@deepseek-ai%2fdsh', { headers: { accept: 'application/json' } })
    expect(net.fetch).toHaveBeenCalledTimes(1)
    const [, init] = vi.mocked(net.fetch).mock.calls[0]
    const headers = new Headers(init?.headers)
    expect(headers.get('user-agent')).toBe('LocalHarness/0.1.9')
    expect(headers.get('accept')).toBe('application/json')
  })

  it('preserves a caller-provided abort signal', async () => {
    const controller = new AbortController()
    vi.mocked(net.fetch).mockResolvedValue(new Response('{}', { status: 200 }))

    await appFetch('https://api.github.com/repos/qiyuequkanhaiba/localharness/releases/latest', {
      signal: controller.signal,
    })

    const [, init] = vi.mocked(net.fetch).mock.calls[0]
    expect(init?.signal).toBe(controller.signal)
  })

  it('falls back to global fetch when Electron net.fetch is unavailable', async () => {
    const electronNet = net as typeof net & { fetch?: typeof fetch }
    const originalNetFetch = electronNet.fetch
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    electronNet.fetch = undefined

    try {
      await appFetch('https://registry.npmjs.org/@deepseek-ai%2fdsh')
    } finally {
      electronNet.fetch = originalNetFetch
    }

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const headers = new Headers(init?.headers)
    expect(headers.get('user-agent')).toBe('LocalHarness/0.1.9')
  })

  it('wraps network failures with the requested URL', async () => {
    vi.mocked(net.fetch).mockRejectedValue(Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' }))

    await expect(appFetch('https://registry.npmjs.org/@deepseek-ai%2fdsh')).rejects.toThrow(
      '无法访问 https://registry.npmjs.org/@deepseek-ai%2fdsh (connect ETIMEDOUT: ETIMEDOUT)',
    )
  })
})
