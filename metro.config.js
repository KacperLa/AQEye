const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Ensure web platform support
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

module.exports = config;
