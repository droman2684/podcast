import { Lock, X } from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import Pill from '@renderer/components/ui/Pill'
import styles from './FeedsScreen.module.css'

function FeedsScreen(): React.JSX.Element {
  const privateFeeds = useAppStore((s) => s.privateFeeds)
  const showAddForm = useAppStore((s) => s.showAddForm)
  const toggleAddFeedForm = useAppStore((s) => s.toggleAddFeedForm)
  const feedUrl = useAppStore((s) => s.feedUrl)
  const feedUser = useAppStore((s) => s.feedUser)
  const feedPass = useAppStore((s) => s.feedPass)
  const setFeedField = useAppStore((s) => s.setFeedField)
  const addFeed = useAppStore((s) => s.addFeed)
  const removeFeed = useAppStore((s) => s.removeFeed)
  const addingFeed = useAppStore((s) => s.addingFeed)
  const addFeedError = useAppStore((s) => s.addFeedError)

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <div className={styles.title}>Private Feeds</div>
        <Pill variant={showAddForm ? 'secondary' : 'primary'} onClick={toggleAddFeedForm}>
          {showAddForm ? 'Cancel' : '+ Add Private Feed'}
        </Pill>
      </div>

      {showAddForm && (
        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Feed URL</label>
            <input
              className={styles.input}
              placeholder="https://feeds.example.com/private/rss"
              value={feedUrl}
              onChange={(e) => setFeedField('feedUrl', e.target.value)}
            />
          </div>
          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label}>Username</label>
              <input
                className={styles.input}
                value={feedUser}
                onChange={(e) => setFeedField('feedUser', e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Password</label>
              <input
                className={styles.input}
                type="password"
                value={feedPass}
                onChange={(e) => setFeedField('feedPass', e.target.value)}
              />
            </div>
          </div>
          {addFeedError && (
            <div style={{ fontSize: 12, color: 'var(--color-danger)' }}>{addFeedError}</div>
          )}
          <div className={styles.actions}>
            <Pill variant="primary" onClick={() => !addingFeed && addFeed()}>
              {addingFeed ? 'Adding…' : 'Add Feed'}
            </Pill>
            <Pill variant="secondary" onClick={toggleAddFeedForm}>
              Cancel
            </Pill>
          </div>
        </div>
      )}

      {privateFeeds.length > 0 ? (
        <div className={styles.list}>
          {privateFeeds.map((f) => (
            <div className={styles.card} key={f.id}>
              <div className={styles.lockIcon}>
                <Lock size={16} color="#6e6e73" />
              </div>
              <div className={styles.meta}>
                <div className={styles.name}>{f.name}</div>
                <div className={styles.sub}>
                  {f.url} · {f.user}
                </div>
              </div>
              <div className={styles.removeBtn} onClick={() => removeFeed(f.id)}>
                <X size={13} color="var(--color-danger)" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <Lock size={22} color="#aeaeb2" />
          </div>
          <div className={styles.emptyTitle}>No private feeds yet</div>
          <div className={styles.emptyHelper}>
            Add an authenticated RSS feed to access subscriber-only or private podcast content.
          </div>
        </div>
      )}
    </div>
  )
}

export default FeedsScreen
