import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('mac signing config', () => {
  it('opts into ad-hoc signing so downloaded mac apps are a valid bundle', () => {
    const config = readFileSync(resolve(__dirname, '../../electron-builder.yml'), 'utf8')

    expect(config).toMatch(/\nmac:\n(?: {2,}.+\n)* {2}identity: ["']-["']/)
  })

  it('preserves engine symlinks when copying into the mac app bundle', () => {
    const script = readFileSync(resolve(__dirname, '../../scripts/after-pack.cjs'), 'utf8')

    expect(script).toContain('verbatimSymlinks: true')
  })
})
