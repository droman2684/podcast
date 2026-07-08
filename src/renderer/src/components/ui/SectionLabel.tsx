import type { ReactNode } from 'react'

interface SectionLabelProps {
  children: ReactNode
}

function SectionLabel({ children }: SectionLabelProps): React.JSX.Element {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--color-text-placeholder)',
        textTransform: 'uppercase',
        letterSpacing: '0.7px'
      }}
    >
      {children}
    </div>
  )
}

export default SectionLabel
