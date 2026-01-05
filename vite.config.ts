import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      // Fallback to empty string to prevent build crashes if key is missing
      'process.env.API_KEY': JSON.stringify(env.API_KEY || ""),
      'process.env.API_KEY1': JSON.stringify(env.API_KEY1 || ""),
      'process.env.API_KEY2': JSON.stringify(env.API_KEY2 || ""),
      'process.env.API_KEY3': JSON.stringify(env.API_KEY3 || "")
    }
  }
})