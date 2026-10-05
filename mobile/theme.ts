import { Appearance, DynamicColorIOS, Platform } from 'react-native'

// Each token carries a light and a dark value. On iOS they're DynamicColorIOS
// values, so the module-level StyleSheets throughout the app switch live when
// the system appearance changes, with no re-render or restart needed. Other
// platforms have no dynamic color, so they pick whichever scheme was active at
// launch.
const launchScheme = Appearance.getColorScheme()

function dyn(light: string, dark: string): string {
  if (Platform.OS === 'ios') {
    // Typed as string so the tokens drop into every existing `color: string`
    // prop; RN and react-native-svg both process these via processColor.
    return DynamicColorIOS({ light, dark }) as unknown as string
  }
  return launchScheme === 'dark' ? dark : light
}

// Light values mirror the desktop app's design tokens exactly
// (src/renderer/src/styles/tokens.css) so the two apps read as one product.
// Dark values follow iOS's own dark system palette.
export const colors = {
  bg: dyn('#eef0f4', '#000000'),
  surface: dyn('#ffffff', '#1c1c1e'),
  surfaceRaised: dyn('#f9f9fb', '#2c2c2e'),
  border: dyn('rgba(0,0,0,0.07)', 'rgba(255,255,255,0.08)'),
  borderStrong: dyn('rgba(0,0,0,0.1)', 'rgba(255,255,255,0.14)'),
  textPrimary: dyn('#1c1c1e', '#f2f2f7'),
  textSecondary: dyn('#48484a', '#d1d1d6'),
  textMuted: dyn('#8e8e93', '#8e8e93'),
  textPlaceholder: dyn('#aeaeb2', '#636366'),
  textDisabled: dyn('#c7c7cc', '#48484a'),
  accent: '#ff5910',
  accentBg: dyn('rgba(255,89,16,0.1)', 'rgba(255,89,16,0.2)'),
  brand: '#002d72',
  brandBg: dyn('rgba(0,45,114,0.1)', 'rgba(90,140,230,0.2)'),
  danger: dyn('#ff3b30', '#ff453a'),
  dangerBg: dyn('rgba(255,59,48,0.12)', 'rgba(255,69,58,0.2)'),
  warning: dyn('#d97706', '#f59e0b'),
  navInactive: dyn('#6e6e73', '#8e8e93'),
  // Neutral fills for segmented controls, chips and progress tracks.
  fill: dyn('#e8e8ed', '#2c2c2e'),
  fillSubtle: dyn('#f0f0f5', '#1c1c1e'),
  track: dyn('#e0e0e6', '#3a3a3c'),
  // The selected segment of a segmented control.
  segmentActive: dyn('#ffffff', '#636366')
}

export const radii = {
  card: 12,
  item: 10,
  artworkSm: 9,
  pill: 20,
  badge: 10,
  input: 10,
  modal: 18
}

export const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.06,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 1 },
  elevation: 2
}
