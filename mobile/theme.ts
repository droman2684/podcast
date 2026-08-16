// Mirrors the desktop app's design tokens exactly
// (src/renderer/src/styles/tokens.css) so the two apps read as one product.
export const colors = {
  bg: '#eef0f4',
  surface: '#ffffff',
  surfaceRaised: '#f9f9fb',
  border: 'rgba(0,0,0,0.07)',
  borderStrong: 'rgba(0,0,0,0.1)',
  textPrimary: '#1c1c1e',
  textSecondary: '#48484a',
  textMuted: '#8e8e93',
  textPlaceholder: '#aeaeb2',
  textDisabled: '#c7c7cc',
  accent: '#ff5910',
  accentBg: 'rgba(255,89,16,0.1)',
  brand: '#002d72',
  brandBg: 'rgba(0,45,114,0.1)',
  danger: '#ff3b30',
  dangerBg: 'rgba(255,59,48,0.12)',
  warning: '#d97706',
  navInactive: '#6e6e73'
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
