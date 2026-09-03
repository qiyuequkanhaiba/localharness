import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Bundles that ship with official dsh. Never auto-disable these. */
export const OFFICIAL_PROFILE_BUNDLES = [
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  '@deepseek-ai/dsh-headless',
] as const

export interface DisabledPlugin {
  packageName: string
  entryIds: string[]
}

export function webProfileDir(userHome: string): string {
  return join(userHome, 'profiles', 'web')
}

export function webProfilePatchPath(userHome: string): string {
  return join(webProfileDir(userHome), 'cordis.patch.yml')
}

export function extraProfileBundles(webDir: string): string[] {
  const file = join(webDir, 'package.json')
  if (!existsSync(file)) return []
  try {
    const pkg = JSON.parse(readFileSync(file, 'utf8')) as {
      dsh?: { profile?: { bundles?: unknown } }
    }
    const bundles = pkg.dsh?.profile?.bundles
    if (!Array.isArray(bundles)) return []
    return bundles.filter(
      (name): name is string =>
        typeof name === 'string' &&
        name.length > 0 &&
        !(OFFICIAL_PROFILE_BUNDLES as readonly string[]).includes(name),
    )
  } catch {
    return []
  }
}

function nodeModulesPackages(message: string): string[] {
  const names: string[] = []
  const pattern = /node_modules[/\\]((?:@[^/\\]+[/\\])?[^/\\]+)[/\\]/g
  for (const match of message.matchAll(pattern)) {
    const name = match[1].replaceAll('\\', '/')
    if (name === '.pnpm' || name.startsWith('.')) continue
    names.push(name)
  }
  return names
}

/** Prefer a user-installed extra bundle named in the engine error. */
export function extractProfilePluginPackage(
  message: string,
  extraBundles: readonly string[],
  webDir?: string,
): string | undefined {
  const names = nodeModulesPackages(message)
  const extra = new Set(extraBundles)
  const fromExtra = names.find((name) => extra.has(name))
  if (fromExtra) return fromExtra
  if (!webDir) return undefined
  return names.find((name) => existsSync(bundlePatchFile(join(webDir, 'node_modules', ...name.split('/')))))
}

export function describeProfilePluginFailure(message: string): string {
  const names = nodeModulesPackages(message)
  const plugin = names.find((name) => !name.startsWith('@deepseek-ai/')) ?? names[0]
  const missingExport = message.match(/does not provide an export named '([^']+)'/)?.[1]
  if (plugin && missingExport) {
    return `Plugin ${plugin} is not compatible with this official engine (missing export ${missingExport}).`
  }
  if (plugin) {
    return `Plugin ${plugin} is not compatible with this official engine.`
  }
  return 'A plugin in ~/.dsh/profiles/web is not compatible with this official engine.'
}

function parseYamlScalar(raw: string): string {
  let value = raw.trim().replace(/\s+#.*$/, '').trim()
  if (
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2) ||
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2)
  ) {
    return value.slice(1, -1)
  }
  return value
}

function yamlScalar(value: string): string {
  if (/^[A-Za-z0-9_./-]+$/.test(value)) return value
  return JSON.stringify(value)
}

/** Entry ids a bundle patch inserts for `packageName`. */
export function entryIdsFromBundlePatch(yaml: string, packageName: string): string[] {
  const lines = yaml.split(/\r?\n/)
  const inserted: { id: string; name?: string }[] = []
  let inInsert = false
  let insertIndent = 0
  let current: { id?: string; name?: string } | undefined

  const commit = (): void => {
    if (current?.id) inserted.push({ id: current.id, name: current.name })
    current = undefined
  }

  for (const line of lines) {
    if (/^\s*(#.*)?$/.test(line)) continue
    const indent = (line.match(/^\s*/)?.[0] ?? '').length
    if (inInsert && indent <= insertIndent) {
      commit()
      inInsert = false
    }
    const insertMatch = line.match(/^(\s*)(?:-\s+)?insert\s*:/)
    if (insertMatch && !inInsert) {
      commit()
      inInsert = true
      insertIndent = insertMatch[1].length
      continue
    }
    if (!inInsert) continue
    const item = /^\s*-\s+/.test(line)
    if (item && current?.id) commit()
    const idMatch = line.match(/\bid\s*:\s*(.+)$/)
    if (idMatch) {
      if (!current) current = {}
      current.id = parseYamlScalar(idMatch[1])
    }
    const nameMatch = line.match(/\bname\s*:\s*(.+)$/)
    if (nameMatch) {
      if (!current) current = {}
      current.name = parseYamlScalar(nameMatch[1])
    }
  }
  commit()

  const matched = inserted
    .filter(
      (entry) => entry.name === packageName || entry.name?.startsWith(`${packageName}/`),
    )
    .map((entry) => entry.id)
  const ids = matched.length > 0 ? matched : inserted.map((entry) => entry.id)
  return [...new Set(ids)]
}

function bundlePatchFile(pkgDir: string): string {
  const manifest = join(pkgDir, 'package.json')
  if (existsSync(manifest)) {
    try {
      const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as {
        dsh?: { bundle?: { patch?: unknown } }
      }
      if (typeof pkg.dsh?.bundle?.patch === 'string' && pkg.dsh.bundle.patch.length > 0) {
        return join(pkgDir, pkg.dsh.bundle.patch)
      }
    } catch {
      // fall through to the usual filename
    }
  }
  return join(pkgDir, 'cordis.patch.yml')
}

export function resolvePluginEntryIds(webDir: string, packageName: string): string[] {
  const pkgDir = join(webDir, 'node_modules', ...packageName.split('/'))
  const patchFile = bundlePatchFile(pkgDir)
  if (existsSync(patchFile)) {
    const ids = entryIdsFromBundlePatch(readFileSync(patchFile, 'utf8'), packageName)
    if (ids.length > 0) return ids
  }
  return [packageName]
}

function alreadyDisabled(content: string, id: string): boolean {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `(?:^|\\n)-\\s*id:\\s*(?:['"]${escaped}['"]|${escaped})\\s*\\n\\s*disabled:\\s*true\\b`,
  )
  return pattern.test(content)
}

export function mergeDisablePatches(content: string, ids: string[]): string {
  const extra = ids.filter((id) => id.length > 0 && !alreadyDisabled(content, id))
  if (extra.length === 0) return content.endsWith('\n') ? content : `${content}\n`
  const block = [
    '# LocalHarness turned these plugins off: they failed to start with the new official engine.',
    '# Packages remain installed. After updating a plugin, remove its entry below to turn it back on, or uninstall it.',
    ...extra.map((id) => `- id: ${yamlScalar(id)}\n  disabled: true`),
  ].join('\n')
  const trimmed = content.replace(/\s+$/, '')
  if (trimmed.length === 0 || /^((?:\s*#.*\n)*)\s*\[\s*\]$/.test(trimmed)) {
    const comments = trimmed.match(/^(?:\s*#.*\n)*/)?.[0] ?? ''
    return `${comments}${block}\n`
  }
  return `${trimmed}\n${block}\n`
}

export function applyLivePluginDisables(
  userHome: string,
  ids: string[],
): { restore(): void } {
  const uniqueIds = [...new Set(ids.filter((id) => id.length > 0))]
  const file = webProfilePatchPath(userHome)
  const existed = existsSync(file)
  const previous = existed ? readFileSync(file, 'utf8') : undefined
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, mergeDisablePatches(previous ?? '[]\n', uniqueIds))
  let restored = false
  return {
    restore() {
      if (restored) return
      restored = true
      if (previous === undefined) {
        writeFileSync(file, '[]\n')
        return
      }
      writeFileSync(file, previous)
    },
  }
}
