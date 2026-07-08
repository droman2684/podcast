import type { LucideIcon } from 'lucide-react'
import styles from './SidebarNavItem.module.css'

interface SidebarNavItemProps {
  icon: LucideIcon
  label: string
  active: boolean
  badge?: number
  onClick: () => void
}

function SidebarNavItem({
  icon: Icon,
  label,
  active,
  badge,
  onClick
}: SidebarNavItemProps): React.JSX.Element {
  const color = active ? 'var(--color-accent)' : 'var(--color-nav-inactive)'

  return (
    <div
      className={styles.item}
      style={{ background: active ? 'var(--color-accent-bg)' : 'transparent' }}
      onClick={onClick}
    >
      <span className={styles.icon}>
        <Icon size={15} color={color} strokeWidth={1.6} />
      </span>
      <span className={styles.label} style={{ color }}>
        {label}
      </span>
      {typeof badge === 'number' && badge > 0 && <span className={styles.badge}>{badge}</span>}
    </div>
  )
}

export default SidebarNavItem
