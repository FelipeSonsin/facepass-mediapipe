// Coleta das amostras do cadastro (lógica pura, testável sem câmera).
//
// - 5 amostras válidas, em momentos distintos (intervalo mínimo) e com pequenas
//   variações naturais de posição entre amostras consecutivas.
// - Cada amostra precisa ser coerente com a média das anteriores; ao final, todos os
//   pares precisam ser coerentes. Isso evita misturar pessoas num mesmo cadastro.
// - Outra pessoa no quadro reinicia a captura; rosto ausente ou com qualidade ruim
//   pausa; pausa longa demais interrompe.
import { ENROLLMENT } from '../config/recognition'
import { cosine, l2Normalize } from '../recognition/embedding'
import { poseChange, type QualityIssue, type QualityReport } from '../vision/quality'

export type EnrollmentConfig = { readonly [K in keyof typeof ENROLLMENT]: number }

export type CaptureStatus =
  | { kind: 'collecting' }
  | { kind: 'hold' }
  | { kind: 'move' }
  | { kind: 'paused'; reason: 'no-face' | QualityIssue }
  | { kind: 'restarted'; reason: 'multiple' | 'inconsistent' }
  | { kind: 'stopped'; reason: 'lost' }
  | { kind: 'complete' }

export interface AnalysisInput {
  faceCount: number
  quality: QualityReport | null
  frameTime: number
}

export interface Sample {
  embedding: Float32Array
  pose: QualityReport['pose']
  frameTime: number
}

export class EnrollmentSession {
  private samples: Sample[] = []
  private lastOkTime: number
  private pendingFrame: number | null = null
  private lastPose: QualityReport['pose'] | null = null
  private done = false
  private readonly config: EnrollmentConfig

  constructor(now: number, config: EnrollmentConfig = ENROLLMENT) {
    this.config = config
    this.lastOkTime = now
  }

  get count() {
    return this.samples.length
  }

  get total() {
    return this.config.samples
  }

  get finished() {
    return this.done
  }

  embeddings(): Float32Array[] {
    return this.samples.map((s) => s.embedding)
  }

  /** Decide o que fazer com uma análise de quadro e se um embedding deve ser gerado. */
  onAnalysis(a: AnalysisInput, now: number): { status: CaptureStatus; requestEmbedding: boolean } {
    if (this.done) return { status: { kind: 'complete' }, requestEmbedding: false }
    if (a.faceCount >= 2) {
      this.restart(now)
      return { status: { kind: 'restarted', reason: 'multiple' }, requestEmbedding: false }
    }
    if (a.faceCount === 0 || !a.quality || !a.quality.ok) {
      if (now - this.lastOkTime > this.config.maxPauseMs) {
        this.done = true
        return { status: { kind: 'stopped', reason: 'lost' }, requestEmbedding: false }
      }
      const reason = a.faceCount === 0 || !a.quality ? 'no-face' : (a.quality.issue ?? 'no-face')
      return { status: { kind: 'paused', reason }, requestEmbedding: false }
    }
    this.lastOkTime = now
    if (this.pendingFrame !== null) return { status: { kind: 'collecting' }, requestEmbedding: false }
    const last = this.samples.at(-1)
    if (last && a.frameTime - last.frameTime < this.config.minIntervalMs) {
      return { status: { kind: 'hold' }, requestEmbedding: false }
    }
    if (this.lastPose && poseChange(this.lastPose, a.quality.pose) < this.config.minPoseChange) {
      return { status: { kind: 'move' }, requestEmbedding: false }
    }
    this.pendingFrame = a.frameTime
    return { status: { kind: 'collecting' }, requestEmbedding: true }
  }

  /** Recebe o embedding do quadro solicitado. */
  onEmbedding(embedding: Float32Array, pose: QualityReport['pose'], frameTime: number, now: number): CaptureStatus {
    if (this.done) return { kind: 'complete' }
    if (this.pendingFrame !== frameTime) return { kind: 'collecting' } // resultado de antes de um reinício
    this.pendingFrame = null
    if (this.samples.length > 0) {
      const centroid = l2Normalize(meanVector(this.samples.map((s) => s.embedding)))
      if (cosine(centroid, embedding) < this.config.minConsistency) {
        this.restart(now)
        return { kind: 'restarted', reason: 'inconsistent' }
      }
    }
    this.samples.push({ embedding, pose, frameTime })
    this.lastPose = pose
    if (this.samples.length < this.config.samples) return { kind: 'collecting' }
    if (minPairwise(this.embeddings()) < this.config.minConsistency) {
      this.restart(now)
      return { kind: 'restarted', reason: 'inconsistent' }
    }
    this.done = true
    return { kind: 'complete' }
  }

  /** Descarta um pedido de embedding que não pôde ser atendido. */
  cancelPending() {
    this.pendingFrame = null
  }

  private restart(now: number) {
    this.samples = []
    this.pendingFrame = null
    this.lastPose = null
    this.lastOkTime = now
  }
}

export function meanVector(vectors: Float32Array[]): Float32Array {
  const out = new Float32Array(vectors[0].length)
  for (const v of vectors) for (let i = 0; i < v.length; i++) out[i] += v[i] / vectors.length
  return out
}

export function minPairwise(vectors: Float32Array[]): number {
  let min = 1
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) min = Math.min(min, cosine(vectors[i], vectors[j]))
  }
  return min
}
