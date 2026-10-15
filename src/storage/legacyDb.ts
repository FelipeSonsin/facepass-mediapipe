// Importação única do armazenamento anterior. Não apaga os registros originais.
import type { JsonPersonRecord } from '../../shared/people.ts'

const MARKER = 'banco-json-v1'

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function openLegacy(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null
  try {
    if (indexedDB.databases && !(await indexedDB.databases()).some((db) => db.name === 'facepass')) return null
  } catch { return null }
  return new Promise((resolve) => {
    let settled = false
    const finish = (db: IDBDatabase | null) => {
      if (settled) db?.close()
      else { settled = true; resolve(db) }
    }
    let request: IDBOpenDBRequest
    try { request = indexedDB.open('facepass', 2) } catch { finish(null); return }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('people')) db.createObjectStore('people', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('migrations')) db.createObjectStore('migrations')
    }
    request.onsuccess = () => finish(request.result)
    request.onerror = () => finish(null)
    request.onblocked = () => finish(null)
  })
}

export async function migrateLegacyPeople(importPeople: (people: JsonPersonRecord[]) => Promise<unknown>): Promise<boolean> {
  const db = await openLegacy()
  if (!db) return false
  db.onversionchange = () => db.close()
  try {
    const migrated = await result(db.transaction('migrations').objectStore('migrations').get(MARKER))
    if (migrated) return false
    const rows = await result(db.transaction('people').objectStore('people').getAll())
    if (rows.length) {
      await importPeople(rows.map((p) => ({
        ...p,
        samples: p.samples.map((sample: ArrayBuffer) => Array.from(new Float32Array(sample))),
      })))
    }
    // Marca somente após a confirmação da API; não reimporta cadastros excluídos depois.
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('migrations', 'readwrite')
      transaction.objectStore('migrations').put(true, MARKER)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
    return rows.length > 0
  } finally { db.close() }
}
