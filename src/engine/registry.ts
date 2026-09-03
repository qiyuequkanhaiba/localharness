import { gt, rcompare, valid } from 'semver'
import { NPM_REGISTRY, OFFICIAL_PACKAGE } from '../shared/constants'

export type HttpFetch = (url: string, init?: RequestInit) => Promise<Response>

export interface NpmPackageInfo {
  name: string
  versions: string[]
  latest?: string
}

interface NpmRegistryResponse {
  versions?: Record<string, unknown>
  'dist-tags'?: Record<string, string>
}

export async function fetchOfficialVersions(
  registry = NPM_REGISTRY,
  packageName = OFFICIAL_PACKAGE,
  fetchImpl: HttpFetch = fetch,
): Promise<NpmPackageInfo> {
  const url = `${registry.replace(/\/$/, '')}/${packageName.replace('/', '%2f')}`
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`npm registry returned ${response.status} for ${packageName}`)
  }
  const body = (await response.json()) as NpmRegistryResponse
  const versions = Object.keys(body.versions ?? {}).filter((version) => valid(version))
  versions.sort((a, b) => rcompare(a, b))
  return {
    name: packageName,
    versions,
    latest: body['dist-tags']?.latest ?? versions[0],
  }
}

export function versionsNewerThan(current: string, published: string[]): string[] {
  return published.filter((version) => valid(version) && gt(version, current))
}

export function newestPublished(published: string[]): string | undefined {
  const sorted = [...published].filter((version) => valid(version)).sort((a, b) => rcompare(a, b))
  return sorted[0]
}
