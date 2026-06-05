// Standard Expo Metro config — extends the Expo defaults.
// Satisfies `expo doctor` and is the recommended baseline.
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = config;
