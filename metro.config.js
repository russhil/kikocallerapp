const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const config = {
  watchFolders: [],
  watcher: {
    healthCheck: {
      enabled: false,
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
