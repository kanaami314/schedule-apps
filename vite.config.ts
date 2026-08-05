/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages (project page) serves from /schedule-apps/, so the base path
// must match the repo name in production builds.
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/schedule-apps/' : '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'くるリズム',
        short_name: 'くるリズム',
        description: '暮らしに合わせる自動スケジューラ',
        start_url: '.',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        // TODO: add real pwa-192x192.png / pwa-512x512.png under public/ and list them here.
        icons: [],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
