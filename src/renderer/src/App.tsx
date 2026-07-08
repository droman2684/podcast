import { useEffect, useState } from 'react'
import AppShell from '@renderer/components/layout/AppShell'
import { hydrateApp } from '@renderer/state/hydrate'

function App(): React.JSX.Element {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    hydrateApp()
      .catch((err) => console.error('Failed to hydrate app state:', err))
      .finally(() => setReady(true))
  }, [])

  if (!ready) {
    return (
      <div
        style={{
          width: '100%',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-bg)',
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--color-text-muted)'
        }}
      >
        Loading Empire Pod…
      </div>
    )
  }

  return <AppShell />
}

export default App
