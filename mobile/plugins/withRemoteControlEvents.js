const { withAppDelegate } = require('expo/config-plugins')
const { mergeContents } = require('expo/config-plugins').CodeGenerator

// expo-audio wires up MPRemoteCommandCenter targets (play/pause/skip/scrub)
// and sets MPNowPlayingInfoCenter.nowPlayingInfo, but never calls
// UIApplication.shared.beginReceivingRemoteControlEvents() — without that,
// iOS won't reliably show the lock-screen/Control Center/CarPlay Now
// Playing controls even though the info center and command targets are
// correctly configured. Background audio itself doesn't need this (that's
// UIBackgroundModes + the audio session category), only the remote-control
// UI does, which is why playback kept working while the lock screen stayed
// silent. Same anchor/pattern Expo's own official Google Maps plugin uses
// for AppDelegate insertion (@expo/config-plugins/build/ios/Maps.js).
const MATCH_INIT = /\bsuper\.application\(\w+?, didFinishLaunchingWithOptions: \w+?\)/g

function withRemoteControlEvents(config) {
  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== 'swift') {
      throw new Error(
        `withRemoteControlEvents expected a Swift AppDelegate but found: ${config.modResults.language}`
      )
    }
    const results = mergeContents({
      tag: 'empire-pod-remote-control-events',
      src: config.modResults.contents,
      newSrc: 'UIApplication.shared.beginReceivingRemoteControlEvents()',
      anchor: MATCH_INIT,
      offset: 0,
      comment: '//'
    })
    config.modResults.contents = results.contents
    return config
  })
}

module.exports = withRemoteControlEvents
