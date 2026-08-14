import { describe, expect, it } from 'vitest'
import { appendAndParse, parseReadyUrl } from './ready'

describe('parseReadyUrl', () => {
  it('reads the official loopback announcement', () => {
    expect(parseReadyUrl('dsh web: http://127.0.0.1:3080\n')).toBe('http://127.0.0.1:3080')
  })

  it('ignores the optional LAN suffix', () => {
    expect(parseReadyUrl('dsh web: http://127.0.0.1:54321 (LAN: http://192.168.1.8:54321)\n')).toBe(
      'http://127.0.0.1:54321',
    )
  })

  it('rejects a non-loopback URL', () => {
    expect(parseReadyUrl('dsh web: http://192.168.1.8:3080\n')).toBeUndefined()
  })

  it('finds the line in a mixed buffer', () => {
    const buffer = { text: '' }
    expect(appendAndParse(buffer, 'loading plugins\n')).toBeUndefined()
    expect(appendAndParse(buffer, 'dsh web: http://127.0.0.1:49152\nready\n')).toBe(
      'http://127.0.0.1:49152',
    )
  })
})
