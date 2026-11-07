import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

function projectRoot() {
  let directory = dirname(fileURLToPath(import.meta.url))
  while (!existsSync(resolve(directory, 'package.json'))) {
    const parent = dirname(directory)
    if (parent === directory) throw new Error('Raiz do FacePass não encontrada.')
    directory = parent
  }
  return directory
}

export const PROJECT_ROOT = projectRoot()

export function readServerConfig(root = PROJECT_ROOT, environment: NodeJS.ProcessEnv = process.env) {
  const envPath = resolve(root, '.env')
  // Variáveis do processo têm prioridade sobre o arquivo local. Nunca usar VITE_ para segredos.
  const values = { ...(existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {}), ...environment }
  const port = (key: string, fallback: number) => {
    const raw = values[key]?.trim() || String(fallback)
    if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 65535) throw new Error(`${key} deve ser uma porta entre 1 e 65535.`)
    return Number(raw)
  }
  const filePath = resolve(root, values.FACEPASS_DB_FILE?.trim() || 'backend/data/banco.json')
  for (const directory of ['frontend', 'backend/dist', '.git', 'node_modules']) {
    const inside = relative(resolve(root, directory), filePath)
    if (inside === '' || (!isAbsolute(inside) && inside !== '..' && !inside.startsWith(`..${sep}`))) {
      throw new Error('FACEPASS_DB_FILE precisa ficar fora de pastas públicas, geradas e de dependências.')
    }
  }
  if (!basename(filePath).toLowerCase().endsWith('.json')) throw new Error('FACEPASS_DB_FILE deve apontar para um arquivo .json.')
  return {
    root: resolve(root),
    host: '127.0.0.1',
    port: port('FACEPASS_PORT', 3000),
    devPort: port('FACEPASS_DEV_PORT', 5173),
    previewPort: port('FACEPASS_PREVIEW_PORT', 4173),
    filePath,
    distDir: resolve(root, 'frontend/dist'),
    // Reservadas para uma integração futura escolhida pelo usuário; não são enviadas ao cliente.
    externalApi: { url: values.EXTERNAL_API_URL?.trim() || '', key: values.EXTERNAL_API_KEY || '' },
  }
}

export type ServerConfig = ReturnType<typeof readServerConfig>
