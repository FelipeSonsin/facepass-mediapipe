// Copia o runtime WebAssembly do MediaPipe para public/, para que o aplicativo funcione
// sem CDN. (O .wasm do ONNX Runtime Web é empacotado pelo Vite como asset.)
import { cpSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const nm = join(root, 'node_modules')

mkdirSync(join(root, 'public', 'mediapipe'), { recursive: true })
cpSync(join(nm, '@mediapipe', 'tasks-vision', 'wasm'), join(root, 'public', 'mediapipe', 'wasm'), { recursive: true })
console.log('✓ runtime do MediaPipe copiado para public/mediapipe')
