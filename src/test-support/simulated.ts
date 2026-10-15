// DADOS SIMULADOS — usados exclusivamente nos testes de lógica (vitest).
// Não são embeddings reais do SFace nem representam pessoas. Servem para exercitar
// regras de comparação, estabilização e cadastro com valores controlados.
import { l2Normalize } from '../recognition/embedding'

/** Gerador pseudoaleatório determinístico (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function simulatedIdentity(seed: number, dim = 128): Float32Array {
  const r = rng(seed)
  return l2Normalize(Array.from({ length: dim }, () => r() * 2 - 1))
}

/** Vetor unitário com similaridade de cosseno exata `target` em relação a `base`. */
export function withCosine(base: Float32Array, target: number, seed: number): Float32Array {
  const r = rng(seed)
  const noise = Array.from({ length: base.length }, () => r() * 2 - 1)
  let dot = 0
  for (let i = 0; i < base.length; i++) dot += noise[i] * base[i]
  const ortho = l2Normalize(noise.map((v, i) => v - dot * base[i]))
  const s = Math.sqrt(1 - target * target)
  return l2Normalize(Array.from(base, (v, i) => target * v + s * ortho[i]))
}

/** Pose simulada para os testes de cadastro. */
export function simulatedPose(dx = 0) {
  return { cx: 0.5 + dx, cy: 0.5, noseX: 0.5 + dx, noseY: 0.55, iod: 0.1 }
}
