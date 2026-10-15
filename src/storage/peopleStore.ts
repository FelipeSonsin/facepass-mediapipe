// Estado em memória dos cadastros, sincronizado com a API do banco local.
// Componentes leem via useSyncExternalStore; o reconhecimento lê `compatible()`.
import { useSyncExternalStore } from 'react'
import { PIPELINE_VERSION } from '../config/recognition'
import { SFACE_MODEL } from '../sface/sfaceClient'
import { isValidEmbedding } from '../recognition/embedding'
import type { Enrolled } from '../recognition/match'
import { deletePerson, listPeople, newPersonId, putPerson, StorageError, type PersonRecord } from './db'

export interface PeopleState {
  status: 'loading' | 'ready' | 'error'
  people: PersonRecord[]
  error: string | null
}

type Listener = () => void
type ChangeListener = (change: { type: 'added' | 'updated' | 'deleted'; id: string }) => void

let state: PeopleState = { status: 'loading', people: [], error: null }
const listeners = new Set<Listener>()
const changeListeners = new Set<ChangeListener>()
let compatibleCache: Enrolled[] | null = null

function set(next: PeopleState) {
  state = next
  compatibleCache = null
  listeners.forEach((l) => l())
}

function emitChange(type: 'added' | 'updated' | 'deleted', id: string) {
  changeListeners.forEach((l) => l({ type, id }))
}

export function isCompatible(p: PersonRecord) {
  return p.pipelineVersion === PIPELINE_VERSION && p.modelVersion === SFACE_MODEL.version && p.samples.every(isValidEmbedding)
}

export const peopleStore = {
  subscribe(l: Listener) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  /** Notificado em toda alteração de cadastro (o reconhecimento reinicia a sessão). */
  onChange(l: ChangeListener) {
    changeListeners.add(l)
    return () => changeListeners.delete(l)
  },
  get: () => state,
  /** Cadastros comparáveis com o pipeline atual. */
  compatible(): Enrolled[] {
    compatibleCache ??= state.people.filter(isCompatible).map((p) => ({ id: p.id, samples: p.samples }))
    return compatibleCache
  },
  nameOf(id: string) {
    return state.people.find((p) => p.id === id)?.name ?? null
  },

  async load() {
    try {
      set({ status: 'ready', people: await listPeople(), error: null })
    } catch (e) {
      set({ status: 'error', people: [], error: e instanceof StorageError ? e.message : String(e) })
    }
  },

  async add(name: string, samples: Float32Array[]): Promise<PersonRecord> {
    const now = Date.now()
    const person: PersonRecord = {
      id: newPersonId(),
      name,
      samples,
      createdAt: now,
      updatedAt: now,
      modelVersion: SFACE_MODEL.version,
      pipelineVersion: PIPELINE_VERSION,
    }
    await putPerson(person)
    set({ ...state, people: [...state.people, person] })
    emitChange('added', person.id)
    return person
  },

  /** Recadastro: substitui as amostras de uma pessoa existente (mesmo identificador). */
  async replaceSamples(id: string, samples: Float32Array[]): Promise<PersonRecord> {
    const current = state.people.find((p) => p.id === id)
    if (!current) throw new StorageError('failed', 'Cadastro não encontrado.')
    const next: PersonRecord = {
      ...current,
      samples,
      updatedAt: Date.now(),
      modelVersion: SFACE_MODEL.version,
      pipelineVersion: PIPELINE_VERSION,
    }
    await putPerson(next)
    set({ ...state, people: state.people.map((p) => (p.id === id ? next : p)) })
    emitChange('updated', id)
    return next
  },

  async rename(id: string, name: string) {
    const current = state.people.find((p) => p.id === id)
    if (!current) throw new StorageError('failed', 'Cadastro não encontrado.')
    const next = { ...current, name, updatedAt: Date.now() }
    await putPerson(next)
    set({ ...state, people: state.people.map((p) => (p.id === id ? next : p)) })
    emitChange('updated', id)
  },

  async remove(id: string) {
    await deletePerson(id)
    set({ ...state, people: state.people.filter((p) => p.id !== id) })
    emitChange('deleted', id)
  },
}

export function usePeople(): PeopleState {
  return useSyncExternalStore(peopleStore.subscribe, peopleStore.get)
}
