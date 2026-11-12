import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
export default defineConfig(({ mode }) => {
  const env = process.env.VITE_CLOUDBASE_ENV || loadEnv(mode, fileURLToPath(new URL('.', import.meta.url))).VITE_CLOUDBASE_ENV
  if (!env?.trim() || env.trim().startsWith('YOUR_')) {
    throw new Error('请在 admin/.env.local 中填写 VITE_CLOUDBASE_ENV，不能使用示例占位符。')
  }
  return {
    base: './',
    plugins: [vue()],
    server: { host: '127.0.0.1', port: 5173, strictPort: true }
  }
})
