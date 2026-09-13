import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const cert = process.env.SUDOKU_HTTPS_CERT
const key = process.env.SUDOKU_HTTPS_KEY
if (!!cert !== !!key) throw new Error('Укажите оба пути: SUDOKU_HTTPS_CERT и SUDOKU_HTTPS_KEY')

export default defineConfig({
  plugins: [react()],
  server: { https: cert && key ? { cert: readFileSync(cert), key: readFileSync(key) } : undefined },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
})
