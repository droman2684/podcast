interface ToggleSwitchProps {
  on: boolean
  onToggle: () => void
}

function ToggleSwitch({ on, onToggle }: ToggleSwitchProps): React.JSX.Element {
  return (
    <div
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      style={{
        width: 44,
        height: 26,
        borderRadius: 13,
        background: on ? 'var(--color-accent)' : '#d1d1d6',
        cursor: 'pointer',
        transition: 'background 0.18s ease',
        flexShrink: 0
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 4px rgba(0,0,0,.22)',
          marginTop: 2,
          marginLeft: on ? 18 : 2,
          transition: 'margin-left 0.18s ease'
        }}
      />
    </div>
  )
}

export default ToggleSwitch
