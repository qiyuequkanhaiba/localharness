import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { NODE_DIST_BASE, NPM_REGISTRY, OFFICIAL_PACKAGE } from '../shared/constants'
import { killProcessTree } from './kill'
import {
  dshBinPath,
  manifestPath,
  nodePathFor,
  npmCliPath,
  type EngineManifest,
} from './layout'
import { nodeDistArchive, type HostArch, type HostPlatform } from './platform'
import { slimEngineTree } from './slim'

export interface Logger {
  info(message: string): void
  output?(text: string): void
}

const silent: Logger = { info() {} }

export function splitOutputLines(chunk: string, pending = ''): { lines: string[]; pending: string } {
  const text = `${pending}${chunk}`.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const parts = text.split('\n')
  const nextPending = parts.pop() ?? ''
  return {
    lines: parts.map((line) => line.replace(/\s+$/, '')).filter((line) => line.length > 0),
    pending: nextPending,
  }
}

/** Env for `npm install` of the official engine. Lifecycle scripts must see bundled `node`. */
export function officialInstallEnv(
  nodeBinary: string,
  extra: NodeJS.ProcessEnv = {},
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...base,
    PATH: `${dirname(nodeBinary)}${delimiter}${base.PATH ?? ''}`,
    npm_config_update_notifier: 'false',
    npm_config_fund: 'false',
    npm_config_audit: 'false',
    npm_config_build_from_source: 'false',
    npm_config_scripts_prepend_node_path: 'true',
    npm_config_prefer_online: 'true',
    npm_config_progress: 'false',
    npm_config_loglevel: 'info',
    npm_config_registry: NPM_REGISTRY,
    ...extra,
  }
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; onOutput?: (line: string) => void; signal?: AbortSignal },
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new Error('install cancelled'))
      return
    }
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let output = ''
    let pending = ''
    const take = (chunk: Buffer): void => {
      const text = chunk.toString()
      output = `${output}${text}`.slice(-8000)
      const split = splitOutputLines(text, pending)
      pending = split.pending
      for (const line of split.lines) options.onOutput?.(line)
    }
    child.stdout?.on('data', take)
    child.stderr?.on('data', take)
    const abort = (): void => {
      if (child.pid) void killProcessTree(child.pid, 4_000)
    }
    options.signal?.addEventListener('abort', abort, { once: true })
    child.on('error', (error) => {
      options.signal?.removeEventListener('abort', abort)
      reject(error)
    })
    child.on('exit', (code) => {
      options.signal?.removeEventListener('abort', abort)
      if (pending.trim()) options.onOutput?.(pending.trim())
      if (options.signal?.aborted) {
        reject(new Error('install cancelled'))
        return
      }
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} ${args.join(' ')} exited ${code}\n${output.slice(-4000)}`))
    })
  })
}

export async function downloadFile(url: string, dest: string, log: Logger = silent): Promise<void> {
  log.info(`Downloading ${url}`)
  mkdirSync(dirname(dest), { recursive: true })
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`download failed ${response.status}: ${url}`)
  }
  await pipeline(response.body as unknown as NodeJS.ReadableStream, createWriteStream(dest))
}

export async function extractArchive(
  archivePath: string,
  destDir: string,
  stripComponents: number,
): Promise<void> {
  mkdirSync(destDir, { recursive: true })
  if (archivePath.endsWith('.zip')) {
    if (process.platform === 'win32') {
      await run('tar', ['-xf', archivePath, '--strip-components', String(stripComponents), '-C', destDir], {})
      return
    }
    await run('tar', ['-xf', archivePath, '--strip-components', String(stripComponents), '-C', destDir], {})
    return
  }
  await run('tar', ['-xzf', archivePath, '--strip-components', String(stripComponents), '-C', destDir], {})
}

export async function installNodeRuntime(options: {
  destRuntimeDir: string
  nodeVersion: string
  platform: HostPlatform
  arch: HostArch
  cacheDir: string
  log?: Logger
}): Promise<void> {
  const log = options.log ?? silent
  const { fileName, stripComponents } = nodeDistArchive(options.nodeVersion, options.platform, options.arch)
  const url = `${NODE_DIST_BASE}/v${options.nodeVersion.replace(/^v/, '')}/${fileName}`
  const archive = join(options.cacheDir, fileName)
  if (!existsSync(archive)) {
    await downloadFile(url, archive, log)
  } else {
    log.info(`Using cached ${fileName}`)
  }
  rmSync(options.destRuntimeDir, { recursive: true, force: true })
  mkdirSync(options.destRuntimeDir, { recursive: true })
  await extractArchive(archive, options.destRuntimeDir, stripComponents)
}

export async function copyRuntime(sourceRuntimeDir: string, destRuntimeDir: string): Promise<void> {
  rmSync(destRuntimeDir, { recursive: true, force: true })
  await cp(sourceRuntimeDir, destRuntimeDir, { recursive: true })
}

export async function installOfficialPackage(options: {
  engineRoot: string
  engineVersion: string
  npmCacheDir: string
  log?: Logger
  platform?: NodeJS.Platform
  signal?: AbortSignal
}): Promise<void> {
  const log = options.log ?? silent
  const platform = options.platform ?? process.platform
  const node = nodePathFor(options.engineRoot, platform)
  const npmCli = npmCliPath(options.engineRoot, platform)
  if (!existsSync(node)) throw new Error(`Node runtime missing at ${node}`)
  if (!existsSync(npmCli)) throw new Error(`npm CLI missing at ${npmCli}`)
  if (options.signal?.aborted) throw new Error('install cancelled')

  mkdirSync(options.engineRoot, { recursive: true })
  writeFileSync(
    join(options.engineRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: 'localharness-engine',
        private: true,
        description: 'Pinned official DeepSeek Harness for LocalHarness',
      },
      null,
      2,
    )}\n`,
  )

  log.info(`正在安装 ${OFFICIAL_PACKAGE}@${options.engineVersion}（依赖较多，可能需要几分钟）`)
  const env = officialInstallEnv(node, { npm_config_cache: options.npmCacheDir })
  await run(node, [
    npmCli,
    'install',
    `${OFFICIAL_PACKAGE}@${options.engineVersion}`,
    '--omit=dev',
    '--no-audit',
    '--no-fund',
    '--no-package-lock',
    '--no-progress',
    '--loglevel=info',
    '--foreground-scripts',
  ], {
    cwd: options.engineRoot,
    env,
    signal: options.signal,
    onOutput: (line) => log.output?.(line),
  })

  if (!existsSync(dshBinPath(options.engineRoot))) {
    throw new Error(`install finished but ${dshBinPath(options.engineRoot)} is missing`)
  }
}

export function writeManifest(engineRoot: string, manifest: EngineManifest): void {
  writeFileSync(manifestPath(engineRoot), `${JSON.stringify(manifest, null, 2)}\n`)
}

export async function prepareEngineTree(options: {
  engineRoot: string
  engineVersion: string
  nodeVersion: string
  platform: HostPlatform
  arch: HostArch
  cacheDir: string
  runtimeSourceDir?: string
  log?: Logger
  signal?: AbortSignal
}): Promise<void> {
  const log = options.log ?? silent
  if (options.signal?.aborted) throw new Error('install cancelled')
  mkdirSync(options.engineRoot, { recursive: true })
  const destRuntime = join(options.engineRoot, 'runtime')
  if (options.runtimeSourceDir && existsSync(options.runtimeSourceDir)) {
    log.info('正在复制 Node 运行时…')
    await copyRuntime(options.runtimeSourceDir, destRuntime)
  } else {
    await installNodeRuntime({
      destRuntimeDir: destRuntime,
      nodeVersion: options.nodeVersion,
      platform: options.platform,
      arch: options.arch,
      cacheDir: options.cacheDir,
      log,
    })
  }
  await installOfficialPackage({
    engineRoot: options.engineRoot,
    engineVersion: options.engineVersion,
    npmCacheDir: join(options.cacheDir, 'npm'),
    log,
    platform: options.platform,
    signal: options.signal,
  })
  writeManifest(options.engineRoot, {
    engineVersion: options.engineVersion,
    nodeVersion: options.nodeVersion,
    packageName: OFFICIAL_PACKAGE,
    platform: options.platform,
    arch: options.arch,
    preparedAt: new Date().toISOString(),
  })
  slimEngineTree(options.engineRoot, options.platform, options.arch)
}

export function scratchDir(prefix: string): string {
  return join(tmpdir(), `${prefix}-${process.pid}-${Date.now()}`)
}
