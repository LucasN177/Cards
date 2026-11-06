import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'

/** Asks before abandoning a running game – it is neither saved nor counted. */
export function AbortDialog({ onAbort, onCancel }: { onAbort: () => void; onCancel: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  // Focus the safe choice; Escape keeps playing.
  useEffect(() => cancelRef.current?.focus(), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="abort-title"
        aria-describedby="abort-text"
        className="w-full max-w-sm space-y-4 rounded-2xl bg-card p-6 text-card-foreground shadow-xl"
      >
        <h2 id="abort-title" className="text-xl font-bold">
          Partie abbrechen?
        </h2>
        <p id="abort-text" className="text-sm text-muted-foreground">
          Die Partie wird beendet, nicht gespeichert und nicht in der Statistik gezählt.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button variant="destructive" size="lg" className="sm:flex-1" onClick={onAbort}>
            Abbrechen
          </Button>
          <Button
            ref={cancelRef}
            variant="outline"
            size="lg"
            className="sm:flex-1"
            onClick={onCancel}
          >
            Weiterspielen
          </Button>
        </div>
      </div>
    </div>
  )
}
