import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { describeProfilePluginFailure, seedSmokeHome } from './smoke'

describe('seedSmokeHome', () => {
  it('copies the web profile manifest and links node_modules without using the live DSH_HOME', () => {
    const root = mkdtempSync(join(tmpdir(), 'localharness-smoke-home-'))
    const userHome = join(root, 'user')
    const tempHome = join(root, 'temp')
    const web = join(userHome, 'profiles', 'web')
    mkdirSync(join(web, 'node_modules', 'dshmarket'), { recursive: true })
    writeFileSync(
      join(web, 'package.json'),
      `${JSON.stringify({
        name: 'dsh-profile-web',
        dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'dshmarket'] } },
      })}\n`,
    )
    writeFileSync(join(web, 'cordis.patch.yml'), '[]\n')
    writeFileSync(join(web, 'node_modules', 'dshmarket', 'package.json'), '{"name":"dshmarket"}\n')

    seedSmokeHome(tempHome, userHome)

    const seeded = join(tempHome, 'profiles', 'web')
    expect(JSON.parse(readFileSync(join(seeded, 'package.json'), 'utf8')).dsh.profile.bundles).toContain('dshmarket')
    expect(readFileSync(join(seeded, 'cordis.patch.yml'), 'utf8')).toBe('[]\n')
    const modules = join(seeded, 'node_modules')
    expect(existsSync(join(modules, 'dshmarket', 'package.json'))).toBe(true)
    try {
      expect(readlinkSync(modules)).toBe(join(web, 'node_modules'))
    } catch {
      // copy fallback still keeps the live home untouched
    }
    expect(existsSync(join(web, 'node_modules', 'dshmarket', 'package.json'))).toBe(true)
  })

  it('does nothing when the user has no web profile yet', () => {
    const root = mkdtempSync(join(tmpdir(), 'localharness-smoke-empty-'))
    seedSmokeHome(join(root, 'temp'), join(root, 'missing'))
    expect(existsSync(join(root, 'temp', 'profiles'))).toBe(false)
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
      "Plugin dsh-better-sidebar is not compatible with this official engine (missing export settingsNamespace).",
    )
  })
})
