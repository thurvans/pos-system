import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const parseAllowedHosts = () => {
  const hosts = String(process.env.VITE_ALLOWED_HOSTS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return hosts.length > 0 ? hosts : true
}

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: parseAllowedHosts(),
    proxy: {
      '/api':     { target: 'http://localhost:3000', changeOrigin: false },
      '/uploads': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
})
