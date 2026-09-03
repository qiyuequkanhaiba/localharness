import { app, net } from 'electron'
import { PRODUCT_NAME } from '../shared/constants'

const FETCH_TIMEOUT_MS = 20_000

export function describeFetchError(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  for (let i = 0; i < 4 && current; i++) {
    if (current instanceof Error) {
      if (current.message) parts.push(current.message)
      const extra = current as Error & { code?: string; errno?: string }
      if (extra.code && !parts.includes(extra.code)) parts.push(extra.code)
      current = current.cause
    } else {
      parts.push(String(current))
      break
    }
  }
  return parts.length > 0 ? parts.join(': ') : 'fetch failed'
}

export async function appFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (!headers.has('user-agent')) {
    const version = app.isReady() ? app.getVersion() : ''
    headers.set('user-agent', version ? `${PRODUCT_NAME}/${version}` : PRODUCT_NAME)
  }
  const signal = init.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS)
  try {
    if (typeof net.fetch === 'function') {
      return await net.fetch(url, { ...init, headers, signal })
    }
    return await fetch(url, { ...init, headers, signal })
  } catch (error) {
    throw new Error(`无法访问 ${url} (${describeFetchError(error)})`)
  }
}
