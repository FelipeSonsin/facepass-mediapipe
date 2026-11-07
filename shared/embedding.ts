// Operações sobre embeddings do SFace, equivalentes a FaceRecognizerSF::match (FR_COSINE):
// cada vetor é normalizado (L2) e a similaridade é o produto interno.

export const EMBEDDING_SIZE = 128

export function l2Normalize(v: ArrayLike<number>): Float32Array {
  let sum = 0
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i]
  const norm = Math.sqrt(sum)
  if (!Number.isFinite(norm) || norm === 0) throw new Error('Embedding inválido (norma zero ou não finita)')
  const out = new Float32Array(v.length)
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm
  return out
}

/** Similaridade de cosseno entre vetores já normalizados. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) throw new Error('Embeddings com tamanhos diferentes')
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot
}

export function isValidEmbedding(v: ArrayLike<number>): boolean {
  if (v.length !== EMBEDDING_SIZE) return false
  let sum = 0
  for (let i = 0; i < v.length; i++) {
    if (!Number.isFinite(v[i])) return false
    sum += v[i] * v[i]
  }
  return Math.abs(Math.sqrt(sum) - 1) < 1e-3
}
