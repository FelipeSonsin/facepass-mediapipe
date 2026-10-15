import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { validatePerson, type JsonPersonRecord } from '../shared/people.ts'

export interface PeopleRepository {
  list(): Promise<JsonPersonRecord[]>
  put(person: JsonPersonRecord): Promise<void>
  remove(id: string): Promise<void>
  importMissing(people: JsonPersonRecord[]): Promise<number>
}

interface Database {
  schemaVersion: 1
  people: JsonPersonRecord[]
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

/** Único ponto a substituir quando o armazenamento passar para SQL ou outro banco. */
export class JsonPeopleRepository implements PeopleRepository {
  readonly filePath: string

  constructor(filePath: string) {
    this.filePath = resolve(filePath)
  }

  async initialize(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    await this.withLock(async () => {
      try {
        await this.read()
      } catch (error) {
        if (!hasCode(error, 'ENOENT')) throw error
        await this.write({ schemaVersion: 1, people: [] })
      }
    })
  }

  async list(): Promise<JsonPersonRecord[]> {
    // A troca atômica do arquivo garante que leitores só vejam versões completas.
    return (await this.read()).people.sort((a, b) => a.createdAt - b.createdAt)
  }

  async put(value: JsonPersonRecord): Promise<void> {
    const person = validatePerson(value)
    await this.withLock(async () => {
      const db = await this.read()
      const index = db.people.findIndex((p) => p.id === person.id)
      if (index < 0) db.people.push(person)
      else {
        const current = db.people[index]
        db.people[index] = { ...person, createdAt: current.createdAt, updatedAt: Math.max(person.updatedAt, current.updatedAt) }
      }
      await this.write(db)
    })
  }

  async remove(id: string): Promise<void> {
    await this.withLock(async () => {
      const db = await this.read()
      db.people = db.people.filter((p) => p.id !== id)
      await this.write(db)
    })
  }

  async importMissing(values: JsonPersonRecord[]): Promise<number> {
    const people = values.map(validatePerson)
    return this.withLock(async () => {
      const db = await this.read()
      const ids = new Set(db.people.map((p) => p.id))
      let imported = 0
      for (const person of people) {
        if (ids.has(person.id)) continue
        db.people.push(person)
        ids.add(person.id)
        imported++
      }
      if (imported) await this.write(db)
      return imported
    })
  }

  private async read(): Promise<Database> {
    const text = await readFile(this.filePath, 'utf8')
    try {
      const data = JSON.parse(text)
      if (data.schemaVersion !== 1 || !Array.isArray(data.people)) throw new Error('Estrutura incompatível.')
      const people = data.people.map(validatePerson) as JsonPersonRecord[]
      if (new Set(people.map((p) => p.id)).size !== people.length) throw new Error('Identificadores repetidos.')
      return { schemaVersion: 1, people }
    } catch {
      throw new Error('O banco.json está inválido. Restaure uma cópia válida; o arquivo não foi substituído.')
    }
  }

  private async write(db: Database): Promise<void> {
    const temporary = `${this.filePath}.${randomUUID()}.tmp`
    const handle = await open(temporary, 'wx', 0o600)
    try {
      await handle.writeFile(`${JSON.stringify(db, null, 2)}\n`, 'utf8')
      await handle.sync()
      await handle.close()
      await rename(temporary, this.filePath)
    } finally {
      await handle.close().catch(() => {})
      await unlink(temporary).catch(() => {})
    }
  }

  /** O lock também serializa gravações entre dev e preview, em processos distintos. */
  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const lockPath = `${this.filePath}.lock`
    const deadline = Date.now() + 5000
    let handle
    while (!handle) {
      try {
        handle = await open(lockPath, 'wx', 0o600)
      } catch (error) {
        if (!hasCode(error, 'EEXIST')) throw error
        await this.recoverLock(lockPath)
        if (Date.now() >= deadline) throw new Error('O banco.json está ocupado. Tente novamente em alguns instantes.')
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
    }
    try {
      await handle.writeFile(JSON.stringify({ pid: process.pid }))
      return await operation()
    } finally {
      await handle.close()
      await unlink(lockPath).catch(() => {})
    }
  }

  private async recoverLock(lockPath: string): Promise<void> {
    // Apenas um processo verifica locks órfãos por vez. Uma segunda recuperação não
    // pode remover o lock novo de um escritor que acabou de assumir o arquivo.
    const recoveryPath = `${lockPath}.recovery`
    let recovery
    try { recovery = await open(recoveryPath, 'wx', 0o600) } catch { return }
    try {
      const lock = JSON.parse(await readFile(lockPath, 'utf8'))
      if (Number.isInteger(lock.pid) && lock.pid > 0) {
        try { process.kill(lock.pid, 0) } catch (error) {
          if (hasCode(error, 'ESRCH')) await unlink(lockPath).catch(() => {})
        }
      }
    } catch { /* O proprietário pode ainda estar escrevendo, ou já ter liberado o lock. */ }
    finally {
      await recovery.close()
      await unlink(recoveryPath).catch(() => {})
    }
  }
}
