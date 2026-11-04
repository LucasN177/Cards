import type { RouteObject } from 'react-router'
import { GameCatalogPage } from '@/features/catalog/GameCatalogPage'
import { GameSetupPage } from '@/features/setup/GameSetupPage'
import { ErrorPage, NotFound } from './ErrorPage'
import { Layout } from './Layout'

// Heavier screens (table with animations, settings with form controls) load on demand to keep
// the first load small on phones.
export const routes: RouteObject[] = [
  // The table is full-screen and has its own compact bar instead of the app header.
  {
    path: 'play/:gameId',
    lazy: async () => ({ Component: (await import('@/features/table/TablePage')).TablePage }),
    errorElement: <ErrorPage />,
  },
  {
    element: <Layout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <GameCatalogPage /> },
      { path: 'games/:gameId', element: <GameSetupPage /> },
      {
        path: 'games/:gameId/rules',
        lazy: async () => ({ Component: (await import('@/features/rules/RulesPage')).RulesPage }),
      },
      {
        path: 'settings',
        lazy: async () => ({
          Component: (await import('@/features/settings/SettingsPage')).SettingsPage,
        }),
      },
      ...(import.meta.env.DEV
        ? [
            {
              path: 'dev/cards',
              lazy: async () => ({
                Component: (await import('@/features/cards/CardGallery')).CardGallery,
              }),
            },
          ]
        : []),
      { path: '*', element: <NotFound /> },
    ],
  },
]
