import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readServerConfig } from './config.ts'

describe('Configuração privada do servidor', () => {
  let root: string
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'facepass-config-')) })
  afterEach(async () => { await rm(root, { recursive: true, force: true }) })

  it('lê .env e dá prioridade às variáveis do processo sem alterar process.env', async () => {
    await writeFile(join(root, '.env'), 'FACEPASS_PORT=3100\nEXTERNAL_API_KEY=chave-simulada\n')
    const config = readServerConfig(root, { FACEPASS_PORT: '3200' })
    expect(config.port).toBe(3200)
    expect(config.externalApi.key).toBe('chave-simulada')
    expect(config.filePath).toBe(join(root, 'backend', 'data', 'banco.json'))
    expect(config.distDir).toBe(join(root, 'frontend', 'dist'))
    expect(process.env.EXTERNAL_API_KEY).not.toBe('chave-simulada')
  })

  it('funciona sem .env ou chaves de serviços externos', () => {
    expect(readServerConfig(root, {})).toMatchObject({ port: 3000, host: '127.0.0.1', externalApi: { url: '', key: '' } })
  })

  it.each(['0', '65536', 'abc', '-1'])('recusa a porta inválida %s', (port) => {
    expect(() => readServerConfig(root, { FACEPASS_PORT: port })).toThrow('FACEPASS_PORT')
  })

  it.each(['frontend/public/people.json', 'frontend/dist/people.json', 'backend/dist/people.json', 'node_modules/people.json'])('recusa cadastros em %s', (filePath) => {
    expect(() => readServerConfig(root, { FACEPASS_DB_FILE: filePath })).toThrow('fora de pastas')
  })
})
