import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { unlockAudio } from '@/features/sound/sound'
import { registerGames } from '@/games'
import '@/styles/index.css'

registerGames()
// Browsers only allow audio after a user gesture; the first tap unlocks it for later AI moves.
document.addEventListener('pointerdown', unlockAudio, { once: true })

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
