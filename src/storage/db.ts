// Persistência dos cadastros no IndexedDB deste navegador e deste endereço (origem).
// Guarda apenas: identificador, nome, embeddings, datas e versões de modelo/processamento.
// Nenhuma imagem é gravada.

export interface PersonRecord {
  id: string
  name: string
  /** Embeddings L2-normalizados (128 valores cada). */
  samples: Float32Array[]
  createdAt: number
  updatedAt: number
  modelVersion: string
  pipelineVersion: string
}

const DB_NAME = 'facepass'
const DB_VERSION = 1
const STORE = 'people'

export class StorageError extends Error {
  readonly kind: 'unavailable' | 'quota' | 'failed'
  constructor(kind: StorageError['kind'], message: string) {
    super(message)
    this.kind = kind
  }
}

let dbPromise: Promise<IDBDatabase> | null = null

function toStorageError(err: unknown): StorageError {
  if (err instanceof StorageError) return err
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'QuotaExceededError') return new StorageError('quota', 'Sem espaço para salvar neste navegador.')
  return new StorageError('failed', err instanceof Error ? err.message : String(err))
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new StorageError('unavailable', 'Este navegador não oferece armazenamento local (IndexedDB).'))
      return
    }
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (e) {
      reject(new StorageError('unavailable', String(e)))
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => {
      const db = req.result
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    req.onerror = () => reject(new StorageError('unavailable', req.error?.message ?? 'Falha ao abrir o armazenamento'))
    req.onblocked = () => reject(new StorageError('unavailable', 'O armazenamento está bloqueado por outra aba do FacePass.'))
  }).catch((e) => {
    dbPromise = null
    throw toStorageError(e)
  })
  return dbPromise
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb()
  return new Promise<T | undefined>((resolve, reject) => {
    let result: T | undefined
    let t: IDBTransaction
    try {
      t = db.transaction(STORE, mode)
    } catch (e) {
      reject(toStorageError(e))
      return
    }
    const req = run(t.objectStore(STORE))
    if (req) req.onsuccess = () => (result = req.result)
    // Só resolve quando a transação é efetivada (dados gravados).
    t.oncomplete = () => resolve(result)
    t.onerror = () => reject(toStorageError(t.error))
    t.onabort = () => reject(toStorageError(t.error ?? new Error('Gravação cancelada')))
  })
}

interface StoredPerson extends Omit<PersonRecord, 'samples'> {
  samples: ArrayBuffer[]
}

function fromStored(p: StoredPerson): PersonRecord {
  return { ...p, samples: p.samples.map((b) => new Float32Array(b)) }
}

function toStored(p: PersonRecord): StoredPerson {
  return { ...p, samples: p.samples.map((s) => s.slice().buffer as ArrayBuffer) }
}

export async function listPeople(): Promise<PersonRecord[]> {
  const rows = (await tx<StoredPerson[]>('readonly', (s) => s.getAll())) ?? []
  return rows.map(fromStored).sort((a, b) => a.createdAt - b.createdAt)
}

export async function putPerson(person: PersonRecord): Promise<void> {
  await tx('readwrite', (s) => s.put(toStored(person)))
}

export async function deletePerson(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id))
}

export function newPersonId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
