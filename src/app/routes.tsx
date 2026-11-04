import type { RouteObject } from 'react-router'
import { GameCatalogPage } from '@/features/catalog/GameCatalogPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { GameSetupPage } from '@/features/setup/GameSetupPage'
import { TablePage } from '@/features/table/TablePage'
import { ErrorPage, NotFound } from './ErrorPage'
import { Layout } from './Layout'

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <GameCatalogPage /> },
      { path: 'games/:gameId', element: <GameSetupPage /> },
      { path: 'play/:gameId', element: <TablePage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]
