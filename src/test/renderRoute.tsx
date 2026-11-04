import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { routes } from '@/app/routes'
import { registerGames } from '@/games'

/** Renders the app's routes at `path` and returns the router for location assertions. */
export function renderRoute(path: string) {
  registerGames()
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const user = userEvent.setup()
  return { router, user, ...render(<RouterProvider router={router} />) }
}
