import { describe, expect, it } from 'vitest'
import { engineUpdateBusyMessage } from './update-state'

describe('engineUpdateBusyMessage', () => {
  it('names the target version while an official engine install is still running', () => {
    expect(engineUpdateBusyMessage({ phase: 'installing', target: '0.1.2-rc.1' })).toBe(
      '正在安装官方引擎 0.1.2-rc.1，依赖较多时可能需要几分钟。',
    )
  })

  it('does not describe update checks as installation', () => {
    expect(engineUpdateBusyMessage({ phase: 'checking' })).toBe('正在检查官方引擎更新，请稍候。')
  })

  it('describes the restart phase separately from installation', () => {
    expect(engineUpdateBusyMessage({ phase: 'restarting', target: '0.1.2-rc.1' })).toBe(
      '正在重启到官方引擎 0.1.2-rc.1，请稍候。',
    )
  })
})
