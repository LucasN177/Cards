/** Engine test games (e.g. High Card) are available in dev mode and in the e2e build. */
export const TEST_GAMES_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_GAMES === 'true'
