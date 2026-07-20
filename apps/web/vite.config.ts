import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    // Lets the browser reach the API through the same forwarded port as the
    // web app itself -- useful when only one port is exposed out of a
    // remote/devcontainer session (e.g. localhost:3000 isn't forwarded).
    proxy: {
      '/auth': 'http://localhost:3000',
      '/invitations': 'http://localhost:3000',
      '/events': 'http://localhost:3000',
      '/tenants': 'http://localhost:3000',
    },
  },
})
