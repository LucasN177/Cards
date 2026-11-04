import { createHashRouter, RouterProvider } from 'react-router'
import { routes } from './routes'
import { useApplyBarPosition, useApplyTheme } from './useTheme'

// Hash routing works on GitHub Pages and offline without server-side rewrites.
const router = createHashRouter(routes)

export function App() {
  useApplyTheme()
  useApplyBarPosition()
  return <RouterProvider router={router} />
}
