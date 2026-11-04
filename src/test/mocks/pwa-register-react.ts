// Test stand-in for `virtual:pwa-register/react`, which only exists inside a Vite build.
import { useState } from 'react'

export function useRegisterSW() {
  return {
    offlineReady: useState(false),
    needRefresh: useState(false),
    updateServiceWorker: async () => {},
  }
}
