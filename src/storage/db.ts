// A interface de armazenamento usa a API local; a persistência fica no servidor.
import { deserializePerson, serializePerson, type PersonRecord } from '../../shared/people.ts'
import { migrateLegacyPeople } from './legacyDb'

export type { PersonRecord } from '../../shared/people.ts'

export class StorageError extends Error {
  readonly kind: 'unavailable' | 'quota' | 'failed'
  constructor(kind: StorageError['kind'], message: string) {
    super(message)
    this.kind = kind
  }
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${import.meta.env.BASE_URL}api/${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    throw new StorageError('unavailable', 'Não foi possível acessar o banco local. Verifique se o servidor está em execução e tente novamente.')
  }
  if (!response.headers.get('Content-Type')?.includes('application/json')) {
    throw new StorageError('unavailable', 'A API do banco local não está disponível. Inicie o projeto com npm run dev ou npm run preview.')
  }
  const data = await response.json()
  if (!response.ok) throw new StorageError(response.status === 507 ? 'quota' : 'failed', data.error || 'Falha ao acessar o banco local.')
  return data as T
}

let migration: Promise<boolean> | null = null

export async function listPeople(): Promise<PersonRecord[]> {
  let data = await request<{ people: unknown[] }>('people')
  migration ??= migrateLegacyPeople(async (people) => {
    for (let offset = 0; offset < people.length; offset += 25) {
      await request('people/import', 'POST', { people: people.slice(offset, offset + 25) })
    }
  }).catch((error) => {
    migration = null
    throw error
  })
  if (await migration) data = await request('people')
  return data.people.map(deserializePerson).sort((a, b) => a.createdAt - b.createdAt)
}

export async function putPerson(person: PersonRecord): Promise<void> {
  await request(`people/${encodeURIComponent(person.id)}`, 'PUT', serializePerson(person))
}

export async function deletePerson(id: string): Promise<void> {
  await request(`people/${encodeURIComponent(id)}`, 'DELETE')
}

export function newPersonId(): string {
  return crypto.randomUUID()
}
