import type { IncomingMessage, ServerResponse } from 'node:http'
import { validatePerson } from '../shared/people.ts'
import type { PeopleRepository } from './jsonPeopleRepository.ts'

class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
    throw new ApiError(415, 'Envie os dados como application/json.')
  }
  return new Promise((resolve, reject) => {
    let size = 0
    let rejected = false
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      if (rejected) return
      size += chunk.length
      if (size > 2 * 1024 * 1024) {
        rejected = true
        chunks.length = 0
        reject(new ApiError(413, 'O pedido excede o limite de 2 MB.'))
      } else chunks.push(chunk)
    })
    req.on('end', () => {
      if (rejected) return
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { reject(new ApiError(400, 'JSON inválido.')) }
    })
    req.on('error', reject)
    req.on('aborted', () => reject(new ApiError(400, 'Envio dos dados interrompido.')))
  })
}

function checkLocalRequest(req: IncomingMessage) {
  const host = req.headers.host
  if (!host) throw new ApiError(403, 'Endereço local inválido.')
  let hostname: string
  try { hostname = new URL(`http://${host}`).hostname } catch { throw new ApiError(403, 'Endereço local inválido.') }
  const local = ['localhost', '127.0.0.1', '[::1]']
  const remote = req.socket.remoteAddress ?? ''
  if (!local.includes(hostname) || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) {
    throw new ApiError(403, 'O banco local só está disponível neste computador.')
  }
  const origin = req.headers.origin
  let sameOrigin = !origin
  try { if (origin) sameOrigin = new URL(origin).host === host } catch { sameOrigin = false }
  if (req.headers['sec-fetch-site'] === 'cross-site' || !sameOrigin) {
    throw new ApiError(403, 'Origem não autorizada.')
  }
}

/** API estável; o repositório injetado define onde os registros serão persistidos. */
export function createPeopleApi(repository: PeopleRepository) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    if (path !== '/api' && !path.startsWith('/api/')) return next()
    void (async () => {
      checkLocalRequest(req)
      if (path === '/api/people' && req.method === 'GET') {
        return send(res, 200, { people: await repository.list() })
      }
      if (path === '/api/people/import' && req.method === 'POST') {
        const body = await readJson(req) as { people?: unknown }
        if (!body || !Array.isArray(body.people)) throw new ApiError(400, 'Lista de cadastros inválida.')
        let people
        try { people = body.people.map(validatePerson) } catch (error) {
          throw new ApiError(400, error instanceof Error ? error.message : 'Cadastro inválido.')
        }
        return send(res, 200, { imported: await repository.importMissing(people) })
      }
      const match = /^\/api\/people\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,99})$/.exec(path)
      if (match && req.method === 'PUT') {
        let person
        const body = await readJson(req)
        try { person = validatePerson(body) } catch (error) {
          throw new ApiError(400, error instanceof Error ? error.message : 'Cadastro inválido.')
        }
        if (person.id !== match[1]) throw new ApiError(400, 'O identificador não corresponde ao cadastro.')
        await repository.put(person)
        return send(res, 200, { ok: true })
      }
      if (match && req.method === 'DELETE') {
        await repository.remove(match[1])
        return send(res, 200, { ok: true })
      }
      throw new ApiError(404, 'Operação não encontrada.')
    })().catch((error: unknown) => {
      const fullDisk = error instanceof Error && 'code' in error && error.code === 'ENOSPC'
      const status = error instanceof ApiError ? error.status : fullDisk ? 507 : 500
      send(res, status, { error: fullDisk ? 'Não há espaço em disco para salvar o cadastro.' : error instanceof Error ? error.message : 'Falha ao acessar o banco local.' })
    })
  }
}
