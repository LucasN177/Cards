interface ImportMetaEnv {
  /** Set to "true" to include engine test games in a production build (used by e2e tests). */
  readonly VITE_ENABLE_TEST_GAMES?: string
}

/** App version from package.json, inlined at build time. */
declare const __APP_VERSION__: string
