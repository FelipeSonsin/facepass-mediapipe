// Cliente da thread principal para o worker do SFace.
import type { Point } from './similarityTransform'
import type { SfaceRequest, SfaceResponse } from './protocol'

export const SFACE_MODEL = {
  file: 'face_recognition_sface_2021dec.onnx',
  version: 'sface_2021dec',
} as const

export interface EmbeddingResult {
  embedding: Float32Array
  rawNorm: number
  ms: number
  crop?: Uint8Array
}

export class SfaceEmbedder {
  private worker: Worker
  private nextId = 1
  private pending = new Map<number, { resolve: (r: EmbeddingResult) => void; reject: (e: Error) => void }>()
  private ready: Promise<SfaceResponse & { type: 'ready' }>

  constructor(modelUrl = `${import.meta.env.BASE_URL}models/${SFACE_MODEL.file}`) {
    this.worker = new Worker(new URL('./sface.worker.ts', import.meta.url), { type: 'module' })
    this.ready = new Promise((resolve, reject) => {
      const onInit = (ev: MessageEvent<SfaceResponse>) => {
        const msg = ev.data
        if (msg.type === 'ready') resolve(msg)
        else if (msg.type === 'error' && msg.id === undefined) reject(new Error(msg.message))
        else return
        this.worker.removeEventListener('message', onInit)
      }
      this.worker.addEventListener('message', onInit)
      this.worker.addEventListener('error', (e) => reject(new Error(e.message || 'Falha ao iniciar o worker do SFace')))
    })
    this.worker.addEventListener('message', (ev: MessageEvent<SfaceResponse>) => this.onMessage(ev.data))
    this.post({ type: 'init', modelUrl })
  }

  whenReady() {
    return this.ready
  }

  get busy() {
    return this.pending.size > 0
  }

  /** Gera o embedding a partir dos pixels RGBA e dos 5 pontos do MESMO quadro.
   *  O buffer de pixels é transferido ao worker e deixa de ser utilizável aqui. */
  embed(frame: { width: number; height: number; pixels: ArrayBuffer }, points: Point[], returnCrop = false) {
    const id = this.nextId++
    return new Promise<EmbeddingResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.post({ type: 'embed', id, width: frame.width, height: frame.height, pixels: frame.pixels, points, returnCrop }, [
        frame.pixels,
      ])
    })
  }

  dispose() {
    for (const p of this.pending.values()) p.reject(new Error('Processamento encerrado'))
    this.pending.clear()
    this.post({ type: 'dispose' })
    // Dá tempo ao worker de liberar a sessão antes de encerrá-lo.
    setTimeout(() => this.worker.terminate(), 200)
  }

  private post(msg: SfaceRequest, transfer: Transferable[] = []) {
    this.worker.postMessage(msg, transfer)
  }

  private onMessage(msg: SfaceResponse) {
    if (msg.type === 'embedding') {
      const p = this.pending.get(msg.id)
      this.pending.delete(msg.id)
      p?.resolve({ embedding: msg.embedding, rawNorm: msg.rawNorm, ms: msg.ms, crop: msg.crop })
    } else if (msg.type === 'error' && msg.id !== undefined) {
      const p = this.pending.get(msg.id)
      this.pending.delete(msg.id)
      p?.reject(new Error(msg.message))
    }
  }
}
