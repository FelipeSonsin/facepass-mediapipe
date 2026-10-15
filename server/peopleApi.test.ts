import { createServer, type Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPeopleApi } from './peopleApi.ts'
import { JsonPeopleRepository } from './jsonPeopleRepository.ts'

describe('API do banco local', () => {
  let server: Server
  let directory: string
  let base: string
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'facepass-api-'))
    const repository = new JsonPeopleRepository(join(directory, 'banco.json'))
    await repository.initialize()
    const middleware = createPeopleApi(repository)
    server = createServer((req, res) => middleware(req, res, () => { res.writeHead(404); res.end() }))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Porta indisponível.')
    base = `http://127.0.0.1:${address.port}`
  })
  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    await rm(directory, { recursive: true, force: true })
  })

  it('recusa origem externa, incluindo origem null', async () => {
    for (const origin of ['https://example.com', 'null']) {
      expect((await fetch(`${base}/api/people`, { headers: { Origin: origin } })).status).toBe(403)
    }
  })

  it('valida JSON e amostras antes de gravar', async () => {
    const invalidJson = await fetch(`${base}/api/people/test`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{' })
    expect(invalidJson.status).toBe(400)
    const invalidPerson = await fetch(`${base}/api/people/test`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'test', name: 'Pessoa' }) })
    expect(invalidPerson.status).toBe(400)
    expect(await (await fetch(`${base}/api/people`)).json()).toEqual({ people: [] })
  })

  it('não trata uma rota de API inexistente como HTML da aplicação', async () => {
    const response = await fetch(`${base}/api/nao-existe`)
    expect(response.status).toBe(404)
    expect(response.headers.get('Content-Type')).toContain('application/json')
  })
})
