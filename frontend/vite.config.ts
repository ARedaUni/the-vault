import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/media': { target: 'https://d1i2liswslkj07.cloudfront.net', changeOrigin: true },
      '/api': {
        target: 'https://iv2saq46m9.execute-api.eu-west-2.amazonaws.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
