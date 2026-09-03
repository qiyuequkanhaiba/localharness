import { gt, valid } from 'semver'
import { GITHUB_REPO, GITHUB_RELEASES_URL } from '../shared/constants'

export type ShellUpdateDecision =
  | { kind: 'current'; current: string; latest?: string }
  | { kind: 'available'; current: string; latest: string; url: string }

interface GithubRelease {
  tag_name?: string
  html_url?: string
  draft?: boolean
  prerelease?: boolean
}

export function releasePageUrl(tag?: string): string {
  if (tag) return `${GITHUB_RELEASES_URL}/tag/${tag.replace(/^v/, '')}`
  return `${GITHUB_RELEASES_URL}/latest`
}

export async function inspectShellUpdates(
  currentVersion: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ShellUpdateDecision> {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'LocalHarness',
    },
  })
  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} for the latest LocalHarness release`)
  }
  const body = (await response.json()) as GithubRelease
  if (body.draft || body.prerelease) {
    return { kind: 'current', current: currentVersion }
  }
  const latest = (body.tag_name ?? '').replace(/^v/, '')
  if (!valid(latest)) {
    return { kind: 'current', current: currentVersion }
  }
  if (!valid(currentVersion) || !gt(latest, currentVersion)) {
    return { kind: 'current', current: currentVersion, latest }
  }
  return {
    kind: 'available',
    current: currentVersion,
    latest,
    url: body.html_url && body.html_url.length > 0 ? body.html_url : releasePageUrl(latest),
  }
}
