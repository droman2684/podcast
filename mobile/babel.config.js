module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    // Required by react-native-reanimated v4 (used for drag-to-reorder in
    // Queue/Downloads) — must be listed last per its docs.
    plugins: ['react-native-worklets/plugin']
  }
}
