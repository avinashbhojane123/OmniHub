const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);
const defaultBlockList = Array.isArray(defaultConfig.resolver.blockList)
  ? defaultConfig.resolver.blockList
  : defaultConfig.resolver.blockList
  ? [defaultConfig.resolver.blockList]
  : [];

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // Block Metro from crawling backend, android build artifacts, and OTA release bundles
    blockList: [
      ...defaultBlockList,
      /.*[/\\]backend[/\\].*/,
      /.*[/\\]ota-release[/\\].*/,
      /.*[/\\]android[/\\](app[/\\])?build[/\\].*/,
      /.*[/\\]android[/\\]app[/\\]src[/\\]main[/\\]assets[/\\]index\.android\.bundle.*/,
    ],
    // Extra alias resolver fallback for @/* -> ./src/*
    extraNodeModules: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);
