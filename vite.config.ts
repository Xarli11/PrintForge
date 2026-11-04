/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ mode }) => ({
  // GitHub Pages sirve el proyecto en /<repo>/. Sobrescribible con VITE_BASE.
  base: process.env.VITE_BASE ?? (mode === 'production' ? '/PrintForge/' : '/'),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'supabase/tests/**/*.test.ts'],
    css: false,
  },
}))
