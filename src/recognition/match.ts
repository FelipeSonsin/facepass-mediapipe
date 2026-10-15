// Comparação de um embedding da câmera com os cadastros.
//
// Regra de combinação das amostras (MATCHING.topK): a pontuação de cada pessoa é a média
// das K maiores similaridades de cosseno entre o embedding do quadro e as amostras dela.
// Decisão:
//   - nenhuma pessoa com pontuação ≥ acceptThreshold        → desconhecido
//   - 2+ pessoas e (melhor − segunda) < ambiguityMargin       → ambíguo
//   - caso contrário                                          → correspondência
// Nunca se escolhe "a mais parecida" quando a semelhança é insuficiente.
import { MATCHING } from '../config/recognition'
import { cosine } from './embedding'

export interface Enrolled {
  id: string
  samples: readonly Float32Array[]
}

export type MatchOutcome =
  | { kind: 'match'; personId: string; score: number; secondScore: number | null }
  | { kind: 'unknown'; bestScore: number | null }
  | { kind: 'ambiguous'; personId: string; score: number; secondScore: number }

export interface MatchConfig {
  acceptThreshold: number
  ambiguityMargin: number
  topK: number
}

export function personScore(embedding: Float32Array, samples: readonly Float32Array[], topK: number): number {
  const sims = samples.map((s) => cosine(embedding, s)).sort((a, b) => b - a)
  const k = Math.min(topK, sims.length)
  let sum = 0
  for (let i = 0; i < k; i++) sum += sims[i]
  return sum / k
}

export function matchEmbedding(embedding: Float32Array, people: readonly Enrolled[], config: MatchConfig = MATCHING): MatchOutcome {
  let best: { id: string; score: number } | null = null
  let second: number | null = null
  for (const p of people) {
    if (p.samples.length === 0) continue
    const score = personScore(embedding, p.samples, config.topK)
    if (!best || score > best.score) {
      if (best) second = best.score
      best = { id: p.id, score }
    } else if (second === null || score > second) {
      second = score
    }
  }
  if (!best || best.score < config.acceptThreshold) return { kind: 'unknown', bestScore: best?.score ?? null }
  if (second !== null && best.score - second < config.ambiguityMargin) {
    return { kind: 'ambiguous', personId: best.id, score: best.score, secondScore: second }
  }
  return { kind: 'match', personId: best.id, score: best.score, secondScore: second }
}
