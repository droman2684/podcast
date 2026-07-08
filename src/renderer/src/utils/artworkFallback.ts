const PALETTE = [
  'linear-gradient(135deg,#1e4d91,#0d2b5a)',
  'linear-gradient(135deg,#2a2a3e,#12121e)',
  'linear-gradient(135deg,#8B1A1A,#5a0f0f)',
  'linear-gradient(135deg,#0D1B2A,#050d14)',
  'linear-gradient(135deg,#2D4A3E,#1a2e26)',
  'linear-gradient(135deg,#3D1A00,#241000)',
  'linear-gradient(135deg,#1A3A5C,#0f2238)',
  'linear-gradient(135deg,#1F3329,#0f1f18)',
  'linear-gradient(135deg,#3A2080,#1E1040)',
  'linear-gradient(135deg,#6B1F1F,#3D0E0E)'
]

function hashString(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export function deriveFallback(name: string): { bg: string; init: string } {
  const hash = hashString(name || '?')
  return {
    bg: PALETTE[hash % PALETTE.length],
    init: initialsFor(name)
  }
}
