import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

const OFFLINE_NOTE_MS = 4000

/**
 * Registers the service worker and shows a small banner when the app is ready for
 * offline use or when a new version is available.
 */
export function PwaUpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  // The "offline ready" note is informational only; hide it on its own so it never blocks
  // buttons at the bottom of small (landscape) phone screens. Update prompts stay until answered.
  useEffect(() => {
    if (!offlineReady || needRefresh) return
    const timer = setTimeout(() => setOfflineReady(false), OFFLINE_NOTE_MS)
    return () => clearTimeout(timer)
  }, [offlineReady, needRefresh, setOfflineReady])

  if (!offlineReady && !needRefresh) return null

  const close = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  return (
    <div
      role="status"
      className="app-toast fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-lg border bg-card p-4 text-sm text-card-foreground shadow-lg"
    >
      <p className="flex-1">
        {needRefresh
          ? 'Eine neue Version ist verfügbar.'
          : 'Cards ist jetzt auch offline verfügbar.'}
      </p>
      {needRefresh && (
        <button
          type="button"
          onClick={() => void updateServiceWorker(true)}
          className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground"
        >
          Aktualisieren
        </button>
      )}
      <button
        type="button"
        onClick={close}
        className="rounded-md px-3 py-1.5 font-medium hover:bg-accent"
      >
        Schließen
      </button>
    </div>
  )
}
