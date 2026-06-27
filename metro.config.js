const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);

// Keep Metro from crawling the backend package and its node_modules tree.
// The mobile app does not import code from backend/, so this reduces file watchers
// and avoids ENOSPC on Linux.
config.resolver.blockList = [
  /.*\/backend\/node_modules\/.*/,
  /.*\/backend\/dist\/.*/,
  /.*\/backend\/build\/.*/,
];

module.exports = config;
