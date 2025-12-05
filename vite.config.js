import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 重要：如果您 GitHub Repository 叫 "remote-camera"，這裡就要填 "/remote-camera/"
  base: '/remote-camera/', 
})