const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

// Lets Metro see src/shared in the parent (desktop) project — the pure,
// dependency-free types and queue logic from the Electron app are imported
// directly here rather than copy-pasted, so the two apps can't drift apart.
config.watchFolders = [workspaceRoot]
config.resolver.alias = {
  '@shared': path.resolve(workspaceRoot, 'src/shared')
}

module.exports = config
