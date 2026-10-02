const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname, {
  isRunningInExpoGo: true,
});

// Ensure react-native-web is resolved for web platform
config.resolver.resolverMainFields = ['react-native', 'browser', 'node'];
config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs', 'wasm'];
config.resolver.assetExts = [...config.resolver.assetExts, 'wasm'];

// Enable COOP/COEP headers for SharedArrayBuffer support (required by expo-sqlite web)
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      return middleware(req, res, next);
    };
  },
};

module.exports = config;