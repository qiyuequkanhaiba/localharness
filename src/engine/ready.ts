import { READY_URL_PATTERN } from '../shared/constants'

function isLoopbackHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    const loopback =
      url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1'
    return (url.protocol === 'http:' || url.protocol === 'https:') && loopback
  } catch {
    return false
  }
}

/** Pull the loopback Web UI URL out of official `dsh web` stdout/stderr, including `?token=`. */
export function parseReadyUrl(chunk: string): string | undefined {
  const match = READY_URL_PATTERN.exec(chunk)
  const raw = match?.[1]
  if (!raw || !isLoopbackHttpUrl(raw)) return undefined
  return raw
}

export function appendAndParse(buffer: { text: string }, chunk: string): string | undefined {
  buffer.text += chunk
  if (buffer.text.length > 1_000_000) {
    buffer.text = buffer.text.slice(-200_000)
  }
  return parseReadyUrl(buffer.text)
}
