export type EngineUpdateBusyState = {
  phase: 'checking' | 'confirming' | 'installing' | 'restarting'
  target?: string
}

function targetSuffix(target: string | undefined): string {
  return target ? ` ${target}` : ''
}

export function engineUpdateBusyMessage(state: EngineUpdateBusyState): string {
  const target = targetSuffix(state.target)
  switch (state.phase) {
    case 'checking':
      return '正在检查官方引擎更新，请稍候。'
    case 'confirming':
      return `正在等待官方引擎${target}更新确认，请稍候。`
    case 'installing':
      return `正在安装官方引擎${target}，依赖较多时可能需要几分钟。`
    case 'restarting':
      return `正在重启到官方引擎${target}，请稍候。`
  }
}
