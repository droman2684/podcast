import type { ReactNode, MouseEventHandler } from 'react'
import styles from './Pill.module.css'

interface PillProps {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  onClick?: MouseEventHandler<HTMLButtonElement>
}

function Pill({ children, variant = 'primary', onClick }: PillProps): React.JSX.Element {
  return (
    <button type="button" className={`${styles.pill} ${styles[variant]}`} onClick={onClick}>
      {children}
    </button>
  )
}

export default Pill
