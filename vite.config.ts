/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { localDatabase } from './server/localDatabase.ts'

export default defineConfig({
  plugins: [localDatabase(), react(), tailwindcss()],
  // O ONNX Runtime carrega seus próprios arquivos .wasm (servidos de public/ort);
  // a pré-otimização do Vite quebraria esses caminhos.
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      // validacao.html é só para desenvolvimento; calibracao.html vai para o build porque a
      // calibração precisa rodar no mesmo endereço (origem) dos cadastros.
      input: { main: 'index.html', calibracao: 'calibracao.html' },
    },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
})
