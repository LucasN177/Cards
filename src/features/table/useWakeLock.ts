import { useEffect } from 'react'

/** Keeps the screen on while a game is open (mobile). Silently does nothing where unsupported. */
export function useWakeLock() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    const lock: { sentinel: WakeLockSentinel | null; disposed: boolean } = {
      sentinel: null,
      disposed: false,
    }

    const request = () => {
      if (document.visibilityState !== 'visible') return
      navigator.wakeLock.request('screen').then(
        (sentinel) => {
          if (lock.disposed) void sentinel.release()
          else lock.sentinel = sentinel
        },
        () => {
          // Denied (e.g. battery saver) – not critical.
        },
      )
    }

    // The lock is released automatically when the page is hidden; take it again on return.
    request()
    document.addEventListener('visibilitychange', request)
    return () => {
      lock.disposed = true
      document.removeEventListener('visibilitychange', request)
      void lock.sentinel?.release()
    }
  }, [])
}
