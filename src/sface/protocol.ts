import type { Point } from './similarityTransform'

export type SfaceRequest =
  | { type: 'init'; modelUrl: string }
  | {
      type: 'embed'
      id: number
      width: number
      height: number
      /** Pixels RGBA do mesmo quadro em que os pontos foram detectados (transferido). */
      pixels: ArrayBuffer
      points: Point[]
      returnCrop?: boolean
    }
  | { type: 'dispose' }

export type SfaceResponse =
  | { type: 'ready'; inputName: string; outputName: string; inputShape: string[] }
  | { type: 'embedding'; id: number; embedding: Float32Array; rawNorm: number; ms: number; crop?: Uint8Array }
  | { type: 'error'; id?: number; message: string }
  | { type: 'disposed' }
