import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY || ""),
      'process.env.API_KEY1': JSON.stringify(env.API_KEY1 || ""),
      'process.env.API_KEY2': JSON.stringify(env.API_KEY2 || ""),
      'process.env.API_KEY3': JSON.stringify(env.API_KEY3 || ""),
      // Google Client ID Güncellendi
      'process.env.GOOGLE_CLIENT_ID': JSON.stringify(env.GOOGLE_CLIENT_ID || "758297956052-i36trssmqp1rv2d3f2oradjl0rmm77op.apps.googleusercontent.com")
    }
  }
})