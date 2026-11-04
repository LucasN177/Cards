import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Generates PWA icons from public/favicon.svg: `npm run generate:icons`
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#14532d' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#14532d' } },
  },
  images: ['public/favicon.svg'],
})
