import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  applyLivePluginDisables,
  describeProfilePluginFailure,
  entryIdsFromBundlePatch,
  extraProfileBundles,
  extractProfilePluginPackage,
  mergeDisablePatches,
  resolvePluginEntryIds,
} from './profile-plugins'

describe('extractProfilePluginPackage', () => {
  it('picks the extra bundle from a Windows file URL', () => {
    const message = [
      "file:///C:/Users/Nova006693/.dsh/profiles/web/node_modules/dsh-better-sidebar/lib/index.js:11",
      "import { SettingsConflictError, settingsNamespace } from \"@deepseek-ai/dsh-settings\";",
      "SyntaxError: The requested module '@deepseek-ai/dsh-settings' does not provide an export named 'settingsNamespace'",
    ].join('\n')
    expect(extractProfilePluginPackage(message, ['dshmarket', 'dsh-better-sidebar'])).toBe(
      'dsh-better-sidebar',
    )
  })

  it('skips .pnpm and official packages', () => {
    const message =
      'file:///C:/Users/x/.dsh/profiles/web/node_modules/.pnpm/dsh-better-sidebar@1.0.0/node_modules/dsh-better-sidebar/lib/index.js'
    expect(extractProfilePluginPackage(message, ['dsh-better-sidebar'])).toBe('dsh-better-sidebar')
  })

  it('ignores plugins that are not extra profile bundles', () => {
    const message = 'node_modules/@deepseek-ai/dsh-web-app/lib/index.js'
    expect(extractProfilePluginPackage(message, ['dshmarket'])).toBeUndefined()
  })

  it('falls back to a package that ships a bundle patch', () => {
    const web = mkdtempSync(join(tmpdir(), 'localharness-extract-'))
    const pkg = join(web, 'node_modules', 'dsh-better-sidebar')
    mkdirSync(pkg, { recursive: true })
    writeFileSync(join(pkg, 'cordis.patch.yml'), '- insert:\n    - id: better-sidebar\n      name: dsh-better-sidebar\n')
    const message = 'node_modules/dsh-better-sidebar/lib/index.js'
    expect(extractProfilePluginPackage(message, [], web)).toBe('dsh-better-sidebar')
  })
})

describe('describeProfilePluginFailure', () => {
  it('names the plugin and missing export from a dsh-settings mismatch', () => {
    const message = [
      "file:///C:/Users/Nova006693/.dsh/profiles/web/node_modules/dsh-better-sidebar/lib/index.js:11",
      "import { SettingsConflictError, settingsNamespace } from \"@deepseek-ai/dsh-settings\";",
      "SyntaxError: The requested module '@deepseek-ai/dsh-settings' does not provide an export named 'settingsNamespace'",
    ].join('\n')
    expect(describeProfilePluginFailure(message)).toBe(
      'Plugin dsh-better-sidebar is not compatible with this official engine (missing export settingsNamespace).',
    )
  })
})

describe('entryIdsFromBundlePatch', () => {
  it('reads dshmarket-style insert ids', () => {
    const yaml = `# dsh bundle patch: inserts this plugin into a profile's layer stack.
- insert:
    - id: dsh-market
      name: 'dshmarket'
`
    expect(entryIdsFromBundlePatch(yaml, 'dshmarket')).toEqual(['dsh-market'])
  })

  it('reads better-sidebar insert ids next to a !!js disabled guard', () => {
    const yaml = `- insert:
    - id: better-sidebar
      name: 'dsh-better-sidebar'
      disabled: !!js "[...ctx.loader.entries()].some((e) => e.options.name === 'dsh-better-sidebar' && e.options.id !== 'better-sidebar' && !e.disabled)"
`
    expect(entryIdsFromBundlePatch(yaml, 'dsh-better-sidebar')).toEqual(['better-sidebar'])
  })

  it('ignores commented example mounts in the bundle patch', () => {
    const yaml = `#   - insert:
#       - id: better-sidebar
#         name: 'dsh-better-sidebar'
- insert:
    - id: better-sidebar
      name: 'dsh-better-sidebar'
`
    expect(entryIdsFromBundlePatch(yaml, 'dsh-better-sidebar')).toEqual(['better-sidebar'])
  })

  it('does not treat override patches as plugin ids', () => {
    const yaml = `- id: hmr
  disabled: true
- insert:
    - id: side-panel
      name: 'dsh-side-panel'
`
    expect(entryIdsFromBundlePatch(yaml, 'dsh-side-panel')).toEqual(['side-panel'])
  })
})

describe('extraProfileBundles', () => {
  it('returns only non-official bundles', () => {
    const root = mkdtempSync(join(tmpdir(), 'localharness-bundles-'))
    writeFileSync(
      join(root, 'package.json'),
      `${JSON.stringify({
        dsh: {
          profile: {
            bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dshmarket', 'dsh-better-sidebar'],
          },
        },
      })}\n`,
    )
    expect(extraProfileBundles(root)).toEqual(['dshmarket', 'dsh-better-sidebar'])
  })
})

describe('resolvePluginEntryIds', () => {
  it('reads the bundle patch path from package.json', () => {
    const web = mkdtempSync(join(tmpdir(), 'localharness-ids-'))
    const pkg = join(web, 'node_modules', 'dsh-better-sidebar')
    mkdirSync(pkg, { recursive: true })
    writeFileSync(
      join(pkg, 'package.json'),
      `${JSON.stringify({ name: 'dsh-better-sidebar', dsh: { bundle: { patch: './cordis.patch.yml' } } })}\n`,
    )
    writeFileSync(
      join(pkg, 'cordis.patch.yml'),
      `- insert:\n    - id: better-sidebar\n      name: 'dsh-better-sidebar'\n`,
    )
    expect(resolvePluginEntryIds(web, 'dsh-better-sidebar')).toEqual(['better-sidebar'])
  })
})

describe('mergeDisablePatches', () => {
  it('replaces a comments-only empty array', () => {
    const content = [
      '# Your patch layer for this dsh profile, applied after every bundle layer:',
      '# a top-level YAML array of loader patch entries.',
      '[]',
      '',
    ].join('\n')
    expect(mergeDisablePatches(content, ['better-sidebar'])).toBe(
      [
        '# Your patch layer for this dsh profile, applied after every bundle layer:',
        '# a top-level YAML array of loader patch entries.',
        '# LocalHarness turned these plugins off: they failed to start with the new official engine.',
        '# Packages remain installed. After updating a plugin, remove its entry below to turn it back on, or uninstall it.',
        '- id: better-sidebar',
        '  disabled: true',
        '',
      ].join('\n'),
    )
  })

  it('appends to an existing patch list and skips ids that are already disabled', () => {
    const content = '- id: dsh-market\n  disabled: true\n'
    const once = mergeDisablePatches(content, ['better-sidebar'])
    expect(once).toContain('- id: dsh-market\n  disabled: true')
    expect(once).toContain('- id: better-sidebar\n  disabled: true')
    expect(mergeDisablePatches(once, ['better-sidebar'])).toBe(once)
  })
})

describe('applyLivePluginDisables', () => {
  it('writes disables then restores the previous patch file', () => {
    const home = mkdtempSync(join(tmpdir(), 'localharness-live-'))
    const web = join(home, 'profiles', 'web')
    mkdirSync(web, { recursive: true })
    const file = join(web, 'cordis.patch.yml')
    writeFileSync(file, '[]\n')
    const applied = applyLivePluginDisables(home, ['better-sidebar'])
    expect(readFileSync(file, 'utf8')).toContain('id: better-sidebar')
    expect(readFileSync(file, 'utf8')).toContain('disabled: true')
    applied.restore()
    expect(readFileSync(file, 'utf8')).toBe('[]\n')
    expect(existsSync(file)).toBe(true)
  })
})
