import { PwaUpdatePrompt } from './PwaUpdatePrompt'

export function App() {
  return (
    <>
      <main className="flex min-h-svh flex-col items-center justify-center gap-2 bg-background p-4 text-foreground">
        <h1 className="text-4xl font-bold tracking-tight">Cards</h1>
        <p className="text-muted-foreground">Classic card games. Smarter opponents. Endless fun.</p>
      </main>
      <PwaUpdatePrompt />
    </>
  )
}
