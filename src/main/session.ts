import { spawn, type ChildProcess } from 'node:child_process'
import { delimiter } from 'node:path'
import { ENGINE_START_TIMEOUT_MS, ENGINE_STOP_TIMEOUT_MS } from '../shared/constants'
import { killProcessTree } from '../engine/kill'
import { appendAndParse } from '../engine/ready'
import type { ResolvedEngine } from '../engine/layout'
import type { EngineLog } from './logs'

export interface RunningEngine {
  process: ChildProcess
  engine: ResolvedEngine
  url: string
}

export interface StartEngineOptions {
  engine: ResolvedEngine
  cwd: string
  log: EngineLog
  extraEnv?: NodeJS.ProcessEnv
  timeoutMs?: number
}

function runtimeBinDir(engine: ResolvedEngine): string {
  return process.platform === 'win32' ? engine.runtimeDir : `${engine.runtimeDir}/bin`
}

export function startEngine(options: StartEngineOptions): Promise<RunningEngine> {
  const timeoutMs = options.timeoutMs ?? ENGINE_START_TIMEOUT_MS
  const pathPrefix = runtimeBinDir(options.engine)
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...options.extraEnv,
    PATH: `${pathPrefix}${delimiter}${process.env.PATH ?? ''}`,
  }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_NO_ASAR

  const child = spawn(
    options.engine.nodePath,
    [options.engine.dshBinPath, 'web', '--host', '127.0.0.1', '--port', '0'],
    {
      cwd: options.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  )

  options.log.write('spawn', `${options.engine.nodePath} ${options.engine.dshBinPath} web --host 127.0.0.1 --port 0`)
  options.log.write('engine', `${options.engine.version} from ${options.engine.root} (${options.engine.source})`)

  return new Promise<RunningEngine>((resolve, reject) => {
    const buffer = { text: '' }
    let settled = false

    const finish = (error?: Error, url?: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.stdout?.off('data', onData)
      child.stderr?.off('data', onData)
      child.off('error', onError)
      child.off('exit', onExit)
      if (error || !url) {
        reject(error ?? new Error('engine exited before publishing a URL'))
        return
      }
      resolve({ process: child, engine: options.engine, url })
    }

    const onData = (chunk: Buffer): void => {
      const text = chunk.toString()
      options.log.write('dsh', text)
      const url = appendAndParse(buffer, text)
      if (url) finish(undefined, url)
    }

    const onError = (error: Error): void => {
      options.log.write('error', error.message)
      finish(error)
    }

    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      const tail = buffer.text.trim().slice(-2000)
      finish(new Error(`engine exited (code ${code}, signal ${signal})${tail ? `\n${tail}` : ''}`))
    }

    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.on('error', onError)
    child.on('exit', onExit)

    const timer = setTimeout(() => {
      finish(new Error(`engine did not print a ready URL within ${timeoutMs}ms`))
      void killProcessTree(child.pid ?? 0, ENGINE_STOP_TIMEOUT_MS)
    }, timeoutMs)
  })
}

export async function stopEngine(running: RunningEngine | undefined, log: EngineLog): Promise<void> {
  if (!running?.process.pid) return
  log.write('stop', `pid ${running.process.pid}`)
  await killProcessTree(running.process.pid, ENGINE_STOP_TIMEOUT_MS)
}
