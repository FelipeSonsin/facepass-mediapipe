/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { localDatabase } from '../backend/src/localDatabase.ts'
import { readServerConfig } from '../backend/src/config.ts'
import { LOCAL_HTTP_HEADERS } from '../backend/src/httpHeaders.ts'

const config = readServerConfig()

export default defineConfig({
  root: resolve(config.root, 'frontend'),
  plugins: [localDatabase(), react(), tailwindcss(), {
    name: 'facepass-validation-assets',
    // Apenas fixtures conhecidas; os perfis e ferramentas em validation/out não são públicos.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = new URL(req.url ?? '/', 'http://localhost').pathname
        if (!/^\/validation\/images\/[\w.-]+\.(png|jpg)$/.test(path) && path !== '/validation/out/yunet.json') return next()
        void readFile(resolve(config.root, `.${path}`)).then((data) => {
          res.setHeader('Content-Type', path.endsWith('.json') ? 'application/json' : path.endsWith('.png') ? 'image/png' : 'image/jpeg')
          res.end(data)
        }).catch(() => { res.writeHead(404); res.end('Fixture de validação não encontrada.') })
      })
    },
  }],
  // O ONNX Runtime carrega seus próprios arquivos .wasm (servidos de public/ort);
  // a pré-otimização do Vite quebraria esses caminhos.
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      // validacao.html é só para desenvolvimento; calibracao.html vai para o build porque a
      // calibração precisa rodar no mesmo endereço (origem) dos cadastros.
      input: { main: resolve(config.root, 'frontend/index.html'), calibracao: resolve(config.root, 'frontend/calibracao.html') },
    },
  },
  server: { host: config.host, port: config.devPort, strictPort: true, fs: { allow: [config.root] }, headers: LOCAL_HTTP_HEADERS },
  preview: { host: config.host, port: config.previewPort, strictPort: true, headers: LOCAL_HTTP_HEADERS },
  test: {
    root: config.root,
    environment: 'node',
    include: ['frontend/src/**/*.test.ts', 'backend/src/**/*.test.ts'],
  },
})
