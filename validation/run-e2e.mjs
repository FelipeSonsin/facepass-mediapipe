// Servidor e banco exclusivos de teste: nunca usa o banco.json dos cadastros reais.
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApplication } from '../backend/dist/backend/src/app.js'
import { readServerConfig } from '../backend/dist/backend/src/config.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'validation', 'out')
await mkdir(output, { recursive: true })
const directory = await mkdtemp(join(output, 'database-e2e-'))
process.env.FACEPASS_DB_FILE = join(directory, 'banco.json')
const app = await createApplication(readServerConfig(root))
const server = await new Promise((resolve, reject) => {
  const instance = app.listen(0, '127.0.0.1', () => resolve(instance))
  instance.once('error', reject)
})
try {
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Não foi possível iniciar o servidor de testes.')
  const url = `http://127.0.0.1:${address.port}`
  console.log(`Banco isolado de teste: ${process.env.FACEPASS_DB_FILE}`)
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.env.FACEPASS_PYTHON || 'python', ['-u', join(root, 'validation', 'e2e_flows.py')], {
      cwd: root, stdio: 'inherit', env: { ...process.env, FACEPASS_URL: url },
    })
    child.on('error', reject)
    child.on('exit', (code) => resolve(code ?? 1))
  })
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}
