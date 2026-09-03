import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: class {},
  Menu: { buildFromTemplate: vi.fn() },
  shell: { openExternal: vi.fn() },
}))

import { parseShellAction, sameLoopbackOrigin } from './window'

describe('parseShellAction', () => {
  it('reads restart, rollback, and logs', () => {
    expect(parseShellAction('localharness://restart')).toBe('restart')
    expect(parseShellAction('localharness://rollback')).toBe('rollback')
    expect(parseShellAction('localharness://logs')).toBe('logs')
    expect(parseShellAction('https://example.com')).toBeUndefined()
  })
})

describe('sameLoopbackOrigin', () => {
  it('treats tokenized and clean loopback URLs as the same origin', () => {
    expect(
      sameLoopbackOrigin('http://127.0.0.1:3080/?token=abc', 'http://127.0.0.1:3080/'),
    ).toBe(true)
    expect(sameLoopbackOrigin('http://127.0.0.1:3080/', 'http://127.0.0.1:3081/')).toBe(false)
  })
})
