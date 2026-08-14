import { READY_URL_PATTERN } from '../shared/constants'

/** Pull the loopback Web UI URL out of official `dsh web` stdout/stderr. */
export function parseReadyUrl(chunk: string): string | undefined {
  const match = READY_URL_PATTERN.exec(chunk)
  return match?.[1]
}

export function appendAndParse(buffer: { text: string }, chunk: string): string | undefined {
  buffer.text += chunk
  if (buffer.text.length > 1_000_000) {
    buffer.text = buffer.text.slice(-200_000)
  }
  return parseReadyUrl(buffer.text)
}
