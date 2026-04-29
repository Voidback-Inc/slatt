const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname);

// In Expo Go (no EAS_BUILD env var), swap react-native-purchases for a stub
// so the app doesn't crash when the native module is unavailable.
if (!process.env.EAS_BUILD) {
  config.resolver.extraNodeModules = {
    ...config.resolver.extraNodeModules,
    'react-native-purchases': path.resolve(__dirname, 'lib/purchases-stub.js'),
  };
}

module.exports = withNativeWind(config, { input: './global.css' });
