export const PRODUCT_NAME = 'LocalHarness'
export const APP_ID = 'com.localharness.app'

/** Official npm package that owns `dsh web`. */
export const OFFICIAL_PACKAGE = '@deepseek-ai/dsh'

/**
 * Engine version shipped inside the installer.
 * In-app updates may move past this; they never change this constant.
 */
export const PINNED_ENGINE_VERSION = '0.1.0-rc.6'

/** Node runtime bundled beside the official engine. dsh requires ^22.19 || >=24. */
export const PINNED_NODE_VERSION = '22.23.2'

export const NPM_REGISTRY = 'https://registry.npmjs.org'
export const NODE_DIST_BASE = 'https://nodejs.org/dist'

/** LocalHarness has verified these official engine versions against this shell. */
export const VERIFIED_ENGINE_VERSIONS = ['0.1.0-rc.6'] as const

export const OFFICIAL_REPO_URL = 'https://github.com/deepseek-ai/deepseek-harness'
/** Official `dsh web:` line. Newer engines append `/?token=…` for the browser session. */
export const READY_URL_PATTERN =
  /dsh web:\s*(https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+(?:\/[^\s]*)?)/i

export const ENGINE_START_TIMEOUT_MS = 90_000
export const ENGINE_STOP_TIMEOUT_MS = 6_000
export const ENGINE_SMOKE_TIMEOUT_MS = 60_000
