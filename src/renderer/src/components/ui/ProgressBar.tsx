interface ProgressBarProps {
  pct: number // 0-100
  height?: number
}

function ProgressBar({ pct, height = 3 }: ProgressBarProps): React.JSX.Element {
  return (
    <div style={{ width: '100%', height, background: 'var(--color-text-disabled)', borderRadius: height }}>
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          background: 'var(--color-accent)',
          borderRadius: height
        }}
      />
    </div>
  )
}

export default ProgressBar
