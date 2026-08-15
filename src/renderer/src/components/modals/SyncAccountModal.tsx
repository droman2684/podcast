import { useState } from 'react'
import { X, Cloud, Check, RefreshCw } from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import Pill from '@renderer/components/ui/Pill'
import styles from './SyncAccountModal.module.css'

function formatLastSynced(ms: number | null): string {
  if (ms === null) return 'Never'
  const diffSec = Math.round((Date.now() - ms) / 1000)
  if (diffSec < 60) return 'Just now'
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`
  return `${Math.round(diffSec / 3600)}h ago`
}

function SyncAccountModal(): React.JSX.Element | null {
  const showAccountModal = useAppStore((s) => s.showAccountModal)
  const closeAccountModal = useAppStore((s) => s.closeAccountModal)
  const authStep = useAppStore((s) => s.authStep)
  const authEmail = useAppStore((s) => s.authEmail)
  const authError = useAppStore((s) => s.authError)
  const authBusy = useAppStore((s) => s.authBusy)
  const signUp = useAppStore((s) => s.signUp)
  const signIn = useAppStore((s) => s.signIn)
  const signOutOfSync = useAppStore((s) => s.signOutOfSync)
  const syncNow = useAppStore((s) => s.syncNow)
  const syncPhase = useAppStore((s) => s.syncPhase)
  const syncLastSyncedAt = useAppStore((s) => s.syncLastSyncedAt)

  const [emailInput, setEmailInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')

  if (!showAccountModal) return null

  const handleClose = (): void => {
    setEmailInput('')
    setPasswordInput('')
    closeAccountModal()
  }

  return (
    <div className={styles.backdrop} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.iconWrap}>
            <Cloud size={18} color="var(--color-accent)" />
          </div>
          <div className={styles.headerMeta}>
            <div className={styles.title}>Sync</div>
            <div className={styles.modalLabel}>Keep your library in sync across devices</div>
          </div>
          <div className={styles.closeBtn} onClick={handleClose}>
            <X size={14} color="#6e6e73" />
          </div>
        </div>

        <div className={styles.section}>
          {authStep === 'signedOut' && (
            <>
              <div className={styles.field}>
                <label className={styles.label}>Email</label>
                <input
                  className={styles.input}
                  type="email"
                  placeholder="you@example.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Password</label>
                <input
                  className={styles.input}
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                />
              </div>
              {authError && <div className={styles.error}>{authError}</div>}
              <div className={styles.actions}>
                <Pill
                  variant="primary"
                  onClick={() =>
                    emailInput.trim() &&
                    passwordInput &&
                    !authBusy &&
                    signIn(emailInput.trim(), passwordInput)
                  }
                >
                  {authBusy ? 'Signing in…' : 'Sign in'}
                </Pill>
                <Pill
                  variant="secondary"
                  onClick={() =>
                    emailInput.trim() &&
                    passwordInput &&
                    !authBusy &&
                    signUp(emailInput.trim(), passwordInput)
                  }
                >
                  {authBusy ? 'Creating…' : 'Create account'}
                </Pill>
              </div>
              <div className={styles.helper}>
                First device: use "Create account". Every other device: "Sign in" with the same
                email and password.
              </div>
            </>
          )}

          {authStep === 'signedIn' && (
            <>
              <div className={styles.settingRow}>
                <span className={styles.settingLabel}>Signed in as</span>
                <span className={styles.settingValue}>{authEmail}</span>
              </div>
              <div className={styles.settingRow}>
                <span className={styles.settingLabel}>Last synced</span>
                <span className={styles.settingValue}>{formatLastSynced(syncLastSyncedAt)}</span>
              </div>
              <div className={styles.actions}>
                <Pill variant="primary" onClick={() => syncPhase !== 'syncing' && syncNow()}>
                  {syncPhase === 'syncing' ? (
                    <RefreshCw size={13} className={styles.spin} />
                  ) : (
                    <Check size={13} />
                  )}
                  {syncPhase === 'syncing' ? 'Syncing…' : 'Sync now'}
                </Pill>
                <Pill variant="secondary" onClick={signOutOfSync}>
                  Sign out
                </Pill>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default SyncAccountModal
