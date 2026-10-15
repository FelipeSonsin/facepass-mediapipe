import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { JsonPersonRecord } from '../shared/people.ts'
import { JsonPeopleRepository } from './jsonPeopleRepository.ts'

export function simulatedPerson(id = 'person-test', name = 'Pessoa Teste'): JsonPersonRecord {
  // Vetores artificiais normalizados, usados apenas para testar a persistência.
  const sample = Array<number>(128).fill(0)
  sample[0] = 1
  return { id, name, samples: Array.from({ length: 5 }, () => [...sample]), createdAt: 1000, updatedAt: 1000, modelVersion: 'test-v1', pipelineVersion: 'test-v1' }
}

describe('JsonPeopleRepository', () => {
  let directory: string
  let filePath: string
  let repository: JsonPeopleRepository
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'facepass-json-'))
    filePath = join(directory, 'banco.json')
    repository = new JsonPeopleRepository(filePath)
    await repository.initialize()
  })
  afterEach(async () => { await rm(directory, { recursive: true, force: true }) })

  it('grava números portáteis em disco e outro processo consegue ler o cadastro', async () => {
    const person = simulatedPerson()
    await repository.put(person)
    const data = JSON.parse(await readFile(filePath, 'utf8'))
    expect(data).toEqual({ schemaVersion: 1, people: [person] })
    const url = new URL('./jsonPeopleRepository.ts', import.meta.url).href
    const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e',
      `import { JsonPeopleRepository } from ${JSON.stringify(url)}; console.log(JSON.stringify(await new JsonPeopleRepository(process.argv[1]).list()))`, filePath])
    expect(JSON.parse(stdout)).toEqual([person])
  })

  it('edita e exclui o mesmo registro sem duplicá-lo', async () => {
    await repository.put(simulatedPerson())
    await repository.put({ ...simulatedPerson(), name: 'Nome Editado', createdAt: 2000, updatedAt: 3000 })
    const people = await new JsonPeopleRepository(filePath).list()
    expect(people).toHaveLength(1)
    expect(people[0]).toMatchObject({ name: 'Nome Editado', createdAt: 1000, updatedAt: 3000 })
    await repository.remove(people[0].id)
    expect(JSON.parse(await readFile(filePath, 'utf8')).people).toEqual([])
  })

  it('não perde registros em gravações simultâneas por instâncias diferentes', async () => {
    const other = new JsonPeopleRepository(filePath)
    await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? other : repository).put(simulatedPerson(`person-${i}`))))
    expect(await repository.list()).toHaveLength(12)
  })

  it('rejeita amostras inválidas sem alterar dados salvos', async () => {
    await repository.put(simulatedPerson())
    const before = await readFile(filePath, 'utf8')
    await expect(repository.put({ ...simulatedPerson(), samples: [[0]] })).rejects.toThrow('amostras faciais válidas')
    expect(await readFile(filePath, 'utf8')).toBe(before)
  })

  it('recupera lock de processo encerrado sem perder gravações concorrentes', async () => {
    const { stdout } = await promisify(execFile)(process.execPath, ['-e', 'console.log(process.pid)'])
    await writeFile(`${filePath}.lock`, JSON.stringify({ pid: Number(stdout.trim()) }), 'utf8')
    await Promise.all(Array.from({ length: 8 }, (_, i) => new JsonPeopleRepository(filePath).put(simulatedPerson(`recovered-${i}`))))
    expect(await repository.list()).toHaveLength(8)
  })

  it('não sobrescreve um arquivo corrompido nem reinicializa os dados silenciosamente', async () => {
    await writeFile(filePath, '{arquivo incompleto', 'utf8')
    await expect(repository.initialize()).rejects.toThrow('banco.json está inválido')
    await expect(repository.put(simulatedPerson())).rejects.toThrow('banco.json está inválido')
    expect(await readFile(filePath, 'utf8')).toBe('{arquivo incompleto')
  })

  it('importa registros antigos uma vez e preserva o registro atual em colisões de id', async () => {
    await repository.put(simulatedPerson('existing', 'Nome Atual'))
    const imported = [simulatedPerson('existing', 'Nome Antigo'), simulatedPerson('legacy')]
    expect(await repository.importMissing(imported)).toBe(1)
    expect(await repository.importMissing(imported)).toBe(0)
    expect(await repository.list()).toHaveLength(2)
    expect((await repository.list()).find((p) => p.id === 'existing')?.name).toBe('Nome Atual')
  })
})
