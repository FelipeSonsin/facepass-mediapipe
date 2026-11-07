// Usa DADOS SIMULADOS (src/test-support/simulated.ts), não embeddings reais.
import { describe, expect, it } from 'vitest'
import { matchEmbedding, personScore } from './match'
import { simulatedIdentity, withCosine } from '../test-support/simulated'

const cfg = { acceptThreshold: 0.45, ambiguityMargin: 0.08, topK: 3 }
const probe = simulatedIdentity(1)
const samplesAt = (sims: number[], seed: number) => sims.map((s, i) => withCosine(probe, s, seed * 100 + i))

describe('matchEmbedding', () => {
  it('aceita a pessoa quando a pontuação supera o limiar e não há concorrente próxima', () => {
    const r = matchEmbedding(
      probe,
      [
        { id: 'ana', samples: samplesAt([0.7, 0.68, 0.66, 0.6, 0.5], 1) },
        { id: 'bia', samples: samplesAt([0.2, 0.1, 0.15, 0.1, 0.05], 2) },
      ],
      cfg,
    )
    expect(r).toMatchObject({ kind: 'match', personId: 'ana' })
  })

  it('não escolhe a mais parecida quando a semelhança é insuficiente', () => {
    const r = matchEmbedding(probe, [{ id: 'ana', samples: samplesAt([0.44, 0.4, 0.38, 0.3, 0.2], 3) }], cfg)
    expect(r.kind).toBe('unknown')
  })

  it('rejeita resultado ambíguo entre duas pessoas cadastradas', () => {
    const r = matchEmbedding(
      probe,
      [
        { id: 'ana', samples: samplesAt([0.62, 0.6, 0.6, 0.5, 0.5], 4) },
        { id: 'bia', samples: samplesAt([0.58, 0.56, 0.55, 0.5, 0.4], 5) },
      ],
      cfg,
    )
    expect(r.kind).toBe('ambiguous')
  })

  it('aceita quando a diferença para a segunda pessoa é suficiente', () => {
    const r = matchEmbedding(
      probe,
      [
        { id: 'ana', samples: samplesAt([0.62, 0.6, 0.6, 0.5, 0.5], 6) },
        { id: 'bia', samples: samplesAt([0.5, 0.5, 0.5, 0.4, 0.4], 7) },
      ],
      cfg,
    )
    expect(r).toMatchObject({ kind: 'match', personId: 'ana' })
  })

  it('uma única amostra parecida por acaso não basta (média das 3 melhores)', () => {
    const samples = samplesAt([0.9, 0.2, 0.2, 0.1, 0.1], 8)
    expect(personScore(probe, samples, 3)).toBeCloseTo((0.9 + 0.2 + 0.2) / 3, 5)
    expect(matchEmbedding(probe, [{ id: 'ana', samples }], cfg).kind).toBe('unknown')
  })

  it('sem cadastros, o resultado é desconhecido', () => {
    expect(matchEmbedding(probe, [], cfg).kind).toBe('unknown')
  })
})
