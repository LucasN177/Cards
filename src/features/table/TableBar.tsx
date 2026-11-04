import { ArrowLeft, BookOpen, RotateCcw, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TableBarProps {
  readonly title: string
  readonly canUndo: boolean
  readonly onExit: () => void
  readonly onUndo: () => void
  readonly onRestart: () => void
  readonly onRules: () => void
}

/** Compact top bar with 44px touch targets; respects the notch/status bar. */
export function TableBar({ title, canUndo, onExit, onUndo, onRestart, onRules }: TableBarProps) {
  const iconButton = 'size-11 text-white hover:bg-white/15 hover:text-white'
  return (
    <header className="flex items-center gap-1 bg-black/20 pt-safe px-safe">
      <Button
        variant="ghost"
        size="icon"
        className={iconButton}
        onClick={onExit}
        aria-label="Zur Spielauswahl"
      >
        <ArrowLeft className="size-5" />
      </Button>
      <h1 className="flex-1 truncate text-center text-base font-semibold text-white">{title}</h1>
      <Button
        variant="ghost"
        size="icon"
        className={iconButton}
        onClick={onRules}
        aria-label="Spielregeln"
      >
        <BookOpen className="size-5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={iconButton}
        onClick={onUndo}
        disabled={!canUndo}
        aria-label="Zug zurücknehmen"
      >
        <Undo2 className="size-5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={iconButton}
        onClick={onRestart}
        aria-label="Neues Spiel"
      >
        <RotateCcw className="size-5" />
      </Button>
    </header>
  )
}
