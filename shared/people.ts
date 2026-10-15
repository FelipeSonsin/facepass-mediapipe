import { isValidEmbedding } from '../src/recognition/embedding.ts'
import { normalizeName, validateName } from '../src/lib/names.ts'

export interface PersonRecord {
  id: string
  name: string
  samples: Float32Array[]
  createdAt: number
  updatedAt: number
  modelVersion: string
  pipelineVersion: string
}

/** Formato portátil para o arquivo JSON e a API, sem objetos específicos do navegador. */
export interface JsonPersonRecord extends Omit<PersonRecord, 'samples'> {
  samples: number[][]
}

export function validatePerson(value: unknown): JsonPersonRecord {
  if (!value || typeof value !== 'object') throw new Error('Cadastro inválido.')
  const p = value as Record<string, unknown>
  if (typeof p.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(p.id)) throw new Error('Identificador inválido.')
  if (typeof p.name !== 'string') throw new Error('Nome inválido.')
  const error = validateName(p.name)
  if (error) throw new Error(error)
  if (!Array.isArray(p.samples) || p.samples.length !== 5 || !p.samples.every((s) =>
    Array.isArray(s) && s.every((n) => typeof n === 'number') && isValidEmbedding(s),
  )) throw new Error('O cadastro precisa conter 5 amostras faciais válidas de 128 números cada.')
  if (typeof p.createdAt !== 'number' || !Number.isSafeInteger(p.createdAt) || p.createdAt <= 0 ||
    typeof p.updatedAt !== 'number' || !Number.isSafeInteger(p.updatedAt) || p.updatedAt < p.createdAt) {
    throw new Error('Datas do cadastro inválidas.')
  }
  if (typeof p.modelVersion !== 'string' || !p.modelVersion.trim() || p.modelVersion.length > 160 ||
    typeof p.pipelineVersion !== 'string' || !p.pipelineVersion.trim() || p.pipelineVersion.length > 160) {
    throw new Error('Versão do processamento inválida.')
  }
  return {
    id: p.id,
    name: normalizeName(p.name),
    samples: p.samples.map((s: number[]) => [...s]),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    modelVersion: p.modelVersion,
    pipelineVersion: p.pipelineVersion,
  }
}

export function serializePerson(person: PersonRecord): JsonPersonRecord {
  return validatePerson({ ...person, samples: person.samples.map((s) => Array.from(s)) })
}

export function deserializePerson(value: unknown): PersonRecord {
  const person = validatePerson(value)
  return { ...person, samples: person.samples.map((s) => new Float32Array(s)) }
}
