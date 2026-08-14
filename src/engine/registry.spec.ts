import { describe, expect, it } from 'vitest'
import { newestPublished, versionsNewerThan } from './registry'

describe('engine versions', () => {
  it('treats later release candidates as updates', () => {
    expect(versionsNewerThan('0.1.0-rc.6', ['0.1.0-rc.5', '0.1.0-rc.6', '0.1.0-rc.7'])).toEqual([
      '0.1.0-rc.7',
    ])
  })

  it('picks the newest published tag', () => {
    expect(newestPublished(['0.1.0-rc.6', '0.1.0-rc.7', '0.0.1-rc.5'])).toBe('0.1.0-rc.7')
  })
})
