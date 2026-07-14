import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export function createViteConfig(mode: string) {
  return {
    plugins: [
      tailwindcss(),
      vue(),
      ...(mode === 'development' ? [vueDevTools()] : []),
    ],
    build: {
      sourcemap: false,
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
}

export default defineConfig(({ mode }) => createViteConfig(mode))
