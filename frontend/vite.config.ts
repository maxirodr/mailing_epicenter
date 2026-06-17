import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\\/]node_modules[\\/](react|react-dom|react-router)[\\/]/.test(id))
            return 'vendor-react'
          if (id.includes('@tanstack/react-query')) return 'vendor-query'
          if (id.includes('@tiptap/')) return 'vendor-tiptap'
          if (/[\\/]node_modules[\\/](pusher-js|laravel-echo)[\\/]/.test(id))
            return 'vendor-realtime'
        },
      },
    },
  },
})
