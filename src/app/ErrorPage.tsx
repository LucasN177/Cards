import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { Button } from '@/components/ui/button'

export function NotFound({ message = 'Diese Seite gibt es nicht.' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Nicht gefunden</h1>
      <p className="text-muted-foreground">{message}</p>
      <Button asChild>
        <Link to="/">Zur Spielauswahl</Link>
      </Button>
    </div>
  )
}

export function ErrorPage() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-bold">Da ist etwas schiefgelaufen</h1>
      <p className="max-w-md text-muted-foreground">
        {error instanceof Error ? error.message : 'Unbekannter Fehler'}
      </p>
      <Button onClick={() => window.location.reload()}>Neu laden</Button>
    </div>
  )
}
