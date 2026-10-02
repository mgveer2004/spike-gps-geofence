const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite on web loads wa-sqlite.wasm; Metro must treat .wasm as an asset.
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

const SRC_ROOT = path.resolve(__dirname, 'src');
const ASSETS_ROOT = path.resolve(__dirname, 'assets');
const NODE_MODULES_PART = `${path.sep}node_modules${path.sep}`;

function toMetroRelative(fromDir, absoluteTarget) {
  let relative = path.relative(fromDir, absoluteTarget).split(path.sep).join('/');
  if (!relative.startsWith('.')) {
    relative = `./${relative}`;
  }
  return relative;
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origin = context.originModulePath;
  const fromNodeModules = typeof origin === 'string' && origin.includes(NODE_MODULES_PART);

  if (!fromNodeModules && moduleName.startsWith('@/')) {
    const rest = moduleName.slice(2);
    const originDir = path.dirname(origin);
    const absoluteTarget = rest.startsWith('assets/')
      ? path.join(ASSETS_ROOT, rest.slice('assets/'.length))
      : path.join(SRC_ROOT, rest);
    moduleName = toMetroRelative(originDir, absoluteTarget);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
