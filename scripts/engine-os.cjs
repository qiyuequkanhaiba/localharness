function engineFolder(electronPlatformName, arch) {
  const os =
    electronPlatformName === 'darwin' ? 'mac' : electronPlatformName === 'win32' ? 'win' : 'linux'
  const cpu = arch === 3 || arch === 'arm64' ? 'arm64' : 'x64'
  return `${os}-${cpu}`
}

module.exports = { engineFolder }
