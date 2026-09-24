const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname, {
  isRunningInExpoGo: true,
});

// Ensure react-native-web is resolved for web platform
config.resolver.resolverMainFields = ['react-native', 'browser', 'node'];
config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs'];

module.exports = config;
