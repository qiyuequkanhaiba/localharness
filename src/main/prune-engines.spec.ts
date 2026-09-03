import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pruneUserEngines } from './prune-engines'

describe('pruneUserEngines', () => {
  it('deletes engines that are neither active nor previous', () => {
    const root = mkdtempSync(join(tmpdir(), 'localharness-prune-'))
    for (const name of ['0.1.0-rc.7', '0.1.1-rc.2', '0.1.2-alpha.5']) {
      mkdirSync(join(root, name), { recursive: true })
      writeFileSync(join(root, name, 'marker'), name)
    }
    expect(pruneUserEngines(root, ['0.1.2-alpha.5', '0.1.1-rc.2'])).toEqual(['0.1.0-rc.7'])
    expect(existsSync(join(root, '0.1.0-rc.7'))).toBe(false)
    expect(existsSync(join(root, '0.1.1-rc.2'))).toBe(true)
    expect(existsSync(join(root, '0.1.2-alpha.5'))).toBe(true)
  })
})
