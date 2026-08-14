import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { NODE_DIST_BASE, OFFICIAL_PACKAGE } from '../shared/constants'
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
}

const silent: Logger = { info() {} }

function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let output = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.on('error', reject)
    child.on('exit', (code) => {
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
}): Promise<void> {
  const log = options.log ?? silent
  const platform = options.platform ?? process.platform
  const node = nodePathFor(options.engineRoot, platform)
  const npmCli = npmCliPath(options.engineRoot, platform)
  if (!existsSync(node)) throw new Error(`Node runtime missing at ${node}`)
  if (!existsSync(npmCli)) throw new Error(`npm CLI missing at ${npmCli}`)

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

  log.info(`Installing ${OFFICIAL_PACKAGE}@${options.engineVersion}`)
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    npm_config_cache: options.npmCacheDir,
    npm_config_update_notifier: 'false',
    npm_config_fund: 'false',
    npm_config_audit: 'false',
    npm_config_build_from_source: 'false',
  }
  delete env.ELECTRON_RUN_AS_NODE
  await run(node, [
    npmCli,
    'install',
    `${OFFICIAL_PACKAGE}@${options.engineVersion}`,
    '--omit=dev',
    '--no-audit',
    '--no-fund',
    '--no-package-lock',
  ], {
    cwd: options.engineRoot,
    env,
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
}): Promise<void> {
  const log = options.log ?? silent
  mkdirSync(options.engineRoot, { recursive: true })
  const destRuntime = join(options.engineRoot, 'runtime')
  if (options.runtimeSourceDir && existsSync(options.runtimeSourceDir)) {
    log.info(`Copying Node runtime from ${options.runtimeSourceDir}`)
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
