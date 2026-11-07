import type { Server } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApplication } from './app.ts'
import { readServerConfig } from './config.ts'

describe('Servidor integrado', () => {
  let root: string
  let server: Server
  let base: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'facepass-app-'))
    await mkdir(join(root, 'frontend', 'dist'), { recursive: true })
    await writeFile(join(root, 'frontend', 'dist', 'index.html'), '<!doctype html><title>FacePass teste</title>')
    await writeFile(join(root, 'frontend', 'dist', 'runtime.wasm'), Buffer.from([0, 97, 115, 109]))
    await writeFile(join(root, '.env'), 'EXTERNAL_API_KEY=segredo-simulado-privado\n')
    const app = await createApplication(readServerConfig(root, {}))
    server = app.listen(0, '127.0.0.1')
    await new Promise<void>((resolve) => server.once('listening', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Porta indisponível.')
    base = `http://127.0.0.1:${address.port}`
  })
  afterEach(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    await rm(root, { recursive: true, force: true })
  })

  it('serve o front-end e WASM com os tipos corretos', async () => {
    const page = await fetch(base)
    expect(page.status).toBe(200)
    expect(page.headers.get('Content-Type')).toContain('text/html')
    expect(page.headers.get('Content-Security-Policy')).toContain("connect-src 'self'")
    expect(await page.text()).toContain('FacePass teste')
    expect((await fetch(`${base}/runtime.wasm`)).headers.get('Content-Type')).toContain('application/wasm')
  })

  it('verifica a persistência pelo endpoint de saúde sem expor chaves', async () => {
    const response = await fetch(`${base}/api/health`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok', app: 'FacePass', storage: 'json-file' })
    expect(await (await fetch(`${base}/api/people`)).json()).toEqual({ people: [] })
    const file = join(root, 'backend', 'data', 'banco.json')
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ schemaVersion: 1, people: [] })
    await writeFile(file, '{corrompido')
    expect((await fetch(`${base}/api/health`)).status).toBe(500)
  })

  it('bloqueia .env, dados e arquivos de lock, inclusive caminhos codificados', async () => {
    for (const path of ['/.env', '/.ENV?raw', '/%2eenv', '/@fs/private/.env', '/banco.json', '/backend/data/BANCO.JSON', '/banco.json.lock']) {
      const response = await fetch(`${base}${path}`)
      expect(response.status, path).toBe(403)
      expect(await response.text()).not.toContain('segredo-simulado-privado')
    }
    expect((await fetch(`${base}/backend/src/config.ts`)).status).toBe(404)
  })

  it('mantém erros da API em JSON e recusa origens externas', async () => {
    const missing = await fetch(`${base}/api/nao-existe`)
    expect(missing.status).toBe(404)
    expect(missing.headers.get('Content-Type')).toContain('application/json')
    expect((await fetch(`${base}/api/people`, { headers: { Origin: 'https://example.com' } })).status).toBe(403)
  })
})
