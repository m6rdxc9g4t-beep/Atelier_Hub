// Vite : interface du Hub. En développement, /api est relayé vers le backend (127.0.0.1:3700, ou ATELIER_API_URL).
// Ports (suite Atelier) : interface 5179, aperçu 4179, API + interface compilée 3700. strictPort : échec explicite en cas de conflit.
// Mode « demo » (npm run build:demo) : l'interface lit src/demo/snapshot.json au lieu de l'API (aperçu sans la suite).
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiTarget = process.env.ATELIER_API_URL ?? 'http://127.0.0.1:3700'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // L'aperçu se publie comme un fichier autonome : adresses relatives.
  base: mode === 'demo' ? './' : '/',
  server: {
    host: '127.0.0.1',
    port: 5179,
    strictPort: true,
    proxy: { '/api': { target: apiTarget, changeOrigin: false } },
  },
  preview: {
    host: '127.0.0.1',
    port: 4179,
    strictPort: true,
    proxy: { '/api': { target: apiTarget, changeOrigin: false } },
  },
  build: {
    sourcemap: false,
    // Aperçu publié comme artifact : les polices y sont acceptées seulement en data:.
    ...(mode === 'demo' && { assetsInlineLimit: 256 * 1024 }),
  },
}))
